import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { recommendTeams, findExactTeamMatch, findRealUsageTeamMatch, scoreTeam, orderMembersForDisplay, fallbackBeatsFlexArchetype } from '@/lib/synergyEngine';
import characterInvestmentNotes from '@/data/characterInvestmentNotes.json';
import metaStats from '@/data/metaStats.json';
import synergyNotes from '@/data/synergyNotes.json';
import { PROMPT_VERSION, systemPrompt, userPrompt, MODE_SLICE, OUTPUT_SCHEMA, selectSynergyForRoster } from '@/lib/aiTeamPrompt';
import { verifyAiTeam } from '@/lib/aiTeamVerify';
import { buildExplainPrompt, explainRequest, extractJson } from '@/lib/aiExplainPrompt';

// 보유 로스터에서 5인 조합을 추천하는 API.
//
// 2026-08-07 근본 수정: 유저가 이 세션에서 여러 차례("왜 자꾸 다중 조합에 추가 점수를 주는거야?
// 조합에 있는 니케 점수만 따지라고 했잖아") 반복 지적함. 그전까지는 AI에게 자유 구성을 맡기되
// 시스템 프롬프트가 "완전 보유 아키타입 최우선, 개별 티어만 보고 고르는 방식은 금지"라고 강제하고
// 있어, 등록된 아키타입이 아니면 티어가 훨씬 높아도 절대 후보에 오르지 못하는 문제가 있었다.
// AI 자유 구성을 없애고 recommendTeams()(순수 개별 티어 합 최고 조합, 등록 여부 무관)로 완전히
// 바꿨다가, 이번엔 "선정 과정에서 프리드웬 아키타입 대조가 아예 빠졌다"는 지적을 받았다.
//
// 2026-08-07 수정(4차, 최종): 유저가 "검증된 조합이기 때문에 동일한 조합이 있으면 먼저 선정한다.
// 대신 그 조합이 캠페인/보스/PVP 중 어디용인지 분류해서 요청에 맞게 답하고, 부합하는 조합이
// 여럿이면 티어 합이 높은 쪽을 선택하라"고 정확히 지시함. 이는 lib/synergyEngine.js의
// findExactTeamMatch()가 이미 하는 일과 정확히 같다 — synergyNotes.archetypes(prydwen 검증
// 조합)를 요청 모드와 호환되는 것만(MODE_COMPAT) 필터링하고, 5명 전원을 보유한 것 중 티어 합이
// 가장 높은 것을 고른다(더 이상 아키타입 개수로 점수가 쌓이지 않고, 순수 티어 합으로만 비교).
// 그래서 findExactTeamMatch를 1순위로 복원하고, 등록된 완전일치 조합이 하나도 없을 때만
// recommendTeams(전체 로스터 대상 순수 티어 탐색)로 폴백한다. 그때는 "구성"에 AI가 전혀
// 관여하지 않았고, AI는 이미 확정된 5명이 왜 좋은지 설명하는 문장만 작성했다.
// ⚠️ 지금 순서는 enikk 실사용 완전일치 → prydwen 아키타입 → 폴백이고(아래 7차 주석), 2026-09-15부터는 **폴백 구간에서만**
//    AI_TEAMS_MODE=shadow|on이면 AI가 5명을 구성한다(shadow = 호출·기록만, 화면은 엔진 답). 아래 "AI 조합 구성" 절.
//
// 2026-08-07 수정(5차): 유저가 "포메이션 기준으로 선정되는 느낌이 난다"고 재차 지적해, 결과
// 화면의 포메이션 라벨과 선정 로직 내부의 '포메이션' 개념을 완전히 제거했다(lib/synergyEngine.js
// 참고). 이 파일의 응답에서도 team.formation 필드를 더 이상 내려주지 않는다.
export const runtime = 'nodejs';
// 2026-08-03 수정: 유저가 "AI 추천 버튼을 눌러도 아무것도 안 나온다"고 제보. 실제로 재현해보니
// 응답 자체는 오지만(200 OK) 로스터가 크면(20명 이상) 프롬프트가 커져 30~40초 가까이 걸림.
// Vercel의 기본 함수 실행 제한(설정 안 하면 플랜 기본값, Hobby 기준 상당히 짧음)에 걸려 응답이
// 오기 전에 함수가 죽으면 프론트는 별다른 에러 없이 "구성하는 중..."에서 멈춘 것처럼 보인다.
// maxDuration을 명시적으로 늘려 큰 로스터에서도 안전하게 끝까지 응답하도록 한다(Hobby 플랜 상한 60초).
export const maxDuration = 60;

const DAILY_LIMIT = 30;

// 일일 총 호출 상한 (서킷 브레이커) — 2026-08-09 추가.
//
// 기존 DAILY_LIMIT은 IP 해시당 하루 30회다. IP가 많아지면 총액은 얼마든지 늘어나므로,
// 트래픽이 몰리거나 크롤러가 붙으면 청구를 막을 수단이 전혀 없었다. 광고를 붙이고 공개하기
// 전에 반드시 필요한 안전장치다(HANDOFF §6).
//
// 기본값 1,000회/일 근거: 2026-08-08 실측으로 1건당 약 4.9원이므로 하루 1,000건 = 약 4,900원,
// 월 약 14.7만원. 이건 "여기까지는 감수한다"가 아니라 **폭주를 끊는 천장**이다.
// 환경변수 AI_DAILY_GLOBAL_LIMIT로 배포 없이 조정할 수 있다.
//
// 세는 대상은 **실제로 Anthropic API를 호출한 횟수뿐**이다. 캐시 적중은 비용이 0이라 세지 않고,
// 상한에 걸려도 캐시된 설명은 그대로 나간다.
const DAILY_GLOBAL_LIMIT = Number(process.env.AI_DAILY_GLOBAL_LIMIT || 1000);

// 2026-08-08 변경: claude-sonnet-5 -> claude-haiku-4-5.
//
// 이 엔드포인트에서 AI가 하는 일은 "이미 확정된 5인 조합과 그 근거를 자연스러운 한 문단으로
// 다시 쓰기"뿐이다. 조합 구성·점수·근거는 전부 lib/synergyEngine.js가 결정하므로 추론 능력이
// 필요한 작업이 아니다. 반면 비용 차이는 크다 — Sonnet 5 $2/$10(per 1M), Haiku 4.5 $1/$5.
// (09-01에 $3/$15로 오른다던 인상은 취소됐다 — 공식 요금표 확인 2026-09-27)
//
// 되돌리기 쉽게 환경변수로 뺐다. 설명 품질이 떨어진다고 판단되면 Vercel 환경변수에
// AI_EXPLAIN_MODEL=claude-sonnet-5 를 넣으면 코드 수정 없이 원복된다.
const MODEL = process.env.AI_EXPLAIN_MODEL || 'claude-haiku-4-5';

