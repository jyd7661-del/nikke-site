import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { scoreTeam } from '@/lib/synergyEngine';
import characterInvestmentNotes from '@/data/characterInvestmentNotes.json';
import synergyNotes from '@/data/synergyNotes.json';

// AI가 "규칙 엔진이 미리 뽑아둔 3개 후보 중 하나를 설명"하는 게 아니라, 보유 로스터와
// 공략 근거자료(아키타입/시너지 페어/애장품 정보)를 통째로 받아 5인 조합을 직접 구성하는 API.
// (구 app/api/ai-explain는 "이미 정해진 후보를 비교 설명"만 했는데, 사용자 피드백에 따라
// AI가 실제로 조합을 짜는 역할을 하도록 새로 만든 엔드포인트. lib/synergyEngine.js의 scoreTeam은
// 여기서 AI가 고른 조합이 게임 규칙(버스트 I/II/III)을 만족하는지 검증하고 점수/근거를 매기는
// 용도로만 재사용한다 — 후보를 미리 좁혀두는 용도로는 쓰지 않는다.)
//
// 유저 👍/👎 피드백(app/api/ai-recommend/feedback)이 쌓이면, 그 통계를 매 요청마다 조회해서
// "커뮤니티 반응이 좋았던 조합" 힌트로 프롬프트에 실어 보낸다. 이건 모델을 학습/파인튜닝하는 게
// 아니라 매번 그 순간의 통계를 다시 읽어 프롬프트에 얹는 방식(RAG)이며, 기존 아키타입/페어
// 시너지 자료를 프롬프트에 넣는 방식과 동일한 원리다.
//
// 2026-07-31 수정(1차): 유저가 "추천 조합이 시너지보다 역할군/티어 기준으로 뽑힌 것처럼 느껴진다"고
// 피드백함. 원인 2가지를 찾아 수정: (1) synergyPairs에 mode 필드가 없어서 캠페인 추천에도
// PvP 전용 페어 같은 것이 섞여 들어가 AI가 그 자료를 신뢰하지 못하고 무시했을 가능성 -> 페어에
// mode를 추가하고 relevantPairs도 archetypes처럼 모드로 필터링하도록 수정. (2) 시스템 프롬프트가
// "데이터를 참고하라"고만 했지 아키타입/페어를 개별 티어보다 우선하라고 명시하지 않아서, 모델이
// 기본 휴리스틱(버스트 슬롯별 최고 티어 뽑기)으로 흐르기 쉬웠음 -> 아래처럼 "완전 보유한 아키타입 우선
// -> 페어 시너지로 나머지 채우기 -> 그래도 남으면 개별 티어" 순서를 명시하고, 아키타입 목록에 각
// 아키타입을 몇 명 보유했는지([완전 보유]/[일부 보유 n/m])를 함께 보여줘 AI가 우선순위를 스스로
// 판단하기 쉽게 만듦.
//
// 2026-07-31 수정(2차): 유저가 "이번엔 포메이션(예: 1-2-2)에 너무 묶여있다, 같은 버스트 단계를
// 2명 쓰는 건 그 버스트 스킬 쿨타임이 길어서(주로 40초 이상) 번갈아 커버해야 할 때나 의미 있는
// 건데 지금은 그냥 '이 포메이션이니까 2명 써야지'처럼 형태 자체를 목표로 삼는 것 같다"고 피드백함.
// characterDatabase.json의 skills[].cd(버스트 스킬 쿨타임, 초 단위)가 지금까지 프롬프트에 전혀
// 전달되지 않아 AI가 이 판단을 할 근거 자체가 없었던 게 원인 -> charSummaryLine에 실제 버스트
// 쿨타임을 추가하고, 시스템 프롬프트에 "포메이션은 캐릭터를 잘 고른 결과이지 그 자체가 목표가
// 아니다 / 같은 버스트 단계 중복 기용은 쿨타임이 길 때 번갈아 커버하려는 것일 때만 정당화된다"는
// 지침을 명시함.
export const runtime = 'nodejs';
// 2026-08-03 수정: 유저가 "AI 추천 버튼을 눌러도 아무것도 안 나온다"고 제보. 실제로 재현해보니
// 응답 자체는 오지만(200 OK) 로스터가 크면(20명 이상) 프롬프트가 커져 30~40초 가까이 걸림.
// Vercel의 기본 함수 실행 제한(설정 안 하면 플랜 기본값, Hobby 기준 상당히 짧음)에 걸려 응답이
// 오기 전에 함수가 죽으면 프론트는 별다른 에러 없이 "구성하는 중..."에서 멈춘 것처럼 보인다.
// maxDuration을 명시적으로 늘려 큰 로스터에서도 안전하게 끝까지 응답하도록 한다(Hobby 플랜 상한 60초).
export const maxDuration = 60;

