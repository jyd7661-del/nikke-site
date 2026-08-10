import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { recommendTeams, findExactTeamMatch, findRealUsageTeamMatch } from '@/lib/synergyEngine';
import characterInvestmentNotes from '@/data/characterInvestmentNotes.json';

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
// recommendTeams(전체 로스터 대상 순수 티어 탐색)로 폴백한다. 어느 경로든 "구성"은 AI가 전혀
// 관여하지 않고, AI는 이미 확정된 5명이 왜 좋은지 설명하는 문장만 작성한다.
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
// 필요한 작업이 아니다. 반면 비용 차이는 크다 — Sonnet 5는 2026-09-01부터 $3/$15(per 1M),
// Haiku 4.5는 $1/$5로 3배 싸다.
//
// 되돌리기 쉽게 환경변수로 뺐다. 설명 품질이 떨어진다고 판단되면 Vercel 환경변수에
// AI_EXPLAIN_MODEL=claude-sonnet-5 를 넣으면 코드 수정 없이 원복된다.
const MODEL = process.env.AI_EXPLAIN_MODEL || 'claude-haiku-4-5';

const MODE_LABEL = { campaign: '캠페인', bossing: '보스전', pvp: 'PvP', tribe_tower: '타워' };

// 기업 타워 선택지. lib/synergyEngine.js의 TOWER_CORPS / TOWER_LABEL과 일치해야 한다.
// 클라이언트 값을 그대로 믿지 않고 이 목록으로 검증한다 — 엉뚱한 값이 오면 엔진이 로스터를
// 통째로 걸러내 "조합을 만들 수 없습니다"만 나오고 원인을 알기 어렵다.
const TOWER_CORP_SET = new Set(['elysion', 'missilis', 'tetra', 'pilgrim']);
const TOWER_LABEL_KO = { elysion: '엘리시온', missilis: '미실리스', tetra: '테트라', pilgrim: '필그림/오버스펙' };
const MODE_TIER_KEY = { campaign: 'story', story: 'story', bossing: 'bossing', raid: 'bossing', pvp: 'pvp' };
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
    v: 2,
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

// 캐릭터의 실제 버스트 스킬 쿨타임(초). characterDatabase.json의 skills 배열은 항상
// [스킬1, 스킬2, 버스트 스킬] 순서라 버스트 스킬은 항상 마지막 원소다.
function burstCooldownSeconds(c) {
  const skills = c.skills || [];
  const skill = skills[skills.length - 1];
  const cd = skill?.cd;
  if (!cd || Number.isNaN(Number(cd))) return null;
  return Number(cd);
}

// 캐릭터 한 명을 AI 설명용 한 줄 요약으로. characterDatabase.json 항목(c)을 그대로 받는다.
// (조합 구성에는 더 이상 쓰이지 않고, 이미 확정된 조합을 설명할 때 맥락으로만 사용한다.)
function charSummaryLine(c, mode, treasureIdSet) {
  const tierKey = MODE_TIER_KEY[mode] || 'story';
  const note = INVESTMENT_NOTE_BY_NAME.get(c.title);
  const hasTreasure = treasureIdSet.has(c.id);
  const tier = (hasTreasure && note?.treasureTiers?.[tierKey]) || c.tiers?.[tierKey] || '?';
  const cd = burstCooldownSeconds(c);
  const parts = [`버스트${c.burst}`, c.class || '', c.element || '', `이 모드 티어 ${tier}`];
  if (cd) parts.push(`버스트 스킬 쿨타임 ${cd}초`);
  if (hasTreasure) {
    parts.push('애장품 보유');
    if (note?.treasureTiers?.[tierKey]) parts.push('(애장품 적용 티어로 표시됨)');
  } else if (note?.treasureRequired) {
    parts.push('애장품 미보유(공략상 권장, 미보유 시 위 티어보다 훨씬 낮게 평가됨)');
  }
  if (note?.totemRole) parts.push('토템 후보(버스트 대신 상시 버프/회복 역할 가능)');
  return `- ${c.title}(${c.name_kr}): ${parts.filter(Boolean).join(', ')}`;
}