// ---------------------------------------------------------------------------
// AI 조합 구성 (2026-09-15, docs/ai-teams-plan.md). 유저 결정: 예산 10,000원/일 · 소넷 · 폴백 구간만.
//
// **폴백 구간에서만** AI가 5명을 고른다. 실사용 완전일치·아키타입 경로가 열리면 지금처럼 엔진 답이다 —
// 얇은 로스터 40건 A/B에서 AI가 이긴 곳이 전부 폴백이었고, 실사용 조합은 AI가 이길 이유도 판정할
// 방법도 없다(§1). 엔진은 검산기(lib/aiTeamVerify.js)로 남는다.
//
//   AI_TEAMS_MODE   off(코드 기본) | shadow(호출하고 기록만, 화면은 엔진 답 — 운영은 2026-09-21부터 이것) | on(폴백을 AI 답으로)
//   AI_TEAM_MODEL   기본 claude-sonnet-5. ⚠️ 2026-09-26 유저 결정: 소넷 건당 약 67원은 광고로 못 덮는다 → 엔진 개선 우선,
//                   AI는 하이쿠로 되는지 실험 중(scripts/experimentHaikuPick.mjs — 자유 구성이 아니라 엔진 후보 고르기). docs/open-items.md
//   AI_DAILY_BUDGET_KRW  하루 원 단위 천장(기본 10,000원). 지출이 아니라 차단선 — 실제로 쓴 만큼만 나간다.
//       조합 구성 1건 실측 ≈ 67원(소넷, 28명, 2026-09-25 — 설계 추정 19~52원보다 높았다). 설명 1건 ≈ 4.9원. 둘 다 여기 합산한다.
//       닿으면 그날은 엔진 폴백 답 + budgetExhausted 표시. 되돌리기 = 환경변수 하나.
const AI_TEAMS_MODE = ['off', 'shadow', 'on'].includes(process.env.AI_TEAMS_MODE) ? process.env.AI_TEAMS_MODE : 'off';
const AI_TEAM_MODEL = process.env.AI_TEAM_MODEL || 'claude-sonnet-5';
const AI_DAILY_BUDGET_KRW = Number(process.env.AI_DAILY_BUDGET_KRW || 10000);
// 단가(USD / 1M 토큰, 2026-06 요금표) — scripts/experimentAiTeams.mjs와 같은 표. $1 = 1,400원.
const USD_KRW = 1400;
const PRICE_USD_PER_M = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  // 하이쿠 5.5(2026-10-07): 프롬프트 10만 토큰 이하 단가. 설명·조합 프롬프트는 그보다 훨씬 작다.
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
};
// 응답 usage → 원. 모르는 모델이면 소넷 단가로 잡는다(싸게 잡아서 천장이 조용히 높아지는 쪽보다 낫다).
function costKrw(model, usage) {
  const p = PRICE_USD_PER_M[model] || PRICE_USD_PER_M['claude-sonnet-5'];
  const inTok = (usage?.input_tokens || 0) + (usage?.cache_creation_input_tokens || 0) * 1.25 + (usage?.cache_read_input_tokens || 0) * 0.1;
  const usd = (inTok * p.in + (usage?.output_tokens || 0) * p.out) / 1e6;
  return Math.round(usd * USD_KRW * 100) / 100;
}

const MODE_LABEL = { campaign: '캠페인', bossing: '보스전', pvp: 'PvP', tribe_tower: '타워' };

// 기업 타워 선택지. lib/synergyEngine.js의 TOWER_CORPS와 일치해야 한다.
// (타워 이름표는 lib/engineReasons.js가 언어별로 들고 있다 — tower_elysion 등)
// 클라이언트 값을 그대로 믿지 않고 이 목록으로 검증한다 — 엉뚱한 값이 오면 엔진이 로스터를
// 통째로 걸러내 "조합을 만들 수 없습니다"만 나오고 원인을 알기 어렵다.
const TOWER_CORP_SET = new Set(['elysion', 'missilis', 'tetra', 'pilgrim']);
const TOWER_LABEL_KO = { elysion: '엘리시온', missilis: '미실리스', tetra: '테트라', pilgrim: '필그림/오버스펙' };
// 모드별 아키타입 호환 필터링(campaign↔tribe_tower, bossing↔raid 등)은 이제
// lib/synergyEngine.js의 findExactTeamMatch() 안에서 처리하므로 여기서는 필요 없다.

const LANG_NAMES = { ko: '한국어', en: '영어(English)', ja: '일본어(日本語)' };

const INVESTMENT_NOTE_BY_NAME = new Map(characterInvestmentNotes.characters.map((c) => [c.name, c]));

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// 참고: 테이블 이름이 ai_explain_usage인 것은 과거 app/api/ai-explain 라우트가 먼저 이 테이블을
// 만들었기 때문이다. 그 라우트는 어디에서도 호출되지 않는 죽은 코드여서 2026-08-07에 삭제했고,
// 이제 이 테이블을 쓰는 곳은 여기 하나뿐이다. 이름을 바꾸려면 Supabase 마이그레이션이 필요해
// (기존 사용량 기록이 끊길 수 있음) 그대로 두었다. supabase/ai_rate_limit_migration.sql 참고.
// 2026-08-08 수정: 검사와 증가를 분리했다.
// 예전에는 요청을 받자마자 사용 횟수를 올렸는데, 캐시가 생긴 뒤로는 그러면 안 된다 —
// 캐시에 적중한 요청은 API를 호출하지 않아 비용이 0인데도 사용자의 하루 할당량을 깎기 때문이다.
// 이제 진입 시점에는 한도 초과 여부만 읽고, 실제로 API를 호출한 뒤에만 증가시킨다.
async function isOverDailyLimit(supabase, ipHash) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('ai_explain_usage')
    .select('count')
    .eq('ip_hash', ipHash)
    .eq('usage_date', today)
    .maybeSingle();
  if (error) {
    console.error('rate limit select error', error);
    return false; // 조회 실패 시 열어둠(사용자 차단보다 안전)
  }
  return Boolean(data && data.count >= DAILY_LIMIT);
}

