import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { recommendTeams, findExactTeamMatch } from '@/lib/synergyEngine';
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

const DAILY_LIMIT = 8;
const MODEL = 'claude-sonnet-5';

const MODE_LABEL = { campaign: '캠페인', bossing: '보스전', pvp: 'PvP' };
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

    // 조합 "구성"은 전부 여기서 결정된다 — AI는 관여하지 않는다.
    // 1순위: 등록된 아키타입(prydwen 검증 조합) 중 요청 모드와 호환되고 5명 전원을 보유한 것이
    // 있으면, 그 중 티어 합이 가장 높은 것을 그대로 채택한다(findExactTeamMatch, 모드별로
    // 자동 분류됨 — MODE_COMPAT 참고).
    const exactMatch = findExactTeamMatch(characters, mode, {
      treasureIds: treasureIdSet,
      bossElement: bossElement || null,
      excludeTitles: Array.from(excludeSet),
    });

    let chosen;
    let archetypeNote = null;
    let matchSource;

    if (exactMatch) {
      chosen = exactMatch;
      archetypeNote = exactMatch.archetypeNote || null;
      matchSource = 'prydwen-exact-match';
    } else {
      // 2순위(폴백): 등록된 완전일치 조합이 하나도 없으면, 보유 로스터 전체를 대상으로
      // recommendTeams()(순수 개별 모드 티어 점수 합 최고 조합, 등록 여부 무관)를 돌린다.
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
      chosen = (pool.length > 0 ? pool : rec.teams)[0];
      matchSource = 'tier-rank';
    }

    const byTitle = new Map(characters.map((c) => [c.title, c]));
    const fullMembers = chosen.members.map((m) => byTitle.get(m.title)).filter(Boolean);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const aiReasoning = await explainChosenTeam(
      client,
      fullMembers,
      chosen.reasons,
      archetypeNote,
      mode,
      modeLabel,
      treasureIdSet,
      langName
    );

    return Response.json({
      team: {
        members: chosen.members,
        totalScore: chosen.totalScore,
        reasons: chosen.reasons,
      },
      aiReasoning,
      model: matchSource,
    });
  } catch (err) {
    console.error('ai-recommend error', err);
    return Response.json({ error: 'AI 추천을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
