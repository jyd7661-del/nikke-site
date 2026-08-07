import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { recommendTeams } from '@/lib/synergyEngine';
import characterInvestmentNotes from '@/data/characterInvestmentNotes.json';
import synergyNotes from '@/data/synergyNotes.json';

// 보유 로스터에서 5인 조합을 추천하는 API.
//
// 2026-08-07 근본 수정: 유저가 이 세션에서 여러 차례("왜 자꾸 다중 조합에 추가 점수를 주는거야?
// 조합에 있는 니케 점수만 따지라고 했잖아") 반복 지적함. 지금까지(배포된 버전 + 이 파일의 이전
// 로컬 초안 모두) 이 엔드포인트는 두 가지 방식 중 하나로 동작했다:
// (1) findExactTeamMatch — synergyNotes.archetypes(prydwen 커뮤니티 조합 500여 개)에 등록되어
//     있고 5명 전원을 보유한 것만 후보로 놓고 그 중 티어 합이 가장 높은 것을 고른다.
// (2) 등록된 완전일치 조합이 없으면 AI에게 자유 구성을 맡기되, 시스템 프롬프트가 "완전 보유
//     아키타입 최우선, 개별 티어만 보고 고르는 방식은 금지"라고 명시적으로 강제했다.
// 두 방식 모두 "등록된 아키타입"이라는 틀 안에서만 움직인다는 공통된 한계가 있었다. 그 결과
// 예를 들어 티아/리타/아인/네온:비전아이/나가(개별 모드 티어 합 32)처럼 등록된 아키타입이기만
// 하면, 로스터에 실제로는 티어가 훨씬 높은 리틀머메이드/크라운/베스티: 전술강화/홍련: 흑영/
// 스노우화이트: 헤비암즈(티어 합 42) 같은 조합이 있어도 그 조합은 어떤 아키타입에도 등록되어
// 있지 않다는 이유만으로 절대 후보에 오르지 못했다.
//
// 근본 해결: 등록된 아키타입 여부와 무관하게, 보유 로스터 전체를 대상으로 lib/synergyEngine.js의
// recommendTeams()(가능한 버스트 I/II/III 분배 6가지 전부 탐색, 각 캐릭터의 이 모드 티어 점수
// 합만으로 정렬)를 돌려 나온 1위 조합을 그대로 채택한다. AI는 더 이상 "어떤 5명을 쓸지"를
// 전혀 결정하지 않고, 이미 확정된 조합이 왜 좋은지 설명하는 문장만 만든다 — 그 조합이 우연히
// 등록된 아키타입과 정확히 일치하면 그 아키타입의 참고 자료(archetypeNote)를 설명 근거로
// 함께 건네고, 아니면 scoreTeam의 reasons(개별 근거 문장)만 근거로 쓴다. 이렇게 하면 "조합
// 구성"과 "조합 설명"이 완전히 분리되어, 설명 프롬프트를 아무리 다듬어도 실제 구성(점수 계산)이
// 흔들리지 않는다 — 이번 세션에서 반복된 "프롬프트 규칙을 고쳐도 매번 똑같은 조합이 나온다"는
// 문제의 근본 원인이 "구성까지 AI/등록된 아키타입에 맡겼던 구조" 자체였기 때문이다.
export const runtime = 'nodejs';
// 2026-08-03 수정: 유저가 "AI 추천 버튼을 눌러도 아무것도 안 나온다"고 제보. 실제로 재현해보니
// 응답 자체는 오지만(200 OK) 로스터가 크면(20명 이상) 프롬프트가 커져 30~40초 가까이 걸림.
// Vercel의 기본 함수 실행 제한(설정 안 하면 플랜 기본값, Hobby 기준 상당히 짧음)에 걸려 응답이
// 오기 전에 함수가 죽으면 프론트는 별다른 에러 없이 "구성하는 중..."에서 멈춘 것처럼 보인다.
// maxDuration을 명시적으로 늘려 큰 로스터에서도 안전하게 끝까지 응답하도록 한다(Hobby 플랜 상한 60초).
export const maxDuration = 60;