// AI가 reasoning 문자열 안에 이스케이프 없는 실제 줄바꿈을 넣는 경우가 있는데, 이건 JSON
// 문법상 문자열 리터럴 안의 raw control character라 JSON.parse가 그대로 실패한다. 우리가
// 기대하는 JSON은 필드 하나짜리 단순 구조이므로 파싱 전에 raw control character를 공백으로
// 치환해도 의미가 손상되지 않는다.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  const candidate = raw.slice(start, end + 1).replace(/[\r\n\t]+/g, ' ');
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// 이미 확정된(개별 모드 티어 점수 합만으로 recommendTeams가 고른) 5인 조합을 사용자에게
// 설명하는 문장만 만든다. AI는 members 구성에 전혀 관여하지 않는다 — 실패해도 reasons를
// 이어붙인 한국어 문장으로 대체하므로 이 엔드포인트가 완전히 실패하지 않는다.
// 2026-08-08 추가: 프롬프트로 보낼 때만 문장을 줄인다.
//
// 근거 문장은 화면에도 그대로 쓰이므로 원본을 건드리면 안 되고, 여기서 복사본만 줄인다.
// 자르는 위치는 문장 경계를 우선한다 — 문장 중간에서 끊기면 AI가 문맥을 잘못 잡을 수 있다.
function clipForPrompt(text, maxLen) {
  const s = String(text || '');
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const boundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다. '), cut.lastIndexOf('요. '));
  return boundary > maxLen * 0.5 ? cut.slice(0, boundary + 1) : `${cut.trimEnd()}…`;
}

// 근거 문장 하나의 상한. 중앙값이 162자라 대부분은 그대로 통과하고, 토템 설명처럼
// 우리 조사 노트가 통째로 실린 700자대 문장만 잘린다.
const MAX_REASON_CHARS = 250;
const MAX_NOTE_CHARS = 400;