async function incrementDailyUsage(supabase, ipHash) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('ai_explain_usage')
    .select('count')
    .eq('ip_hash', ipHash)
    .eq('usage_date', today)
    .maybeSingle();
  if (error) {
    console.error('rate limit select error', error);
    return;
  }
  if (data) {
    await supabase
      .from('ai_explain_usage')
      .update({ count: data.count + 1 })
      .eq('ip_hash', ipHash)
      .eq('usage_date', today);
  } else {
    await supabase.from('ai_explain_usage').insert({ ip_hash: ipHash, usage_date: today, count: 1 });
  }
}

// 일일 총 호출 상한 조회/증가 (supabase/ai_daily_budget_migration.sql 참고).
//
// 조회 실패 시에는 열어둔다 — Supabase가 잠깐 흔들렸다고 사이트 전체가 설명을 못 만드는 건
// 과하다. 다만 조용히 넘어가면 보호가 사라진 걸 아무도 모르므로, 눈에 띄는 태그로 로그를 남긴다.
async function isOverGlobalDailyLimit(supabase) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('ai_daily_budget')
    .select('count')
    .eq('usage_date', today)
    .maybeSingle();
  if (error) {
    console.error('[AI_BUDGET] 일일 총 상한 조회 실패 — 보호가 걸리지 않은 채로 진행합니다', error);
    return false;
  }
  return Boolean(data && data.count >= DAILY_GLOBAL_LIMIT);
}

// 원자적 증가. select 후 update 방식은 동시 요청에서 갱신이 유실돼 카운터가 실제보다 적게
// 남는데, 서킷 브레이커에서 그건 "보호가 조용히 약해지는" 방향이라 특히 나쁘다.
async function incrementGlobalDailyUsage(supabase) {
  const { error } = await supabase.rpc('increment_ai_daily_budget');
  if (error) console.error('[AI_BUDGET] 일일 총 사용량 증가 실패 — 카운터가 실제보다 낮습니다', error);
}

// 원 단위 예산 (supabase/ai_teams_migration.sql — ai_daily_budget.krw + add_ai_daily_cost()).
// 횟수 상한(위)은 그대로 두고 원 단위를 **추가**한다. 조합 구성은 건당 단가가 설명의 4~10배라
// 횟수로는 청구를 못 막는다(1,000회 = 1.9만~5.2만 원). 마이그레이션 전이면 krw 열이 없어 조회가
// 실패하는데, 그때는 **AI 조합 구성을 켜지 않는다**(보호 없이 도는 것보다 안 도는 게 낫다).
async function readDailyKrw(supabase) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('ai_daily_budget').select('krw').eq('usage_date', today).maybeSingle();
  if (error) {
    console.error('[AI_BUDGET] 원 단위 예산 조회 실패(마이그레이션 전?) — AI 조합 구성을 건너뜁니다', error);
    return null;
  }
  return Number(data?.krw || 0);
}
async function addDailyCost(supabase, krw) {
  if (!supabase || !krw) return;
  const { error } = await supabase.rpc('add_ai_daily_cost', { p_krw: krw });
  if (error) console.error('[AI_BUDGET] 원 단위 누적 실패 — 지출이 실제보다 낮게 기록됩니다', error);
}