const DAILY_LIMIT = 8;
const MODEL = 'claude-sonnet-5';
// 2026-08-03 재수정: 위 maxDuration=60을 적용한 뒤에도, 로스터가 23명인 유저에게서 재현 테스트 중
// 실제로 504(Gateway Timeout)가 발생하는 것을 확인함 — Vercel Hobby 플랜의 함수 실행 시간 상한이
// 60초라 이 이상은 설정으로 늘릴 수 없다. 즉 이 케이스는 "응답을 더 오래 기다리게" 하는 것만으론
// 해결이 안 되고, 애초에 생성 시간 자체를 줄여야 한다 — 아래 relevantArchetypes/relevantPairs에
// 포함 개수 상한을 둬서 로스터가 커질수록 프롬프트(및 그에 비례하는 생성 시간)가 무한정 커지지
// 않도록 한다. max_tokens는 "출력이 잘리는 것"을 막기 위한 것이라 8192로 유지(생성 시간과는 별개).
const MAX_OUTPUT_TOKENS = 8192;
// 아키타입/페어를 프롬프트에 몇 개까지 넣을지 상한. 소수의 캐릭터만 보유한 유저는 이 상한에
// 걸릴 일이 거의 없고, 로스터가 매우 큰 유저(20명 이상)에서만 실제로 잘라내는 효과가 생긴다.
const MAX_ARCHETYPES_IN_PROMPT = 15;
const MAX_PAIRS_IN_PROMPT = 12;

const MODE_LABEL = { campaign: '캠페인', bossing: '보스전', pvp: 'PvP' };
const MODE_TIER_KEY = { campaign: 'story', story: 'story', bossing: 'bossing', raid: 'bossing', pvp: 'pvp' };
const MODE_COMPAT = {
  campaign: ['campaign', 'tribe_tower'],
  story: ['campaign', 'tribe_tower'],
  bossing: ['bossing', 'raid'],
  raid: ['raid', 'bossing'],
  pvp: ['pvp'],
};

const INVESTMENT_NOTE_BY_NAME = new Map(characterInvestmentNotes.characters.map((c) => [c.name, c]));

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

async function checkAndIncrementRateLimit(supabase, ipHash) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing, error: selectError } = await supabase
    .from('ai_explain_usage')
    .select('count')
    .eq('ip_hash', ipHash)
    .eq('usage_date', today)
    .maybeSingle();

  if (selectError) {
    console.error('rate limit select error', selectError);
    return true; // 조회 실패 시 열어둠(사용자 차단보다 안전)
  }

  if (existing) {
    if (existing.count >= DAILY_LIMIT) return false;
    await supabase
      .from('ai_explain_usage')
      .update({ count: existing.count + 1 })
      .eq('ip_hash', ipHash)
      .eq('usage_date', today);
  } else {
    await supabase.from('ai_explain_usage').insert({ ip_hash: ipHash, usage_date: today, count: 1 });
  }
  return true;
}

// 최근 피드백(최대 300건)을 모드별로 모아 조합(멤버 title 집합) 단위로 순호응(👍-👎)을 집계하고,
// 투표가 2회 이상 쌓였고 순호응이 양수인 조합만 상위 3개까지 프롬프트용 텍스트로 만든다.
// Supabase JS 클라이언트에 group-by 집계가 없어 최근 N건을 읽어 JS에서 직접 집계한다.
async function popularCombosText(supabase, mode) {
  const { data, error } = await supabase
    .from('ai_recommend_feedback')
    .select('members, formation, rating')
    .eq('mode', mode)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error || !data || data.length === 0) return null;

  const scoreMap = new Map();
  for (const row of data) {
    const members = row.members || [];
    if (members.length === 0) continue;
    const key = members
      .map((m) => m.title)
      .sort()
      .join('|');
    const entry = scoreMap.get(key) || { members, score: 0, votes: 0 };
    entry.score += row.rating === 'up' ? 1 : -1;
    entry.votes += 1;
    scoreMap.set(key, entry);
  }

  const ranked = Array.from(scoreMap.values())
    .filter((e) => e.score > 0 && e.votes >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) return null;

  return ranked
    .map(
      (e, i) =>
        `${i + 1}. ${e.members.map((m) => `${m.title}(${m.name_kr})`).join(', ')} — 순호응 ${e.score} (투표 ${e.votes}회)`
    )
    .join('\n');
}

