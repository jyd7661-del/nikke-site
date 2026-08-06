import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { scoreTeam, findExactTeamMatch } from '@/lib/synergyEngine';
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

// 캐릭터의 실제 버스트 스킬 쿨타임(초). characterDatabase.json의 skills 배열은 항상
// [스킬1, 스킬2, 버스트 스킬] 순서라 버스트 스킬은 항상 마지막 원소다.
// 2026-08-04 수정: 이전엔 type이 'Active'인 "첫 번째" 스킬을 찾았는데, 스킬2도 Active 타입인
// 캐릭터가 많아(예: Rapi: Red Hood의 스킬2 'Missile'은 cd 20초, 실제 버스트 스킬
// 'Warhead Volley'는 cd 40초) 버스트가 아닌 스킬2의 쿨타임을 잘못 가져오는 버그가 있었다.
// 유저가 "3버스트는 보통 쿨타임이 40초라 2명 이상 있어야 하는데 AI가 1명만 넣은 조합을 짬"이라고
// 제보해 재현: 실제로 버스트III 캐릭터 다수(Rapi, Soldier: EG 등)가 스킬2도 Active라 이 버그로
// 쿨타임이 20초 미만으로 잘못 표시되고 있었고, AI가 그 잘못된(짧은) 쿨타임만 보고 "1명으로 충분"이라고
// 판단한 것이 근본 원인이었다. 마지막 원소를 직접 참조하도록 수정.
function burstCooldownSeconds(c) {
  const skills = c.skills || [];
  const skill = skills[skills.length - 1];
  const cd = skill?.cd;
  if (!cd || Number.isNaN(Number(cd))) return null;
  return Number(cd);
}