async function explainChosenTeam(client, fullMembers, reasons, archetypeNote, mode, modeLabel, treasureIdSet, langName) {
  const rosterText = fullMembers.map((c) => charSummaryLine(c, mode, treasureIdSet)).join('\n');

  // 아키타입 노트는 근거 문장 안에도 통째로 박혀 있고(synergyEngine이 "'X' 조합으로 알려진
  // 구성입니다. {note}" 형태로 만든다) 아래 noteBlock으로 한 번 더 보내진다. 같은 영어 원문을
  // 두 번 실어 보내던 셈이라, 근거 쪽에서는 빼고 noteBlock 하나만 남긴다.
  const deduped = (reasons || []).map((r) =>
    archetypeNote && r.includes(archetypeNote) ? r.replace(archetypeNote, '').trim() : r
  );

  const reasonsText =
    deduped.map((r) => `- ${clipForPrompt(r, MAX_REASON_CHARS)}`).join('\n') || '(추가 근거 없음)';
  const noteBlock = archetypeNote
    ? `\n\n[참고: 이 조합은 커뮤니티에서 검증된 조합과도 일치합니다 — 아래는 그 조합에 대한 영어 참고 자료이니 그대로 인용하지 말고 내용만 참고하세요]\n${clipForPrompt(archetypeNote, MAX_NOTE_CHARS)}`
    : '';

  const system = `당신은 모바일 게임 '승리의 여신: 니케'의 조합 전문가입니다. 아래에 이미 확정된 5인 조합과 멤버들의 실제 데이터, 그 조합이 채점된 근거 문장이 주어집니다.
이 조합은 캐릭터 개별 모드 티어 점수의 합만으로 이미 확정되었으므로, 당신의 역할은 새 조합을 만들거나 다른 조합을 제안하는 것이 아니라 이미 정해진 이 조합이 왜 좋은지 설명하는 것입니다 — members 구성을 바꾸지 마세요.
"~사이트에서 검증된", "~라는 이름의 조합"처럼 출처나 조합 이름을 언급하지 말고, 마치 이 조합을 직접 분석해서 설명하는 것처럼 자연스럽게 쓰세요.

[중요] 사용자가 지금 보유하지 않은 것을 장점으로 포장하지 마세요.
- 근거 문장에 "애장품을 갖추면 평가가 B → SS로 올라간다"처럼 적혀 있어도, 그건 지금 갖추지 못했다는 뜻이지 이 조합의 강점이 아닙니다. "향후 투자하면 좋아진다", "성장 잠재력이 있다", "장기적으로 유리하다" 같은 표현으로 미보유 상태를 긍정적으로 바꾸지 마세요.
- 사용자는 지금 당장 쓸 조합을 묻고 있습니다. 설명은 현재 상태 기준으로만 하세요.
- 애장품 미보유가 이 조합의 약점이라면 약점으로 짧게 언급하는 것은 괜찮습니다. 다만 그것을 장점으로 뒤집지는 마세요.

[중요] 근거 문장에 "[조건 확인]"으로 시작하는 항목이 있으면 반드시 설명에 포함하세요.
- 그 캐릭터는 충분한 투자나 수동 조작 숙련이 갖춰졌을 때를 기준으로 티어가 매겨진 캐릭터입니다. 조건을 안 밝히면 이제 막 시작한 사용자가 등급만 보고 잘못 판단하게 됩니다.
- "○○는 투자가 많이 필요한 캐릭터라 육성이 덜 됐다면 기대만큼 안 나올 수 있습니다"처럼 짧고 담백하게 덧붙이세요. 겁을 주거나 조합 전체를 부정하는 투로 쓰지는 마세요.

반드시 아래 JSON 형식으로만, 다른 설명이나 코드블록 표시 없이 출력하세요.
{"reasoning": "${langName}로 작성한 200~350자(영어는 60~120단어) 분량의 설명, 줄바꿈 없이 한 문단"}`;

  const userContent = `모드: ${modeLabel}

[확정된 조합]
${rosterText}

[채점 근거]
${reasonsText}${noteBlock}

위 조합이 왜 좋은지 ${langName}로 자연스럽게 설명하세요.`;

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userContent }],
      // 2026-08-08: thinking/output_config를 뺐다. 이 작업은 이미 정해진 사실을 문장으로 옮기는
      // 것이라 추론 단계가 필요 없고, thinking 토큰은 출력 요금($5~15/1M)으로 청구되어 이
      // 엔드포인트 비용의 절반가량을 차지하고 있었다. 또 이 파라미터들은 모델 계열에 따라
      // 지원 여부가 달라, 모델을 바꿀 때마다 호출이 깨질 위험도 있었다.
      stop_sequences: ['}'],
    });
    const rawText = msg.content?.find((c) => c.type === 'text')?.text || '';
    const text = msg.stop_reason === 'stop_sequence' ? `${rawText}}` : rawText;
    const parsed = extractJson(text);
    if (parsed?.reasoning) return parsed.reasoning;
    console.error('explainChosenTeam: failed to parse response', { stopReason: msg.stop_reason, textPreview: text.slice(0, 500) });
  } catch (err) {
    console.error('explainChosenTeam error', err);
  }
  // 2026-08-08 수정: 실패 시 폴백 문장을 여기서 만들어 반환하면, 호출부가 그것을 정상 응답으로
  // 착각해 캐시에 저장한다. 그러면 열화된 문장이 그 조합에 영구히 박힌다. 실패는 실패로 알린다.
  return null;
}

