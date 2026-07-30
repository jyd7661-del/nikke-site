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

export const runtime = 'nodejs';

const DAILY_LIMIT = 8;
const MODEL = 'claude-sonnet-5';
// Vercel 로그로 확인한 실제 원인: stopReason이 'max_tokens'인데 텍스트 블록은 비어 있었다 —
// 즉 모델이 응답용 텍스트를 쓰기 전에 내부적으로 토큰 예산을 다 써버린 것. max_tokens를
// 넉넉하게 잡아야 실제 JSON 출력까지 도달한다. (71명 같은 대형 로스터에서 재현됨)
const MAX_OUTPUT_TOKENS = 4096;

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

// 캐릭터 한 명을 AI 프롬프트용 한 줄 요약으로. characterDatabase.json 항목(c)을 그대로 받는다.
function charSummaryLine(c, mode, treasureIdSet) {
  const tierKey = MODE_TIER_KEY[mode] || 'story';
  const tier = c.tiers?.[tierKey] || '?';
  const note = INVESTMENT_NOTE_BY_NAME.get(c.title);
  const parts = [`버스트${c.burst}`, c.class || '', c.element || '', `이 모드 티어 ${tier}`];
  if (treasureIdSet.has(c.id)) parts.push('애장품 보유');
  else if (note?.treasureRequired) parts.push('애장품 미보유(공략상 권장)');
  return `- ${c.title}(${c.name_kr}): ${parts.filter(Boolean).join(', ')}`;
}

// 보유 로스터 중 이 모드와 관련된 "이름 붙은 조합(아키타입)". 로스터에 한 명이라도 포함되면
// AI가 참고할 수 있게 목록에 넣는다(완전 포함 여부는 AI가 직접 판단).
function relevantArchetypes(ownedTitleSet, mode) {
  const compat = MODE_COMPAT[mode] || [mode];
  return synergyNotes.archetypes.filter(
    (a) => compat.includes(a.mode) && (a.members || []).some((m) => ownedTitleSet.has(m))
  );
}

// 페어 시너지는 두 멤버 모두 보유하고 있을 때만 의미가 있으므로 완전 포함된 것만 넘긴다.
function relevantPairs(ownedTitleSet) {
  return synergyNotes.synergyPairs.filter((p) => (p.members || []).every((m) => ownedTitleSet.has(m)));
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
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
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
        .map((a) => `- '${a.name}' (필요: ${a.members.join(', ')}): ${a.note}`)
        .join('\n') || '(해당 없음)';
    const pairsText =
      relevantPairs(ownedTitleSet)
        .map((p) => `- ${p.members.join(' + ')}: ${p.reason}`)
        .join('\n') || '(해당 없음)';

    const system = `당신은 모바일 게임 '승리의 여신: 니케'의 조합을 실제로 구성하는 전문가입니다.
아래에 사용자가 실제로 보유한 캐릭터 목록과 각 캐릭터의 실제 데이터(모드별 티어, 버스트 단계, 클래스, 속성, 애장품 여부)가 주어집니다.
그 아래에는 커뮤니티에서 검증된 '이름 붙은 조합(아키타입)'과 캐릭터 페어 시너지가 주어집니다.
반드시 이 목록에 있는 캐릭터만 사용하세요. 목록에 없는 캐릭터나 자료에 없는 시너지를 지어내지 마세요.
[필수 게임 규칙] 5인 조합은 버스트 I, II, III 단계 캐릭터를 각각 최소 1명씩 포함해야 하며, 5명은 모두 서로 다른 캐릭터여야 합니다.
당신의 역할은 주어진 데이터만 근거로 이 사용자에게 가장 좋은 5인 조합을 직접 구성하고 그 이유를 설명하는 것입니다.
매우 중요: 반드시 아래 JSON 형식으로만, 다른 설명이나 코드블록 표시 없이 JSON 객체 하나만 출력하세요.
- members 배열의 각 항목은 캐릭터 목록에 주어진 title 표기와 정확히 똑같이 쓰세요. 한글 이름이나 괄호 병기를 절대 덧붙이지 마세요. 예: "Rapi: Red Hood"는 맞고, "Rapi: Red Hood(라피)"는 틀립니다.
- reasoning은 줄바꿈 없이 한 문단으로, 200~350자 이내로 간결하게 작성하세요(길게 쓰지 마세요).
{"members": ["title 5개, 위 목록의 title 표기 그대로, 괄호나 한글 이름 금지"], "reasoning": "200~350자 분량의 한국어 설명, 줄바꿈 없이 한 문단"}`;

    const excludeText =
      Array.isArray(excludeTitles) && excludeTitles.length > 0
        ? `\n이전에 추천한 조합(가능하면 겹치지 않는 다른 조합을 시도하세요): ${excludeTitles.join(', ')}`
        : '';

    const userContent = `모드: ${modeLabel}${bossElement ? ` (보스 약점 속성: ${bossElement})` : ''}${excludeText}

[보유 캐릭터 목록]
${rosterText}

[관련 이름 붙은 조합(아키타입)]
${archetypesText}

[관련 페어 시너지]
${pairsText}

위 데이터만 근거로 최고의 5인 조합을 구성하고 JSON으로 답하세요.`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = msg.content?.find((c) => c.type === 'text')?.text || '';
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