// 캐릭터 한 명을 AI 프롬프트용 한 줄 요약으로. characterDatabase.json 항목(c)을 그대로 받는다.
function charSummaryLine(c, mode, treasureIdSet) {
  const tierKey = MODE_TIER_KEY[mode] || 'story';
  const note = INVESTMENT_NOTE_BY_NAME.get(c.title);
  const hasTreasure = treasureIdSet.has(c.id);
  // 2026-08-05 추가: 애장품 보유 시 실제 성능이 기본 티어와 크게 달라지는 캐릭터(예: 헬름)가 있는데,
  // 지금까지는 "애장품 보유" 태그만 붙고 티어 숫자는 그대로 기본값이라 AI가 실제로 얼마나 강해지는지
  // 판단할 근거가 없어 계속 저평가되는 문제가 있었음(유저 제보) -> characterInvestmentNotes.json에
  // treasureTiers를 추가해두고, 보유 시 그 값으로 티어 자체를 대체해서 보여준다.
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
  // 2026-08-04 추가: 유저가 "나가를 같은 버스트 단계에 추가로 넣는 이유는 버스트가 아니라
  // 팀 회복 버프를 상시 제공하는 '토템' 역할 때문"이라고 제보. 이런 캐릭터는
  // characterInvestmentNotes.json에 totemRole/totemNote로 정리해두고, AI가 로스터에서
  // 이 태그를 보고 "이미 빠른 쿨타임으로 커버되는 버스트 단계에 굳이 한 명 더 넣을 이유"를
  // 스스로 판단할 수 있게 표시해준다.
  if (note?.totemRole) parts.push('토템 후보(버스트 대신 상시 버프/회복 역할 가능)');
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

// 완전일치 조합(findExactTeamMatch)의 근거를 사람이 읽기 좋은 문장으로 바꾼다.
// 2026-08-06 추가: 유저가 "완전일치 조합의 설명이 영어 원문 그대로 나오고, '~사이트에서 검증된
// xxx 조합'처럼 불필요한 출처/조합명 인용이 붙는다"고 지적. lib/synergyEngine.js의
// findExactTeamMatch는 이제 archetypeNote(prydwen.gg 원문, 영어)를 그대로 반환하므로, 여기서
// "이미 확정된 이 5명을 설명만 하라"는 가벼운 AI 호출로 번역/재구성한다. 조합 구성 자체(어떤
// 5명을 쓸지)는 여전히 findExactTeamMatch가 AI 없이 확정하므로, 유저가 지적했던 "규칙이 쌓일수록
// AI 사고가 경직되는" 자유 구성 단계는 그대로 생략된다 — 이 호출은 "구성"이 아니라 "설명"만
// 담당하는 훨씬 가벼운 작업이라 시스템 프롬프트도 짧고 effort도 낮게 유지한다.
async function explainMatchedTeam(client, fullMembers, archetypeNote, mode, modeLabel, treasureIdSet, langName) {
  const rosterText = fullMembers.map((c) => charSummaryLine(c, mode, treasureIdSet)).join('\n');
  const system = `당신은 모바일 게임 '승리의 여신: 니케'의 조합 전문가입니다. 아래에 이미 확정된 5인 조합과 멤버들의 실제 데이터, 그리고 이 조합이 왜 강한지 설명하는 영어 참고 자료가 주어집니다.
당신의 역할은 새 조합을 만드는 것이 아니라, 이미 정해진 이 조합을 사용자에게 설명하는 것입니다 — members 구성을 바꾸거나 다른 조합을 제안하지 마세요.
참고 자료는 영어 원문이니 그대로 옮기지 말고 내용을 이해해서 ${langName}로 자연스럽게 재구성하세요. "~사이트에서 검증된", "~라는 이름의 조합"처럼 출처나 조합 이름을 언급하지 말고, 마치 이 조합을 직접 분석해서 설명하는 것처럼 쓰세요.
반드시 아래 JSON 형식으로만, 다른 설명이나 코드블록 표시 없이 출력하세요.
{"reasoning": "${langName}로 작성한 200~350자(영어는 60~120단어) 분량의 설명, 줄바꿈 없이 한 문단"}`;

  const userContent = `모드: ${modeLabel}

[확정된 조합]
${rosterText}

[참고 자료 — 영어 원문, 그대로 인용하지 말고 이 내용을 근거로만 사용]
${archetypeNote}

위 조합이 왜 좋은지 ${langName}로 자연스럽게 설명하세요.`;

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userContent }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      stop_sequences: ['}'],
    });
    const rawText = msg.content?.find((c) => c.type === 'text')?.text || '';
    const text = msg.stop_reason === 'stop_sequence' ? `${rawText}}` : rawText;
    const parsed = extractJson(text);
    if (parsed?.reasoning) return parsed.reasoning;
    console.error('explainMatchedTeam: failed to parse response', { stopReason: msg.stop_reason, textPreview: text.slice(0, 500) });
  } catch (err) {
    console.error('explainMatchedTeam error', err);
  }
  // AI 호출이 실패해도 영어 원문을 그대로 노출하지 않도록, 데이터 기반의 간단한 한국어
  // 대체 문구로 대신한다(가능한 경우는 드물지만 완전히 실패하지 않도록 하는 안전장치).
  return '커뮤니티에서 검증된 조합입니다. 버스트 I/II/III 단계가 모두 채워져 있어 안정적으로 풀버스트를 순환할 수 있습니다.';
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { characters, treasureIds, mode, bossElement, excludeTitles, lang } = body || {};

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
    const ownedTitleSet = new Set(characters.map((c) => c.title));

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

    const modeLabel = MODE_LABEL[mode] || mode || '캠페인';
    const langKey = LANG_NAMES[lang] ? lang : 'ko';
    const langName = LANG_NAMES[langKey];

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // 2026-08-06 추가: 유저가 "AI에게 매번 새로 짜게 하면서 규칙만 계속 추가하니 AI 사고가
    // 점점 경직된다"고 지적함. 로스터가 prydwen.gg 검증 조합(synergyNotes.archetypes, 500개 이상)과
    // 완전히 일치하면(5인 전원 보유 + 모드 호환 + 버스트 I/II/III 충족) "어떤 5명을 쓸지"는 AI에게
    // 맡기지 않고 그 조합을 그대로 확정한다. ambiguousBurst로 표시된(예: 레드후드처럼 prydwen 원본은
    // 버스트 역할별로 성능이 갈리는데 우리 DB는 버스트를 하나로 고정해둔 캐릭터가 포함된) 애매한
    // 조합은 이 매칭에서 제외되어 아래처럼 계속 AI가 자유롭게 구성한다.
    // 2026-08-06 수정(2차): 다만 확정된 조합의 "설명"까지 AI 없이 처리하면 archetype.note(영어
    // 원문)를 그대로 노출하거나 "~사이트에서 검증된 xxx 조합"처럼 불필요한 출처를 인용하는 문제가
    // 있어(유저 제보), 설명 문장만 explainMatchedTeam으로 가볍게 AI에게 맡긴다 — "구성"은 여전히
    // AI 없이 확정되고, "설명"만 자연스러운 문장으로 다듬는 저비용 호출이다.
    const exactMatch = findExactTeamMatch(characters, mode, {
      treasureIds: treasureIdSet,
      bossElement: bossElement || null,
      excludeTitles: Array.isArray(excludeTitles) ? excludeTitles : [],
    });
    if (exactMatch) {
      const byTitle = new Map(characters.map((c) => [c.title, c]));
      const fullMembers = exactMatch.members.map((m) => byTitle.get(m.title)).filter(Boolean);
      const aiReasoning = await explainMatchedTeam(
        client,
        fullMembers,
        exactMatch.archetypeNote,
        mode,
        modeLabel,
        treasureIdSet,
        langName
      );
      return Response.json({
        team: {
          formation: exactMatch.formation,
          members: exactMatch.members,
          totalScore: exactMatch.totalScore,
          reasons: exactMatch.reasons,
        },
        aiReasoning,
        model: 'prydwen-direct-match',
      });
    }

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
페어/아키타입의 note에 '경직적', '세트로 있어야만', '무조건 함께'처럼 두 캐릭터가 반드시 함께 있어야 성능이 나온다고 명시되어 있을 때만 그 페어를 완전히 갖추는 것이 중요한 것으로 취급하세요. 그렇게 명시되지 않은 페어(한쪽만 있어도 그 자체로 훌륭하고 나머지가 추가되면 보너스로 더 강해지는 페어)는, 나머지 멤버가 이번 조합에 없다고 해서 reasoning에서 "~를 추가하면 조합이 완성된다"처럼 필수인 것으로 과장하지 마세요 — "~가 있으면 추가로 강화된다" 정도로만 표현하세요. 또한 note에 특정 조작 방법(예: 정해진 순서로 버스트를 수동 발동해야 실제로 효과가 나는 경우)이 적혀 있다면 reasoning에 짧게 언급해 사용자가 참고할 수 있게 하세요.