// 캐릭터의 실제 버스트 스킬 쿨타임(초). characterDatabase.json의 skills 배열에서
// type이 'Active'인 항목(=버스트 스킬)의 cd 필드를 찾는다. 값이 없거나 숫자가 아니면 null.
function burstCooldownSeconds(c) {
  const skill = (c.skills || []).find((s) => s.type === 'Active');
  const cd = skill?.cd;
  if (!cd || Number.isNaN(Number(cd))) return null;
  return Number(cd);
}

// 캐릭터 한 명을 AI 프롬프트용 한 줄 요약으로. characterDatabase.json 항목(c)을 그대로 받는다.
function charSummaryLine(c, mode, treasureIdSet) {
  const tierKey = MODE_TIER_KEY[mode] || 'story';
  const tier = c.tiers?.[tierKey] || '?';
  const note = INVESTMENT_NOTE_BY_NAME.get(c.title);
  const cd = burstCooldownSeconds(c);
  const parts = [`버스트${c.burst}`, c.class || '', c.element || '', `이 모드 티어 ${tier}`];
  if (cd) parts.push(`버스트 스킬 쿨타임 ${cd}초`);
  if (treasureIdSet.has(c.id)) parts.push('애장품 보유');
  else if (note?.treasureRequired) parts.push('애장품 미보유(공략상 권장)');
  return `- ${c.title}(${c.name_kr}): ${parts.filter(Boolean).join(', ')}`;
}

// 보유 비율(완전 보유 > 일부 보유 중 비율 높은 순)로 정렬해, 로스터가 커서 관련 아키타입이
// 너무 많아지더라도 프롬프트에는 실제로 근거가 될 확률이 높은 상위 항목만 담기게 한다.
function ownedRatio(members, ownedTitleSet) {
  const total = (members || []).length || 1;
  const owned = (members || []).filter((m) => ownedTitleSet.has(m)).length;
  return owned / total;
}

// 보유 로스터 중 이 모드와 관련된 "이름 붙은 조합(아키타입)". 로스터에 한 명이라도 포함되면
// AI가 참고할 수 있게 목록에 넣는다(완전 포함 여부는 AI가 직접 판단할 수 있도록 아래에서
// [완전 보유]/[일부 보유] 상태를 함께 표시한다).
// 2026-08-03: 로스터가 매우 큰(20명 이상) 유저는 관련 아키타입도 함께 많아져 프롬프트가 커지고
// 생성 시간이 Vercel 함수 실행 상한(60초)을 넘겨 504가 나는 것을 확인함 -> 보유 비율이 높은
// 순으로 정렬 후 상한(MAX_ARCHETYPES_IN_PROMPT)만큼만 프롬프트에 포함시킨다.
function relevantArchetypes(ownedTitleSet, mode) {
  const compat = MODE_COMPAT[mode] || [mode];
  return synergyNotes.archetypes
    .filter((a) => compat.includes(a.mode) && (a.members || []).some((m) => ownedTitleSet.has(m)))
    .sort((a, b) => ownedRatio(b.members, ownedTitleSet) - ownedRatio(a.members, ownedTitleSet))
    .slice(0, MAX_ARCHETYPES_IN_PROMPT);
}

// 페어 시너지는 두 멤버 모두 보유하고 있을 때만 의미가 있으므로 완전 포함된 것만 넘기고,
// 아키타입과 마찬가지로 현재 모드와 호환되는 것만 남긴다(mode가 없는 옛 데이터는 통과시킴).
// 마찬가지로 대형 로스터에서 프롬프트가 무한정 커지지 않도록 상한을 둔다.
function relevantPairs(ownedTitleSet, mode) {
  const compat = MODE_COMPAT[mode] || [mode];
  return synergyNotes.synergyPairs
    .filter((p) => (p.members || []).every((m) => ownedTitleSet.has(m)) && (!p.mode || compat.includes(p.mode)))
    .slice(0, MAX_PAIRS_IN_PROMPT);
}