// ---------------------------------------------------------------------------
// AI 설명문 캐시 (supabase/ai_explain_cache_migration.sql 참고)
//
// 엔진이 결정적이라 같은 입력이면 항상 같은 설명이 나온다. 로스터가 아니라 "AI에게 실제로
// 보내는 입력"을 해싱하므로, 서로 다른 로스터라도 같은 조합·같은 근거로 수렴하면 캐시를
// 공유한다. 반대로 엔진 로직이나 데이터가 바뀌어 근거 문장이 달라지면 키도 달라져서
// 자동으로 새 설명이 생성된다 — 별도 무효화 절차가 필요 없다.
function buildCacheKey({ mode, tower, langKey, members, reasons, archetypeNote, treasureIdSet }) {
  const payload = JSON.stringify({
    // 프롬프트를 크게 바꿔 기존 캐시를 통째로 버려야 할 때 올린다.
    // v2(2026-08-08): 프롬프트로 보내는 근거 문장에 길이 상한을 두고 아키타입 노트 중복을 제거.
    // v3(2026-08-15): 조합의 **구조**(누가 딜러이고 누가 토템인지)를 반드시 쓰도록 지시 추가.
    //   안 올리면 이미 캐시된 조합은 옛 설명이 그대로 나가서 이 수정이 아무 효과가 없다.
    v: 3,
    mode,
    // 2026-08-09: 기업 타워 추가. 멤버·근거가 달라지면 키도 달라지지만, 타워만 다르고
    // 결론이 같은 경우가 있을 수 있어 명시적으로 넣는다(설명 문장에 타워 이름이 들어간다).
    tower: tower || null,
    lang: langKey,
    members: members.map((c) => `${c.title}${treasureIdSet.has(c.id) ? '+T' : ''}`),
    reasons: reasons || [],
    note: archetypeNote || '',
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function readCache(supabase, cacheKey) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('ai_explain_cache')
    .select('reasoning, hits')
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (error) {
    console.error('cache read error', error);
    return null; // 캐시 실패는 기능 실패가 아니다 — 그냥 새로 만든다
  }
  if (!data) return null;
  // 적중 통계 갱신은 응답을 늦출 이유가 없으므로 기다리지 않는다.
  supabase
    .from('ai_explain_cache')
    .update({ hits: (data.hits || 0) + 1, last_hit_at: new Date().toISOString() })
    .eq('cache_key', cacheKey)
    .then(null, (e) => console.error('cache hit update error', e));
  return data.reasoning || null;
}

async function writeCache(supabase, cacheKey, reasoning, langKey, mode) {
  if (!supabase || !reasoning) return;
  const { error } = await supabase
    .from('ai_explain_cache')
    .upsert({ cache_key: cacheKey, reasoning, lang: langKey, mode }, { onConflict: 'cache_key' });
  if (error) console.error('cache write error', error);
}

// ---------------------------------------------------------------------------
// AI 조합 구성 — 캐시·예산·검산·기록 (docs/ai-teams-plan.md §1·§4·§6)

// 응답 캐시 키. 로스터가 글자 그대로 같을 때만 적중한다 — 부분집합 공유는 안 한다(한 명이 늘면 답이
// 바뀌는 게 정상). lang은 뺀다(조합은 언어와 무관, 설명은 ai_explain_cache가 언어별로 따로 캐시).
// temperature 0만으로는 같은 답이 보장되지 않는다(소넷이 같은 문항에 8/20만 같은 답) — 이 캐시가 결정성을 만든다.
function buildAiTeamCacheKey({ ids, mode, boss, tower }) {
  const payload = JSON.stringify({ v: PROMPT_VERSION, model: AI_TEAM_MODEL, ids: [...ids].sort(), mode, boss: boss || null, tower: tower || null });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function extractJsonLoose(text) {
  try { return JSON.parse(text); } catch { /* 아래로 */ }
  return extractJson(text);
}

// 소넷에게 5명을 고르게 한다. 프롬프트는 실험과 같은 lib/aiTeamPrompt.js(v3). 검산에 걸리면 위반 사유를 붙여
// **한 번만** 다시 묻고, 그래도 걸리면 null(호출부가 엔진 폴백을 쓴다). 반환에 usage·latency를 실어 예산과 shadow 기록에 쓴다.
async function composeTeamWithAi(client, characters, { mode, boss, tower }) {
  const roster = [...characters].sort((a, b) => a.title.localeCompare(b.title));
  const system = systemPrompt(roster, {
    variant: 'tier',
    metaStats,
    slice: MODE_SLICE[mode] || 'campaign',
    synergy: selectSynergyForRoster(synergyNotes, roster.map((c) => c.title), mode),
    elementCycle: synergyNotes.mechanics?.elementCycle || null,
  });
  const user = userPrompt({ mode, boss: boss || null, tower: tower || null });
  const messages = [{ role: 'user', content: user }];
  // thinking_tokens: 출력 토큰 중 '생각'의 몫. effort를 안 줘도 소넷 5는 생각한다 — 같은 모델로 돌린 12문항 실험에서
  // 출력의 약 83%가 생각이었다(2026-09-21, docs/log). 이걸 안 남기면 "reasoning 글이 길어서 비싸다"와
  // "생각이 길어서 비싸다"를 못 가른다. output_tokens에 이미 포함된 값이라 비용 계산(costKrw)에는 쓰지 않는다.
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, thinking_tokens: 0 };
  const t0 = Date.now();
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client.messages.create({
      model: AI_TEAM_MODEL,
      // ⚠️ max_tokens·effort는 **실험(scripts/experimentAiTeams.mjs --live, 73.4%)과 같은 값**이어야 한다 — testAiTeamSchema가 대조한다.
      //    2026-09-25 shadow 12건 중 5건이 답 없이 끝났다: 1500이던 상한을 소넷의 생각(기본 effort high)이 다 써서
      //    두 번 다 stop=max_tokens(출력 정확히 1500×2). 성공한 건도 대부분 첫 시도가 잘려 재요청 — 입력 1.8만 토큰을 두 번 냈다.
      //    같은 고장을 실험 쪽은 09-21에 겪고 8000으로 고쳤는데 운영엔 옮기지 않았었다.
      max_tokens: 8000,
      // ⚠️ temperature를 넣지 말 것 — 소넷 5는 받지 않는다(2026-09-21 shadow 실측:
      //    400 "`temperature` is deprecated for this model."). 어차피 결정성은 temperature가
      //    아니라 ai_team_cache가 만든다(같은 로스터 → 저장된 답). scripts/testAiTeamSchema.mjs가 막는다.
      system,
      messages,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    });
    for (const k of Object.keys(usage)) usage[k] += msg.usage?.[k] || 0;
    usage.thinking_tokens += msg.usage?.output_tokens_details?.thinking_tokens || 0;   // 최상위 키가 아니라 위 루프로는 0이 더해진다
    const text = msg.content?.find((c) => c.type === 'text')?.text || '';
    const out = extractJsonLoose(text);
    const v = verifyAiTeam(out?.members, characters, { tower });
    // 상한에 걸려 잘린 답은 "0명"이 아니라 잘림으로 적는다 — 그래야 shadow 기록에서 원인이 보인다.
    // 같은 요청을 다시 보내도 또 잘리므로 재요청하지 않는다(입력 토큰만 두 번 낸다).
    const truncated = msg.stop_reason === 'max_tokens';
    const flaws = truncated ? [`Truncated at max_tokens (stop_reason=max_tokens).`, ...v.flaws] : v.flaws;
    last = { members: out?.members || null, reasoning: out?.reasoning || '', flaws, resolved: v.resolved, retried: attempt > 0 };
    if (v.ok || truncated) break;
    // 재요청: 위반 사유를 그대로 붙인다(영문 한 줄들 — verifyAiTeam이 그 용도로 만든다).
    messages.push({ role: 'assistant', content: text || '{}' });
    messages.push({ role: 'user', content: `Your team violates the rules:\n- ${v.flaws.join('\n- ')}\nReturn a corrected team of exactly 5 members from the roster.` });
  }
  return { ...last, usage, latencyMs: Date.now() - t0 };
}

// 폴백 구간에서 AI 조합을 시도한다. 캐시 → 예산 → 호출 → 검산 → 기록 순서.
// 반환: { team(엔진 응답과 같은 모양), reasoning, cached } 또는 null(예산 초과·검산 실패·오류 → 엔진 답 사용).
async function tryAiTeam({ client, supabase, characters, mode, boss, tower, treasureIdSet, langKey, engineTeam }) {
  const ids = characters.map((c) => c.id);
  const cacheKey = buildAiTeamCacheKey({ ids, mode, boss, tower });
  const byTitle = new Map(characters.map((c) => [c.title, c]));
  const toTeam = (resolvedChars, reasoning) => {
    const scored = scoreTeam(resolvedChars, mode, { treasureIds: treasureIdSet, bossElement: boss || null, lang: langKey });
    return {
      members: orderMembersForDisplay(resolvedChars, mode, treasureIdSet).map((m) => ({ id: m.id, title: m.title, name_kr: m.name_kr, name_ja: m.name_ja || null, burst: m.burst, img: m.img || null })),
      totalScore: scored.tierTotal,
      reasons: scored.reasons,
      bossDefenseNote: scored.bossDefenseNote || null,
      pvpBurstNote: scored.pvpBurstNote || null,
      aiReasoning: reasoning,
    };
  };

  // 1) 캐시
  const { data: hit, error: cacheErr } = await supabase.from('ai_team_cache').select('members, reasoning, hits').eq('cache_key', cacheKey).maybeSingle();
  if (cacheErr) { console.error('[AI_TEAM] 캐시 조회 실패 — AI 조합 구성을 건너뜁니다(마이그레이션 전?)', cacheErr); return null; }
  if (hit && Array.isArray(hit.members)) {
    const resolved = hit.members.map((t) => byTitle.get(t)).filter(Boolean);
    if (resolved.length === 5) {
      supabase.from('ai_team_cache').update({ hits: (hit.hits || 0) + 1, last_hit_at: new Date().toISOString() }).eq('cache_key', cacheKey).then(null, (e) => console.error('[AI_TEAM] cache hit update error', e));
      return { team: toTeam(resolved, hit.reasoning || ''), reasoning: hit.reasoning || '', cached: true };
    }
  }

  // 2) 예산(원)
  const spent = await readDailyKrw(supabase);
  if (spent == null) return null;
  if (spent >= AI_DAILY_BUDGET_KRW) {
    console.warn(`[AI_BUDGET] 일일 예산 ${AI_DAILY_BUDGET_KRW}원 도달(${spent}원) — AI 조합 구성을 건너뛰고 엔진 폴백 답을 냅니다`);
    return { budgetExhausted: true };
  }

  // 3) 호출 + 검산
  let res;
  try {
    res = await composeTeamWithAi(client, characters, { mode, boss, tower });
  } catch (err) {
    console.error('[AI_TEAM] compose error', err);
    return null;
  }
  const krw = costKrw(AI_TEAM_MODEL, res.usage);
  await addDailyCost(supabase, krw);
  const ok = res.flaws.length === 0 && res.resolved.length === 5;
  const engineTitles = new Set((engineTeam?.members || []).map((m) => m.title));
  const identical = ok && res.resolved.every((c) => engineTitles.has(c.title));

  // 4) 기록 — shadow든 on이든 실제 호출은 전부 남긴다. 여기서 규칙 위반률·엔진과의 차이·비용·지연을 잰다(§6).
  supabase.from('ai_team_shadow').insert({
    mode, boss: boss || null, tower: tower || null,
    roster_hash: cacheKey, roster_size: characters.length,
    engine_members: (engineTeam?.members || []).map((m) => m.title),
    ai_members: res.members, flaws: res.flaws, identical,
    cost_krw: krw, latency_ms: res.latencyMs, model: AI_TEAM_MODEL, prompt_version: PROMPT_VERSION,
    retried: res.retried, served_ai: AI_TEAMS_MODE === 'on' && ok,
    usage: res.usage,
  }).then(({ error }) => { if (error) console.error('[AI_TEAM] shadow insert error', error); });

  if (!ok) {
    console.warn('[AI_TEAM] 검산 실패 — 엔진 폴백 답을 냅니다', res.flaws);
    return null;
  }
  // 검산을 통과한 답만 캐시한다. 위반 답이 박히면 그 로스터는 영영 잘못된 조합을 받는다.
  supabase.from('ai_team_cache').upsert({
    cache_key: cacheKey, members: res.resolved.map((c) => c.title), reasoning: res.reasoning,
    model: AI_TEAM_MODEL, prompt_version: PROMPT_VERSION, mode,
  }, { onConflict: 'cache_key' }).then(({ error }) => { if (error) console.error('[AI_TEAM] cache write error', error); });

  return { team: toTeam(res.resolved, res.reasoning), reasoning: res.reasoning, cached: false };
}



// composeNote(2026-09-15): AI가 조합을 직접 구성한 경우 그때의 영문 이유. 설명 프롬프트에 참고로 실어
// 구성 의도(예: "Crust's distributed-damage buff feeds Yukiko")가 설명 문장에 이어지게 한다.
// 반환은 { reasoning, usage } — usage로 원 단위 예산에 합산한다(옛 반환은 문자열이었다).
async function explainChosenTeam(client, fullMembers, reasons, archetypeNote, mode, modeLabel, treasureIdSet, langName, composeNote = null) {
  const { system, userContent } = buildExplainPrompt({
    fullMembers, reasons, archetypeNote, mode, modeLabel, treasureIdSet, langName, composeNote, noteByName: INVESTMENT_NOTE_BY_NAME,
  });

  try {
    // 요청 본문은 lib/aiExplainPrompt.js explainRequest — 2026-08-08: thinking을 뺐다(이미 정해진 사실을 옮기는 일이라 추론이 필요 없고
    // 생각 토큰이 비용의 절반). 생각이 기본으로 켜진 모델(하이쿠 5.5 등)은 거기서 명시적으로 끈다.
    const msg = await client.messages.create(explainRequest(MODEL, system, userContent));
    const rawText = msg.content?.find((c) => c.type === 'text')?.text || '';
    const text = msg.stop_reason === 'stop_sequence' ? `${rawText}}` : rawText;
    const parsed = extractJson(text);
    if (parsed?.reasoning) return { reasoning: parsed.reasoning, usage: msg.usage || null };
    console.error('explainChosenTeam: failed to parse response', { stopReason: msg.stop_reason, textPreview: text.slice(0, 500) });
  } catch (err) {
    console.error('explainChosenTeam error', err);
  }
  // 2026-08-08 수정: 실패 시 폴백 문장을 여기서 만들어 반환하면, 호출부가 그것을 정상 응답으로
  // 착각해 캐시에 저장한다. 그러면 열화된 문장이 그 조합에 영구히 박힌다. 실패는 실패로 알린다.
  return null;
}

// AI 호출이 실패했거나 일일 상한에 걸렸을 때 보여줄 대체 문장. 캐시에는 저장하지 않는다.
//
// 2026-08-11~2026-08-25: 예전엔 reasons가 한국어 전용이라 다른 언어에서는 근거를 버리고
// 아래 일반 문장만 내보냈다. 이제 엔진이 opts.lang으로 사용자 언어의 근거를 만들므로
// (lib/engineReasons.js) 언어와 무관하게 근거 문장을 그대로 쓴다. 일반 문장은 근거가
// 하나도 없을 때의 최후 수단으로만 남는다.
const FALLBACK_GENERIC = {
  ko: '보유 캐릭터 중 이 모드 티어 점수 합이 가장 높은 조합입니다.',
  en: 'This is the team with the highest combined tier score for this mode among the Nikkes you own.',
  ja: '所持ニケの中で、このモードのティアスコア合計が最も高い編成です。',
};

function fallbackReasoning(reasons, langKey = 'ko') {
  const generic = FALLBACK_GENERIC[langKey] || FALLBACK_GENERIC.ko;
  return (reasons || []).slice(0, 3).join(' ') || generic;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.', errorKey: 'api_err_bad_request' }, { status: 400 });
  }

  const { characters, treasureIds, mode, bossElement, tower, excludeTitles, lang } = body || {};
  // 기업 타워는 tribe_tower 모드에서만 의미가 있다. 다른 모드에 딸려오면 무시한다.
  const towerKey = mode === 'tribe_tower' && TOWER_CORP_SET.has(tower) ? tower : null;

  if (!Array.isArray(characters) || characters.length === 0) {
    return Response.json({ error: '보유중인 캐릭터를 먼저 선택해주세요.', errorKey: 'api_err_no_roster' }, { status: 400 });
  }

  // 하드 제약(버스트 I/II/III 각 1명 이상)은 호출 전에 미리 걸러 불필요한 API 비용을 막는다.
  const burstValues = new Set(characters.map((c) => String(c.burst)));
  if (!burstValues.has('1') || !burstValues.has('2') || !burstValues.has('3')) {
    return Response.json(
      { error: '버스트 I/II/III 단계 캐릭터를 각각 최소 1명씩 보유해야 조합을 구성할 수 있습니다.', errorKey: 'api_err_need_all_bursts' },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'AI 추천 기능이 아직 설정되지 않았습니다. (관리자: Vercel 환경변수에 ANTHROPIC_API_KEY 추가 필요)', errorKey: 'api_err_not_configured' },
      { status: 503 }
    );
  }

  try {
    const treasureIdSet = new Set(treasureIds || []);

    let supabase = null;
    let ipHash = null;
    // 이 라우트는 서버에서만 돕니다. 그래서 공개 키가 아니라 service role 키를 씁니다.
    //
    // 왜 바꿨나 (2026-08-09): 예전엔 여기서도 NEXT_PUBLIC_SUPABASE_ANON_KEY를 썼는데,
    // 그러면 서버가 써야 하는 테이블(캐시·레이트리밋·일일예산)을 전부 anon에게 열어줘야 합니다.
    // 실제로 그 결과 **누구나 공개 키만으로 ai_explain_cache의 설명문을 바꿔 쓸 수 있었습니다.**
    // 캐시된 글은 모든 유저에게 그대로 나가므로 내용 변조 통로였습니다.
    //
    // ⚠️ service role 키는 RLS를 통째로 무시합니다. 절대 클라이언트로 내려보내지 말 것이고,
    // 이 파일에서만, 아래 세 테이블 용도로만 씁니다. 변수 이름에 NEXT_PUBLIC_을 붙이면
    // 번들에 실려 나가니 절대 붙이지 마세요.
    //
    // 키가 없으면 공개 키로 되돌아가지 않고 그냥 Supabase 연동을 끕니다. 되돌아가면
    // "고쳤다고 생각했는데 옛날 상태로 조용히 돌아가 있는" 최악의 경우가 되고,
    // 그건 §2-3이 말하는 조용한 누락 그 자체입니다. AI 설명은 캐시·레이트리밋 없이도
    // 동작하므로(캐시 미스로 취급) 기능이 죽지는 않습니다.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      ipHash = hashIp(getClientIp(req));
      if (await isOverDailyLimit(supabase, ipHash)) {
        return Response.json(
          { error: `오늘 사용 가능한 AI 추천 횟수(${DAILY_LIMIT}회)를 모두 사용했습니다. 내일 다시 시도해주세요.`, errorKey: 'api_err_daily_limit', errorArg: DAILY_LIMIT },
          { status: 429 }
        );
      }
    } else if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      // URL은 있는데 키만 없다 = 환경변수를 안 넣었다는 뜻. 이 경우 캐시도 레이트리밋도
      // 일일 상한도 전부 꺼진 채로 돌아가므로 비용이 무방비가 된다. 조용히 넘어가면 안 된다.
      console.error(
        '[AI_KEY] SUPABASE_SERVICE_ROLE_KEY가 없습니다 — 캐시·레이트리밋·일일 상한이 모두 꺼진 채로 동작합니다. ' +
        'Vercel 환경변수를 확인하세요.'
      );
    }

    const modeLabel = towerKey
      ? `${TOWER_LABEL_KO[towerKey]} 타워`
      : (MODE_LABEL[mode] || mode || '캠페인');
    const langKey = LANG_NAMES[lang] ? lang : 'ko';
    const langName = LANG_NAMES[langKey];
    const excludeSet = new Set(Array.isArray(excludeTitles) ? excludeTitles : []);

    // 조합 "구성"은 전부 여기서 결정된다 — AI는 관여하지 않는다.
    //
    // 2026-08-07(6차): "실사용 데이터를 우선하되, 보유 니케가 한정적이면 스킬 시너지 방향으로"
    // 라는 유저 지시에 따라 enikk 실사용을 1순위, prydwen 아키타입을 2순위로 두었다.
    //
    // 2026-08-08 수정(7차): 그 서열을 없애고 둘을 같은 층에 놓는다.
    //
    // 유저가 의도를 다시 밝혔다 — "검증된 조합"이란 "사람들이 두루두루 쓰는 조합" **또는**
    // "prydwen에 이미 등록된 조합"이며, 둘은 원래 대등한 개념이었다. 그런데 코드가 enikk을
    // 무조건 위에 두는 바람에 다음 문제가 실제로 발생했다:
    //
    //   유저 로스터 70명 기준, enikk 실사용 조합(크라운/나가/앨리스/D:킬러와이프/레드후드)이
    //   35점으로 채택되고, 42점짜리 prydwen 조합(Vesgod)은 아예 후보에 오르지도 못했다.
    //   문제의 enikk 조합은 캠페인 실사용 20건 중 평균 전투력이 가장 낮은(42만, 전체 평균
    //   89.7만) 저투자 계정용 구성이었다. "많이 쓰인다"가 "이 유저에게 좋다"는 뜻은 아니다.
    //
    // 그래서 이제 둘 다 계산해 점수로 비교하고, 진 쪽은 alternative로 함께 내려보내
    // 화면에서 나란히 볼 수 있게 한다(어느 쪽을 택할지는 사용자가 판단).
    // 동점이면 enikk 실사용을 택한다 — 실제 클리어 기록이 공략 등재보다 강한 근거다.
    //
    //   같은 층: enikk.app 실사용 5인 완전일치 / prydwen 아키타입 완전일치(빈 칸 자동 채움 포함)
    //   폴백   : 둘 다 없을 때만 보유 로스터 전체 조합 탐색
    //
    // 2026-08-19까지 여기에 "보스전은 enikk에 5인 조합 단위 기록이 없어 실사용 쪽이 항상
    // 빈다"고 적혀 있었는데 **틀린 결론이었다.** 시즌 페이지 Teams 탭에 조합이 그대로 있다.
    // 지금은 보스전도 data/soloRaidTeams.json으로 실사용 갈래가 뜬다.
    // 단 **선택한 보스 속성과 같은 약점 시즌만** 본다(속성이 다르면 조합의 전제가 다르다).
    // 그래서 속성을 안 고르면 시즌 전체에서 찾고, 근거 문장이 어느 보스였는지 밝힌다.
    let chosen;
    let archetypeNote = null;
    let matchSource;
    let alternative = null;
    let composeNote = null;        // AI가 조합을 구성했을 때의 영문 이유(설명 프롬프트 참고용)
    let aiTeamCached = false;
    let aiBudgetExhausted = false; // 원 단위 예산에 닿아 AI 조합 구성을 건너뛴 경우

    const matchOpts = {
      treasureIds: treasureIdSet,
      bossElement: bossElement || null,
      tower: towerKey,
      excludeTitles: Array.from(excludeSet),
      // 근거 문장을 사용자 언어로 조립한다(2026-08-25). 이 문장은 AI 프롬프트의 입력이자
      // 대체 조합 헤드라인·폴백 문장으로 화면에도 그대로 나간다.
      lang: langKey,
    };
    const realUsageMatch = findRealUsageTeamMatch(characters, mode, matchOpts);
    const exactMatch = findExactTeamMatch(characters, mode, matchOpts);

    // 2026-09-30: **빈 자리를 우리가 채운 아키타입**이 이기는 경우만 폴백 1위와 같은 잣대로 겨룬다
    // (lib/synergyEngine.js fallbackBeatsFlexArchetype — 유저 지시 "동일한 조합이면 먼저"는 5명이 다 정해진 조합 얘기다).
    // 폴백이 이기면 폴백 답을 내고 그 아키타입은 대안으로 보여준다. 이 경우 AI 조합 구성(셰도우 포함)은 건너뛴다 —
    // 호출이 늘어 비용이 커지는 것을 막으려고(2026-09-26 유저: 소넷 비용은 광고로 못 덮는다).
    let flexLoser = null;
    if (exactMatch?.flexSlotCount && !(realUsageMatch && realUsageMatch.totalScore >= exactMatch.totalScore)) {
      const probe = recommendTeams(characters, mode, {
        treasureIds: treasureIdSet, bossElement: bossElement || null, tower: towerKey, topN: 20, lang: langKey,
      }).teams || [];
      const top = probe.find((t) => !t.members.some((m) => excludeSet.has(m.title))) || probe[0];
      if (fallbackBeatsFlexArchetype(exactMatch, top, mode, matchOpts)) flexLoser = exactMatch;
    }

    const candidates = flexLoser ? [] : [
      // 2026-10-03: 4/5 일치 + 한 자리 채움은 꼬리표를 따로 — "실사용 검증"은 5명이 다 같은 기록일 때만이다
      realUsageMatch && { match: realUsageMatch, source: realUsageMatch.partial ? 'enikk-real-usage-partial' : 'enikk-real-usage', rank: 0 },
      exactMatch && { match: exactMatch, source: 'prydwen-exact-match', rank: 1 },
    ].filter(Boolean);

    if (candidates.length) {
      candidates.sort(
        (a, b) => (b.match.totalScore - a.match.totalScore) || (a.rank - b.rank)
      );
      const win = candidates[0];
      chosen = win.match;
      matchSource = win.source;
      archetypeNote = win.match.archetypeNote || null;

      // 진 쪽은 멤버 구성이 실제로 다를 때만 대안으로 내려보낸다(같으면 보여줄 이유가 없다).
      const lose = candidates[1];
      if (lose) {
        const key = (m) => m.members.map((x) => x.title).sort().join('|');
        if (key(lose.match) !== key(win.match)) {
          alternative = {
            source: lose.source,
            members: lose.match.members,
            totalScore: lose.match.totalScore,
            archetypeName: lose.match.archetypeName || null,
            // AI 설명은 붙이지 않는다 — 대안까지 생성하면 API 비용이 두 배가 된다.
            // 대신 규칙 기반 근거의 첫 문장만 실어 왜 후보였는지 알 수 있게 한다.
            headline: (lose.match.reasons || [])[0] || null,
          };
        }
      }
    } else {
      // 3순위(폴백): 등록된 실전 조합도 아키타입도 없을 만큼 로스터가 한정적인 경우.
      // 순위 1차 기준은 여전히 티어 합이고, 티어 합이 같은 후보들 사이에서만 스킬 시너지와
      // 전 아군 버퍼 수로 방향을 잡는다(recommendTeams의 정렬 주석 참고).
      const rec = recommendTeams(characters, mode, {
        treasureIds: treasureIdSet,
        bossElement: bossElement || null,
        tower: towerKey,
        topN: 20,
        lang: langKey,
      });

      if (!rec.teams || rec.teams.length === 0) {
        return Response.json(
          // rec.error는 엔진(engineReasons)이 만들어 **이미 요청 언어로 되어 있다**.
          // 그래서 errorKey는 rec.error가 없을 때의 폴백 문구에만 붙인다.
          { error: rec.error || '보유한 캐릭터로는 조건을 만족하는 조합을 만들 수 없습니다.', errorKey: rec.error ? undefined : 'api_err_no_team' },
          { status: 400 }
        );
      }

      // "다른 조합 보기": 이전에 보여준 멤버가 하나도 겹치지 않는 후보 중 1위를 우선 채택하고,
      // 로스터가 작아 그런 후보가 없으면 겹치더라도 순위상 1위를 그대로 채택한다.
      const pool = rec.teams.filter((t) => !t.members.some((m) => excludeSet.has(m.title)));
      chosen = (pool.length > 0 ? pool : rec.teams)[0];
      matchSource = 'skill-synergy-fallback';
      if (flexLoser) {
        alternative = {
          source: 'prydwen-exact-match',
          members: flexLoser.members,
          totalScore: flexLoser.totalScore,
          archetypeName: flexLoser.archetypeName || null,
          headline: (flexLoser.reasons || [])[0] || null,
        };
      }

      // 2026-09-15: 폴백 구간에서만 AI 조합 구성(docs/ai-teams-plan.md §1). "다른 조합 보기"(excludeTitles)는
      // 엔진 후보 순환이라 AI를 건너뛴다. Supabase가 없으면 캐시도 예산도 없으니 켜지 않는다.
      if (AI_TEAMS_MODE !== 'off' && supabase && excludeSet.size === 0 && !flexLoser) {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const ai = await tryAiTeam({
          client, supabase, characters, mode, boss: bossElement || null, tower: towerKey,
          treasureIdSet, langKey, engineTeam: chosen,
        });
        if (ai?.budgetExhausted) {
          aiBudgetExhausted = true;
        } else if (ai?.team && AI_TEAMS_MODE === 'on') {
          // 엔진 폴백 답은 대안으로 함께 내려보낸다 — 어느 쪽을 택할지는 사용자가 본다(§6-3).
          alternative = {
            source: 'skill-synergy-fallback',
            members: chosen.members,
            totalScore: chosen.totalScore,
            archetypeName: null,
            headline: (chosen.reasons || [])[0] || null,
          };
          chosen = ai.team;
          composeNote = ai.reasoning || null;
          aiTeamCached = ai.cached;
          matchSource = 'ai-composed';
        }
        // shadow: 호출·기록만 하고 화면은 엔진 답 그대로.
      }
    }

    const byTitle = new Map(characters.map((c) => [c.title, c]));
    const fullMembers = chosen.members.map((m) => byTitle.get(m.title)).filter(Boolean);

    // 조합이 확정된 뒤에 캐시를 조회한다. 여기까지의 계산은 전부 우리 서버 안에서 끝나므로
    // 비용이 들지 않고, 캐시에 맞으면 유료 API 호출을 통째로 건너뛴다.
    const cacheKey = buildCacheKey({
      mode,
      tower: towerKey,
      langKey,
      members: fullMembers,
      reasons: chosen.reasons,
      // AI 구성 이유도 설명 입력이므로 키에 넣는다(같은 5명이라도 구성 의도가 다르면 설명이 달라진다).
      archetypeNote: [archetypeNote, composeNote].filter(Boolean).join('\n') || null,
      treasureIdSet,
    });

    let aiReasoning = await readCache(supabase, cacheKey);
    let cached = Boolean(aiReasoning);

    // 캐시에 없을 때만 상한을 본다. 캐시 적중은 비용이 0이므로 상한에 걸려도 그대로 내보낸다.
    //
    // 상한에 걸려도 에러를 내지 않는다 — 조합 구성·점수·근거는 전부 엔진이 정하므로(§2-1)
    // AI 문장이 빠져도 사용자가 받는 결과물의 핵심은 그대로다. 사용자를 막는 것보다
    // 설명만 담백해지는 쪽이 낫다. (이 폴백 문장은 캐시에 저장하지 않는다 — 아래 참고)
    let budgetExhausted = false;
    if (!aiReasoning && supabase) {
      // 횟수 상한(옛) 또는 원 단위 예산(2026-09-15) — 둘 중 하나라도 닿으면 설명도 만들지 않는다.
      budgetExhausted = aiBudgetExhausted || (await isOverGlobalDailyLimit(supabase));
      if (budgetExhausted) {
        console.warn(`[AI_BUDGET] 일일 총 상한(${DAILY_GLOBAL_LIMIT}회) 도달 — AI 설명 생성을 중단하고 근거 문장으로 대체합니다`);
        aiReasoning = fallbackReasoning(chosen.reasons, langKey);
      }
    }

    if (!aiReasoning) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const generated = await explainChosenTeam(
        client,
        fullMembers,
        chosen.reasons,
        archetypeNote,
        mode,
        modeLabel,
        treasureIdSet,
        langName,
        composeNote
      );
      if (generated?.reasoning) {
        aiReasoning = generated.reasoning;
        // 실제로 돈을 쓴 요청만 사용자의 하루 할당량에서 차감한다.
        if (supabase && ipHash) await incrementDailyUsage(supabase, ipHash);
        // 전역 카운터도 같은 기준(실제 API 호출)으로 올린다. 원 단위 예산에도 합산한다(2026-09-15).
        if (supabase) await incrementGlobalDailyUsage(supabase);
        if (supabase && generated.usage) await addDailyCost(supabase, costKrw(MODEL, generated.usage));
        await writeCache(supabase, cacheKey, generated.reasoning, langKey, mode);
      } else {
        // AI 호출 실패. 근거 문장으로 대체하되 캐시에는 남기지 않는다 —
        // 열화된 문장이 캐시에 박히면 그 조합은 영영 제대로 된 설명을 못 받는다.
        aiReasoning = fallbackReasoning(chosen.reasons, langKey);
      }
    }

    return Response.json({
      team: {
        members: chosen.members,
        totalScore: chosen.totalScore,
        reasons: chosen.reasons,
        // 보스별 방어 구성 한 줄(없으면 null). reasons는 화면에 안 그리므로 따로 넘긴다(2026-09-13).
        // 캐시는 AI 설명문만 저장하므로 캐시 적중 때도 이 값은 매번 새로 계산돼 나간다.
        bossDefenseNote: chosen.bossDefenseNote || null,
        // PvP 버스트 속도 한 줄(PvP가 아니거나 값이 없는 멤버가 있으면 null). 2026-09-29
        pvpBurstNote: chosen.pvpBurstNote || null,
      },
      aiReasoning,
      // 'enikk-real-usage' | 'enikk-real-usage-partial'(2026-10-03, 4/5 + 한 자리) | 'prydwen-exact-match' | 'skill-synergy-fallback' | 'ai-composed'(2026-09-15, AI_TEAMS_MODE=on)
      model: matchSource,
      cached,
      // AI 조합 구성 경로가 응답 캐시에서 나왔는지(비용 0). 화면엔 안 그리고 관측용.
      aiTeamCached,
      // 2026-08-08: 점수 비교에서 진 쪽(실사용 vs prydwen)을 함께 내려준다.
      // 둘은 서로 다른 질문에 대한 답이라("검증된 조합이 뭐냐" vs "내 캐릭터로 제일 센 게 뭐냐")
      // 하나만 보여주면 나머지가 있었다는 사실 자체가 사용자에게 보이지 않는다.
      alternative,
      // 일일 총 상한에 걸려 AI 문장 없이 근거 문장으로 대체된 경우. 화면에서 안내를 띄운다 —
      // 아무 표시 없이 설명 품질만 떨어지면 사용자는 "왜 갑자기 설명이 딱딱해졌지"만 느낀다.
      budgetExhausted,
    });
  } catch (err) {
    console.error('ai-recommend error', err);
    return Response.json({ error: 'AI 추천을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', errorKey: 'api_err_internal' }, { status: 500 });
  }
}