[조합 구성 우선순위 — 반드시 이 순서를 따르세요. 캐릭터 개별 티어만 보고 버스트 단계별로 최고 티어를 하나씩 뽑는 방식(역할군 기반 조합)은 금지합니다]
1. 아래 '관련 이름 붙은 조합(아키타입)' 중 [완전 보유]로 표시된 것이 있다면 최우선으로 채택하세요. 여러 개를 동시에 채택할 수 있으면(예: 4인 코어 아키타입 + 남는 1자리에 다른 아키타입/페어 멤버) 그렇게 결합하세요. 단, 아키타입이나 페어의 note가 자신을 다른 아키타입/페어의 '상위호환' 또는 '대체재'라고 설명하는 경우는 예외입니다 — 이는 두 아키타입을 함께 채택하라는 뜻이 아니라 상위호환 쪽 하나만 고르라는 뜻입니다. 상위호환으로 지목된 캐릭터를 로스터에서 보유하고 있다면 그 아키타입만 채택하고, 대체재로 지목된 나머지 아키타입/멤버는(다른 완전 보유 아키타입/페어에 별도로 필요한 경우가 아니라면) 이번 조합에서 제외하세요.
2. 완전 보유한 아키타입만으로 5명이 다 안 채워지면, '관련 페어 시너지'에 있는 캐릭터 쌍을 최대한 함께 포함해 나머지 슬롯을 채우세요.
3. 그래도 남는 슬롯만 개별 모드 티어가 높은 캐릭터로 채우세요.
4. 위 아키타입/페어 자료에 이 로스터로 적용 가능한 것이 정말 하나도 없을 때만 순수 티어 기준으로 구성하고, 그 경우 reasoning 맨 앞에 "적용 가능한 아키타입/페어 자료가 없어 티어 기준으로 구성함"이라고 명시하세요.