function computeFormation(members) {
  const counts = { 1: 0, 2: 0, 3: 0 };
  members.forEach((m) => {
    counts[m.burst] = (counts[m.burst] || 0) + 1;
  });
  return `${counts[1]}-${counts[2]}-${counts[3]}`;
}

// AI가 지시를 어기고 reasoning 문자열 안에 이스케이프 없는 실제 줄바꿈을 넣는 경우가 있는데,
// 이건 JSON 문법상 문자열 리터럴 안의 raw control character라 JSON.parse가 그대로 실패한다
// (Vercel 로그에서 stopReason:'end_turn'인데도 파싱 실패로 확인됨). 우리가 기대하는 JSON은
// 필드 몇 개짜리 단순 구조이므로, 구조적 개행이든 문자열 내부 개행이든 공백으로 바꿔도
// 의미가 손상되지 않는다 — 그래서 파싱 전에 raw control character를 공백으로 치환한다.
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

// AI가 프롬프트 지시를 어기고 "Tia(티아)"처럼 title 뒤에 한글 이름을 괄호로 덧붙이는 경우가
// 있어, 정확히 일치하는 title이 없으면 괄호 이후를 잘라내고 한 번 더 시도한다.
function resolveMember(rawTitle, byTitle) {
  if (byTitle.has(rawTitle)) return byTitle.get(rawTitle);
  const stripped = rawTitle.replace(/[(（].*$/, '').trim();
  if (byTitle.has(stripped)) return byTitle.get(stripped);
  return null;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { characters, treasureIds, mode, bossElement, excludeTitles } = body || {};

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
    let supabase = null;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      const ipHash = hashIp(getClientIp(req));
      const ok = await checkAndIncrementRateLimit(supabase, ipHash);
      if (!ok) {
        return Response.json(
          { error: `오늘 사용 가능한 AI 추천 횟수(${DAILY_LIMIT}회)를 모두 사용했습니다. 내일 다시 시도해주세요.` },
          { status: 429 }
        );
      }
    }

    const treasureIdSet = new Set(treasureIds || []);
    const ownedTitleSet = new Set(characters.map((c) => c.title));
    const modeLabel = MODE_LABEL[mode] || mode || '캠페인';

    const rosterText = characters.map((c) => charSummaryLine(c, mode, treasureIdSet)).join('\n');
    const archetypesText =
      relevantArchetypes(ownedTitleSet, mode)
        .map((a) => {
          const total = (a.members || []).length;
          const owned = (a.members || []).filter((m) => ownedTitleSet.has(m)).length;
          const status = total > 0 && owned === total ? '[완전 보유]' : `[일부 보유 ${owned}/${total}]`;
          return `- ${status} '${a.name}' (필요: ${(a.members || []).join(', ') || '(전체 특성 조합)'}): ${a.note}`;
        })
        .join('\n') || '(해당 없음)';
    const pairsText =
      relevantPairs(ownedTitleSet, mode)
        .map((p) => `- ${p.members.join(' + ')}: ${p.reason}`)
        .join('\n') || '(해당 없음)';

    const popularText = supabase ? await popularCombosText(supabase, mode) : null;

    const system = `당신은 모바일 게임 '승리의 여신: 니케'의 조합을 실제로 구성하는 전문가입니다.
아래에 사용자가 실제로 보유한 캐릭터 목록과 각 캐릭터의 실제 데이터(모드별 티어, 버스트 단계, 클래스, 속성, 버스트 스킬 쿨타임, 애장품 여부)가 주어집니다.
그 아래에는 커뮤니티에서 검증된 '이름 붙은 조합(아키타입)'과 캐릭터 페어 시너지가 주어지고, 있다면 실제 유저들이 👍/👎로 평가한 조합 통계도 참고자료로 주어집니다.
반드시 이 목록에 있는 캐릭터만 사용하세요. 목록에 없는 캐릭터나 자료에 없는 시너지를 지어내지 마세요.
유저 피드백 통계가 주어지면 참고하되, 로스터 상황이나 게임 규칙에 안 맞으면 그대로 베끼지 말고 데이터에 맞게 조정하세요.

[조합 구성 우선순위 — 반드시 이 순서를 따르세요. 캐릭터 개별 티어만 보고 버스트 단계별로 최고 티어를 하나씩 뽑는 방식(역할군 기반 조합)은 금지합니다]
1. 아래 '관련 이름 붙은 조합(아키타입)' 중 [완전 보유]로 표시된 것이 있다면 최우선으로 채택하세요. 여러 개를 동시에 채택할 수 있으면(예: 4인 코어 아키타입 + 남는 1자리에 다른 아키타입/페어 멤버) 그렇게 결합하세요.
2. 완전 보유한 아키타입만으로 5명이 다 안 채워지면, '관련 페어 시너지'에 있는 캐릭터 쌍을 최대한 함께 포함해 나머지 슬롯을 채우세요.
3. 그래도 남는 슬롯만 개별 모드 티어가 높은 캐릭터로 채우세요.
4. 위 아키타입/페어 자료에 이 로스터로 적용 가능한 것이 정말 하나도 없을 때만 순수 티어 기준으로 구성하고, 그 경우 reasoning 맨 앞에 "적용 가능한 아키타입/페어 자료가 없어 티어 기준으로 구성함"이라고 명시하세요.

[포메이션에 대한 주의사항] 포메이션(버스트I-II-III 인원수 비율, 예: 1-2-2)은 캐릭터를 잘 골라서 나온 "결과"일 뿐, 그 자체가 맞춰야 할 목표가 아닙니다. "이런 포메이션이 좋다고 하니 버스트 단계별로 인원수를 맞추자"는 식으로 거꾸로 생각하지 마세요.
같은 버스트 단계 캐릭터를 2명 이상 기용하는 것은 그 단계에 강력한 캐릭터가 많아서가 아니라, 구체적인 이유가 있을 때만 정당화됩니다: (a) 위 버스트 스킬 쿨타임을 보고, 그 단계의 캐릭터 쿨타임이 길어(대략 40초 이상) 매 풀버스트 사이클마다 준비되지 않을 수 있어 두 캐릭터가 번갈아 커버해야 하는 경우, 또는 (b) 완전 보유한 아키타입/페어 자료가 그 두 캐릭터를 실제로 명시하는 경우. 쿨타임이 짧은(20초 이하) 캐릭터 한 명으로 그 버스트 단계가 매 사이클 안정적으로 준비된다면 같은 단계에 2명을 넣을 이유가 없습니다.

[필수 게임 규칙] 5인 조합은 버스트 I, II, III 단계 캐릭터를 각각 최소 1명씩 포함해야 하며, 5명은 모두 서로 다른 캐릭터여야 합니다.
당신의 역할은 주어진 데이터만 근거로 이 사용자에게 가장 좋은 5인 조합을 직접 구성하고 그 이유를 설명하는 것입니다.
매우 중요: 반드시 아래 JSON 형식으로만, 다른 설명이나 코드블록 표시 없이 JSON 객체 하나만 출력하세요.
- members 배열의 각 항목은 캐릭터 목록에 주어진 title 표기와 정확히 똑같이 쓰세요. 한글 이름이나 괄호 병기를 절대 덧붙이지 마세요. 예: "Rapi: Red Hood"는 맞고, "Rapi: Red Hood(라피)"는 틀립니다.
- reasoning은 줄바꿈 없이 한 문단으로, 200~350자 이내로 간결하게 작성하세요(길게 쓰지 마세요). 실제로 채택한 아키타입 이름이나 페어를 구체적으로 언급하세요(예: "캠페인 파밍 코어(아니스: 스타+크라운+...)를 채택하고 5번째 슬롯은..."). 같은 버스트 단계를 2명 이상 썼다면 그 이유(쿨타임 보완인지, 아키타입/페어 근거인지)도 짧게 밝히세요.
{"members": ["title 5개, 위 목록의 title 표기 그대로, 괄호나 한글 이름 금지"], "reasoning": "200~350자 분량의 한국어 설명, 줄바꿈 없이 한 문단"}`;

    const excludeText =
      Array.isArray(excludeTitles) && excludeTitles.length > 0
        ? `\n이전에 추천한 조합(가능하면 겹치지 않는 다른 조합을 시도하세요): ${excludeTitles.join(', ')}`
        : '';

    const popularBlock = popularText ? `\n\n[유저 👍/👎 피드백에서 반응이 좋았던 조합 (참고용)]\n${popularText}` : '';

    const userContent = `모드: ${modeLabel}${bossElement ? ` (보스 약점 속성: ${bossElement})` : ''}${excludeText}

[보유 캐릭터 목록]
${rosterText}

[관련 이름 붙은 조합(아키타입)]
${archetypesText}

[관련 페어 시너지]
${pairsText}${popularBlock}

위 데이터만 근거로, 위에서 안내한 우선순위(완전 보유 아키타입 > 페어 시너지 > 개별 티어)와 포메이션 주의사항에 따라 최고의 5인 조합을 구성하고 JSON으로 답하세요.`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // 2026-08-03 4차 수정: 3차 수정(assistant 프리필 '{' + stop_sequences)을 배포했더니
    // Anthropic API가 400으로 거부함: "This model does not support assistant message prefill.
    // The conversation must end with a user message." -> MODEL(claude-sonnet-5)이 내부적으로
    // 항상 reasoning(thinking)을 수행하는 모델이라 프리필 자체가 금지되어 있음을 확인.
    // 이게 오히려 지금까지의 504/느린 응답의 진짜 원인일 가능성이 높다 — 우리가 보는 출력은
    // 짧아도, 보이지 않는 thinking 단계가 로스터/프롬프트가 커질수록 함께 길어져 실제 생성
    // 시간을 지배했을 것. 프리필 대신 thinking.budget_tokens을 명시적으로 낮게 고정해
    // reasoning 단계 자체를 짧게 강제한다(이 작업은 사전에 명시된 우선순위 규칙을 그대로
    // 적용하는 수준이라 깊은 추론이 필요 없음). stop_sequences는 그대로 유지해 thinking 이후
    // 나오는 본문(JSON) 뒤에 불필요한 후행 텍스트가 붙는 것만 추가로 방지한다.
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: 'user', content: userContent }],
      thinking: { type: 'enabled', budget_tokens: 1024 },
      stop_sequences: ['}'],
    });

    const rawText = msg.content?.find((c) => c.type === 'text')?.text || '';
    // stop_sequences에 걸려 멈춘 경우 매칭된 '}'는 응답 텍스트에서 잘려 나가므로 다시 붙여준다.
    const text = msg.stop_reason === 'stop_sequence' ? `${rawText}}` : rawText;
    const parsed = extractJson(text);

    if (!parsed || !Array.isArray(parsed.members)) {
      console.error('ai-recommend: failed to parse AI response', {
        stopReason: msg.stop_reason,
        contentTypes: (msg.content || []).map((c) => c.type),
        textPreview: text.slice(0, 2000),
      });
      return Response.json({ error: 'AI가 유효한 형식으로 응답하지 않았습니다. 다시 시도해주세요.' }, { status: 502 });
    }

    const byTitle = new Map(characters.map((c) => [c.title, c]));
    const resolvedMembers = parsed.members.map((t) => resolveMember(t, byTitle)).filter(Boolean);
    const uniqueMembers = Array.from(new Map(resolvedMembers.map((m) => [m.title, m])).values());

    if (uniqueMembers.length !== 5 || parsed.members.length !== 5) {
      console.error('ai-recommend: member resolution failed', {
        rawMembers: parsed.members,
        resolvedCount: uniqueMembers.length,
      });
      return Response.json(
        { error: 'AI가 보유하지 않은 캐릭터를 포함했거나 5명을 채우지 못했습니다. 다시 시도해주세요.' },
        { status: 502 }
      );
    }

    const members = uniqueMembers;

    // scoreTeam으로 AI가 구성한 조합이 실제로 유효한지(버스트 I/II/III 충족) 검증하고,
    // 동시에 점수/근거 문장도 함께 얻는다 — 후보를 미리 좁히는 용도가 아니라 사후 검증/설명용.
    const scored = scoreTeam(members, mode, { treasureIds: treasureIdSet, bossElement: bossElement || null });
    if (!scored.valid) {
      return Response.json(
        { error: 'AI가 구성한 조합이 버스트 I/II/III 조건을 만족하지 못했습니다. 다시 시도해주세요.' },
        { status: 502 }
      );
    }

    return Response.json({
      team: {
        formation: computeFormation(members),
        members: members.map((m) => ({ id: m.id, title: m.title, name_kr: m.name_kr, burst: m.burst, img: m.img || null })),
        totalScore: scored.totalScore,
        reasons: scored.reasons,
      },
      aiReasoning: parsed.reasoning || '',
      model: MODEL,
    });
  } catch (err) {
    console.error('ai-recommend error', err);
    return Response.json({ error: 'AI 추천을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