const DAILY_LIMIT = 8;
const MODEL = 'claude-sonnet-5';

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
async function explainChosenTeam(client, fullMembers, reasons, archetypeNote, mode, modeLabel, treasureIdSet, langName) {
  const rosterText = fullMembers.map((c) => charSummaryLine(c, mode, treasureIdSet)).join('\n');
  const reasonsText = (reasons || []).map((r) => `- ${r}`).join('\n') || '(추가 근거 없음)';
  const noteBlock = archetypeNote
    ? `\n\n[참고: 이 조합은 커뮤니티에서 검증된 조합과도 일치합니다 — 아래는 그 조합에 대한 영어 참고 자료이니 그대로 인용하지 말고 내용만 참고하세요]\n${archetypeNote}`
    : '';

  const system = `당신은 모바일 게임 '승리의 여신: 니케'의 조합 전문가입니다. 아래에 이미 확정된 5인 조합과 멤버들의 실제 데이터, 그 조합이 채점된 근거 문장이 주어집니다.
이 조합은 캐릭터 개별 모드 티어 점수의 합만으로 이미 확정되었으므로, 당신의 역할은 새 조합을 만들거나 다른 조합을 제안하는 것이 아니라 이미 정해진 이 조합이 왜 좋은지 설명하는 것입니다 — members 구성을 바꾸지 마세요.
"~사이트에서 검증된", "~라는 이름의 조합"처럼 출처나 조합 이름을 언급하지 말고, 마치 이 조합을 직접 분석해서 설명하는 것처럼 자연스럽게 쓰세요.
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
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
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
  return (reasons || []).slice(0, 3).join(' ') || '보유 캐릭터 중 이 모드 티어 점수 합이 가장 높은 조합입니다.';
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
    const excludeSet = new Set(Array.isArray(excludeTitles) ? excludeTitles : []);

    // 조합 "구성"은 전부 여기서 결정된다 — AI는 관여하지 않는다. recommendTeams()가 가능한
    // 버스트 I/II/III 분배 6가지 전부를 탐색해 개별 모드 티어 점수 합이 가장 높은 조합부터
    // 정렬해 반환한다(lib/synergyEngine.js 참고).
    const rec = recommendTeams(characters, mode, {
      treasureIds: treasureIdSet,
      bossElement: bossElement || null,
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
    const chosen = (pool.length > 0 ? pool : rec.teams)[0];

    // 채택된 조합이 우연히 등록된 아키타입(prydwen 커뮤니티 조합)과 정확히 일치하면, 그
    // 아키타입의 참고 자료를 설명 근거로 함께 건넨다 — "구성"이 아니라 "설명"만 풍부해진다.
    const compatModes = MODE_COMPAT[mode] || [mode];
    const chosenTitleSet = new Set(chosen.members.map((m) => m.title));
    const matchedArchetype = synergyNotes.archetypes.find((a) => {
      const need = a.members || [];
      return (
        need.length === 5 &&
        new Set(need).size === 5 &&
        compatModes.includes(a.mode) &&
        need.every((m) => chosenTitleSet.has(m))
      );
    });

    const byTitle = new Map(characters.map((c) => [c.title, c]));
    const fullMembers = chosen.members.map((m) => byTitle.get(m.title)).filter(Boolean);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const aiReasoning = await explainChosenTeam(
      client,
      fullMembers,
      chosen.reasons,
      matchedArchetype ? matchedArchetype.note : null,
      mode,
      modeLabel,
      treasureIdSet,
      langName
    );

    return Response.json({
      team: {
        formation: chosen.formation,
        members: chosen.members,
        totalScore: chosen.totalScore,
        reasons: chosen.reasons,
      },
      aiReasoning,
      model: matchedArchetype ? 'tier-rank+prydwen-note' : 'tier-rank',
    });
  } catch (err) {
    console.error('ai-recommend error', err);
    return Response.json({ error: 'AI 추천을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