[포메이션에 대한 주의사항] 포메이션(버스트I-II-III 인원수 비율, 예: 1-2-2)은 캐릭터를 잘 골라서 나온 "결과"일 뿐, 그 자체가 맞춰야 할 목표가 아닙니다. "이런 포메이션이 좋다고 하니 버스트 단계별로 인원수를 맞추자"는 식으로 거꾸로 생각하지 마세요.
같은 버스트 단계 캐릭터를 2명 이상 기용하는 것은 그 단계에 강력한 캐릭터가 많아서가 아니라, 구체적인 이유가 있을 때만 정당화됩니다: (a) 위 버스트 스킬 쿨타임을 보고, 그 단계의 캐릭터 쿨타임이 길어(대략 40초 이상) 매 풀버스트 사이클마다 준비되지 않을 수 있어 두 캐릭터가 번갈아 커버해야 하는 경우, (b) 완전 보유한 아키타입/페어 자료가 그 두 캐릭터를 실제로 명시하는 경우, 또는 (c) 로스터 목록에 '토템 후보'로 표시된 캐릭터가 있는 경우 — 이 캐릭터는 같은 단계의 다른 캐릭터가 이미 빠른 쿨타임(20초 이하)으로 매 사이클을 안정적으로 커버하고 있어 자신의 버스트 스킬은 실질적으로 발동하지 않더라도, 1/2스킬의 상시 버프(회복 등)만으로 팀에 가치를 더하는 서브 픽으로 기용할 수 있습니다(단, reasoning에 "토템으로 기용"이라고 명시하고 그 상시 버프가 무엇인지 언급하며, members 배열에서 이 토템 캐릭터는 반드시 같은 단계의 빠른 쿨타임 캐릭터보다 뒤쪽 — 즉 배열에서 더 나중 인덱스 — 에 배치하세요. 니케는 편성 순서상 왼쪽에 있는 캐릭터부터 버스트를 발동하므로, 토템을 앞쪽에 두면 의도와 반대로 토템이 매번 버스트를 가로채고 정작 그 단계를 안정적으로 커버해야 할 빠른 캐릭터가 밀려나 버립니다). 쿨타임이 짧은(20초 이하) 캐릭터 한 명으로 그 버스트 단계가 매 사이클 안정적으로 준비되고, 팀에 생존력/유틸리티가 추가로 필요하지 않다면 같은 단계에 2명을 넣을 이유가 없습니다.
반대 방향의 실수도 자주 발생합니다: 어떤 버스트 단계에 캐릭터를 1명만 배치했다면, 그 캐릭터의 버스트 스킬 쿨타임이 20초 전후로 빨라야 안전합니다. 그 유일한 캐릭터의 쿨타임이 40초 전후로 느리면 사이클마다 절반 가까이 버스트를 놓치게 되어 그 단계가 자주 비게 됩니다 — 이런 경우 반드시 같은 단계에 쿨타임이 빠른 캐릭터나 토템 후보를 1명 더 추가하세요. 동시에 이미 쿨타임이 빠른(20초 안팎) 캐릭터 한 명이 어떤 단계를 충분히 커버하고 있다면 그 단계에 인원을 더 채우지 말고, 그 여유 자리를 쿨타임이 느려 보강이 필요한 다른 단계나 팀 생존력/유틸리티에 쓰세요. 예를 들어 버스트I·II에 각각 쿨타임 빠른(20초) 캐릭터가 이미 1명씩 있는데 버스트III에 쿨타임 느린(40초) 캐릭터 1명만 있다면, 버스트I이나 II를 2명으로 채우는 것은 잘못된 선택이고 그 자리를 버스트III 보강(쿨타임 빠른 캐릭터나 토템 후보 추가)에 쓰는 것이 맞습니다. 같은 단계에 캐릭터를 2명 배치할 때 그 두 번째 자리를 무엇으로 채울지는 다음 기준으로 비교해서 고르세요: (1) 그 단계에 이미 쿨타임이 느린(대략 40초 전후) 캐릭터가 1명 있고, 후보 목록에 '토템 후보'로 표시된 다른 캐릭터가 있다면, 토템 후보는 자신의 버스트 스킬을 실제로 쓸 수 있는지와 전혀 무관하게(토템은 원래 버스트를 쓰지 않는 것을 전제로 하는 역할입니다) 오직 1/2스킬의 상시 효과만으로 가치를 인정받으므로, 그 상시 효과가 팀에 실질적으로 필요한지(예: 생존력이 부족한지, 이미 충분한 버프가 있는지)를 기준으로 기존 후보와 비교하세요. (2) 반대로 같은 단계에 쿨타임이 느린 캐릭터가 이미 2명 있어 서로 번갈아 버스트를 발동해 그 단계를 커버하는 구조라면(예: 40초 쿨타임 캐릭터 2명), 이 경우 둘 다 실제로 버스트를 발동하는 액티브 딜러 역할이지 토템이 아닙니다 — 이런 조합에서 한 명을 토템으로 바꾸면 그 단계가 버스트를 아예 못 쓰는 사이클이 생길 수 있으므로, 토템으로 교체하면 팀에 오히려 손해인지 반드시 따져보고, 손해라면 두 액티브 딜러 구성을 유지하세요.