// AI 호출이 실패했을 때 보여줄 대체 문장. 캐시에는 저장하지 않는다.
function fallbackReasoning(reasons) {
  return (reasons || []).slice(0, 3).join(' ') ||
    '보유 캐릭터 중 이 모드 티어 점수 합이 가장 높은 조합입니다.';
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { characters, treasureIds, mode, bossElement, tower, excludeTitles, lang } = body || {};
  // 기업 타워는 tribe_tower 모드에서만 의미가 있다. 다른 모드에 딸려오면 무시한다.
  const towerKey = mode === 'tribe_tower' && TOWER_CORP_SET.has(tower) ? tower : null;

  if (!Array.isArray(characters) || characters.length === 0) {
    return Response.json({ error: '보유중인 캐릭터를 먼저 선택해주세요.' }, { status: 400 });
  }

  // 하드 제약(버스트 I/II/III 각 1명 이상)은 호출 전에 미리 걸러 불필요한 API 비용을 막는다.
  const burstValues = new Set(characters.map((c) => String(c.burst)));
  if (!burstValues.has('1') || !burstValues.has('2') || !burstValues.has('3')) {
    return Response.json(
      { error: '버스트 I/II/III 단계 캐릭터를 각각 최소 1명씩 보유해야 조합을 구성할 수 있습니다.' },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'AI 추천 기능이 아직 설정되지 않았습니다. (관리자: Vercel 환경변수에 ANTHROPIC_API_KEY 추가 필요)' },
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
          { error: `오늘 사용 가능한 AI 추천 횟수(${DAILY_LIMIT}회)를 모두 사용했습니다. 내일 다시 시도해주세요.` },
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
    // 보스전(솔로 레이드)은 enikk에 5인 조합 단위 기록이 없어 실사용 쪽이 항상 비고, 자연히
    // prydwen 아키타입만 남는다. (캐릭터별 사용률은 후보 정렬과 근거 문장에 이미 반영된다.)
    let chosen;
    let archetypeNote = null;
    let matchSource;
    let alternative = null;

    const matchOpts = {
      treasureIds: treasureIdSet,
      bossElement: bossElement || null,
      tower: towerKey,
      excludeTitles: Array.from(excludeSet),
    };
    const realUsageMatch = findRealUsageTeamMatch(characters, mode, matchOpts);
    const exactMatch = findExactTeamMatch(characters, mode, matchOpts);

    const candidates = [
      realUsageMatch && { match: realUsageMatch, source: 'enikk-real-usage', rank: 0 },
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
      });

      if (!rec.teams || rec.teams.length === 0) {
        return Response.json(
          { error: rec.error || '보유한 캐릭터로는 조건을 만족하는 조합을 만들 수 없습니다.' },
          { status: 400 }
        );
      }

      // "다른 조합 보기": 이전에 보여준 멤버가 하나도 겹치지 않는 후보 중 1위를 우선 채택하고,
      // 로스터가 작아 그런 후보가 없으면 겹치더라도 순위상 1위를 그대로 채택한다.
      const pool = rec.teams.filter((t) => !t.members.some((m) => excludeSet.has(m.title)));
      chosen = (pool.length > 0 ? pool : rec.teams)[0];
      matchSource = 'skill-synergy-fallback';
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
      archetypeNote,
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
      budgetExhausted = await isOverGlobalDailyLimit(supabase);
      if (budgetExhausted) {
        console.warn(`[AI_BUDGET] 일일 총 상한(${DAILY_GLOBAL_LIMIT}회) 도달 — AI 설명 생성을 중단하고 근거 문장으로 대체합니다`);
        aiReasoning = fallbackReasoning(chosen.reasons);
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
        langName
      );
      if (generated) {
        aiReasoning = generated;
        // 실제로 돈을 쓴 요청만 사용자의 하루 할당량에서 차감한다.
        if (supabase && ipHash) await incrementDailyUsage(supabase, ipHash);
        // 전역 카운터도 같은 기준(실제 API 호출)으로 올린다.
        if (supabase) await incrementGlobalDailyUsage(supabase);
        await writeCache(supabase, cacheKey, generated, langKey, mode);
      } else {
        // AI 호출 실패. 근거 문장으로 대체하되 캐시에는 남기지 않는다 —
        // 열화된 문장이 캐시에 박히면 그 조합은 영영 제대로 된 설명을 못 받는다.
        aiReasoning = fallbackReasoning(chosen.reasons);
      }
    }

    return Response.json({
      team: {
        members: chosen.members,
        totalScore: chosen.totalScore,
        reasons: chosen.reasons,
      },
      aiReasoning,
      model: matchSource,
      cached,
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
    return Response.json({ error: 'AI 추천을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