[우선순위 규칙과 포메이션 주의사항이 충돌할 때] 위 [조합 구성 우선순위]에서 아키타입/페어를 채택하는 것은 "어떤 캐릭터를 포함할지"를 정하는 기준일 뿐입니다. 그렇게 고른 캐릭터들의 결과물이 [포메이션에 대한 주의사항]에서 설명한 조건(느린 단독 캐릭터 보강, 이미 빠른 캐릭터로 충분한 단계에 인원 중복 금지)을 어기지 않는지 반드시 마지막에 다시 검증하세요. 아키타입이 [완전 보유]라도, 그 아키타입의 나머지 멤버를 추가하는 것이 이미 빠른 쿨타임(20초 이하) 캐릭터 1명으로 충분히 커버되는 버스트 단계에 불필요하게 인원을 더하는 결과이면서 동시에 다른 버스트 단계는 쿨타임 느린(40초 전후) 캐릭터 1명만 남아 보강되지 않는 상태라면, 그 멤버 추가를 보류하고 그 슬롯을 느린 단계 보강(쿨타임 빠른 캐릭터나 토템 후보 추가)에 먼저 쓰세요 — 즉 아키타입 완전 보유보다 느린 단독 캐릭터 보강 규칙이 항상 우선합니다. 또한 '~ 솔로', '~ 원맨아미'처럼 그 캐릭터 혼자 자기 버스트 단계를 책임질 수 있다고 설명하는 아키타입(예: 안니스: 스타 솔로캐리, 베스갓 원맨아미)은 그 캐릭터가 같은 단계에 짝을 필요로 하지 않는다는 뜻일 뿐이며, 이를 근거로 그 단계에 인원을 추가로 채우지 마세요 — 그리고 이는 다른 버스트 단계가 보강을 필요로 하지 않는다는 뜻도 아닙니다. 특히, 이 원맨아미 캐릭터 자신의 버스트 스킬 쿨타임이 느리다면(예: 40초 전후), '원맨아미'라는 설명은 어디까지나 '같은 단계에 딜러 파트너가 필요 없다'는 뜻일 뿐 '쿨타임 안정성 문제가 해결된다'는 뜻이 아닙니다 — 위 [포메이션에 대한 주의사항]에서 설명한 단독 캐릭터 쿨타임 보강 규칙은 원맨아미 아키타입이 있어도 그대로 적용되므로, 그 단계에는 쿨타임이 빠르거나 토템 후보인 캐릭터를 반드시 추가하세요(딜러 경쟁을 하는 추가 딜러가 아니라 보강/버프용 캐릭터). 이때 다른 버스트 단계가 이미 쿨타임 빠른 캐릭터 1명으로 충분히 커버되고 있다면 그 단계에 인원을 더 채우지 말고, 원맨아미 단계의 보강에 그 자리를 쓰세요.

[필수 게임 규칙] 5인 조합은 버스트 I, II, III 단계 캐릭터를 각각 최소 1명씩 포함해야 하며, 5명은 모두 서로 다른 캐릭터여야 합니다.
당신의 역할은 주어진 데이터만 근거로 이 사용자에게 가장 좋은 5인 조합을 직접 구성하고 그 이유를 설명하는 것입니다.
매우 중요: 반드시 아래 JSON 형식으로만, 다른 설명이나 코드블록 표시 없이 JSON 객체 하나만 출력하세요.
- members 배열의 각 항목은 캐릭터 목록에 주어진 title 표기와 정확히 똑같이 쓰세요. 한글 이름이나 괄호 병기를 절대 덧붙이지 마세요. 예: "Rapi: Red Hood"는 맞고, "Rapi: Red Hood(라피)"는 틀립니다.
- members 배열의 순서는 실제 팀 편성의 왼쪽(1번)에서 오른쪽(5번) 위치를 그대로 의미합니다(임의 순서가 아닙니다) — 니케는 같은 버스트 단계 안에서 왼쪽에 있는 캐릭터부터 버스트를 발동하기 때문입니다. 같은 버스트 단계에 캐릭터가 2명 이상이라면, 실제로 매 사이클 버스트를 발동해야 할 캐릭터(쿨타임이 빠르거나 우선 발동해야 하는 캐릭터)를 배열에서 먼저(더 앞 인덱스) 쓰고, 토템 후보나 보조로 대기하는 캐릭터를 그 뒤에 쓰세요.
- reasoning은 반드시 ${langName}로 작성하세요(캐릭터 title 표기는 원문 그대로 영어로 두고, 설명 문장만 ${langName}로 씁니다). 줄바꿈 없이 한 문단으로, 200~350자(영어라면 60~120단어) 이내로 간결하게 작성하세요(길게 쓰지 마세요). 실제로 채택한 아키타입 이름이나 페어를 구체적으로 언급하세요(예: "캠페인 파밍 코어(아니스: 스타+크라운+...)를 채택하고 5번째 슬롯은..."). 같은 버스트 단계를 2명 이상 썼다면 그 이유(쿨타임 보완인지, 아키타입/페어 근거인지)도 짧게 밝히세요.
{"members": ["title 5개, 위 목록의 title 표기 그대로, 괄호나 한글 이름 금지"], "reasoning": "${langName}로 작성한 200~350자(영어는 60~120단어) 분량의 설명, 줄바꿈 없이 한 문단"}`;

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

    // 2026-08-03 5차 수정: 4차 수정(thinking: {type:'enabled', budget_tokens})도 400으로 거부됨:
    // '"thinking.type.enabled" is not supported for this model. Use "thinking.type.adaptive" and
    // "output_config.effort" to control thinking behavior.' -> MODEL(claude-sonnet-5)은 구형
    // extended-thinking API(엔전:budget_tokens)가 아니라 adaptive thinking + effort 레벨로
    // reasoning 강도를 조절하는 신형 API를 씀. 이 작업은 이미 시스템 프롬프트에 명시된
    // 우선순위 규칙을 그대로 적용하는 수준이라 깊은 추론이 필요 없으므로 effort를 'low'로
    // 낮춰 reasoning 단계 자체를 짧게 만든다.
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: 'user', content: userContent }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
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
