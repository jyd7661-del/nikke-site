// **AI 설명 문단 프롬프트** — 운영(app/api/ai-recommend/route.js)과 실험(scripts/experimentExplain.mjs)이 같은 것을 쓴다(2026-10-08).
// 하이쿠 5.5(10-07)로 바꿀지 문장을 나란히 비교하려고 라우트 안에서 꺼냈다 — 실험이 다른 프롬프트를 쓰면 비교가 무의미하다
// (lib/aiTeamPrompt.js를 실험·운영이 공유하는 것과 같은 이유). ⚠️ 이 파일은 아무것도 import하지 않는다 — node 스크립트가 그대로 부른다.
// 데이터(투자 노트)는 인자로 받는다.

const MODE_TIER_KEY = { campaign: 'story', story: 'story', bossing: 'bossing', raid: 'bossing', pvp: 'pvp' };

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
export function charSummaryLine(c, mode, treasureIdSet, noteByName) {
  const tierKey = MODE_TIER_KEY[mode] || 'story';
  const note = noteByName?.get(c.title);
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
export function extractJson(text) {
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
export function clipForPrompt(text, maxLen) {
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

// 설명 프롬프트 — { system, userContent }. 인자는 옛 explainChosenTeam과 같고 noteByName(투자 노트 title→항목)만 더 받는다.
export function buildExplainPrompt({ fullMembers, reasons, archetypeNote, mode, modeLabel, treasureIdSet, langName, composeNote = null, noteByName }) {
  const rosterText = fullMembers.map((c) => charSummaryLine(c, mode, treasureIdSet, noteByName)).join('\n');

  // 아키타입 노트는 근거 문장 안에도 통째로 박혀 있고(synergyEngine이 "'X' 조합으로 알려진
  // 구성입니다. {note}" 형태로 만든다) 아래 noteBlock으로 한 번 더 보내진다. 같은 영어 원문을
  // 두 번 실어 보내던 셈이라, 근거 쪽에서는 빼고 noteBlock 하나만 남긴다.
  const deduped = (reasons || []).map((r) =>
    archetypeNote && r.includes(archetypeNote) ? r.replace(archetypeNote, '').trim() : r
  );

  const reasonsText =
    deduped.map((r) => `- ${clipForPrompt(r, MAX_REASON_CHARS)}`).join('\n') || '(추가 근거 없음)';
  const noteBlock = (archetypeNote
    ? `\n\n[참고: 이 조합은 커뮤니티에서 검증된 조합과도 일치합니다 — 아래는 그 조합에 대한 영어 참고 자료이니 그대로 인용하지 말고 내용만 참고하세요]\n${clipForPrompt(archetypeNote, MAX_NOTE_CHARS)}`
    : '') + (composeNote
    ? `\n\n[참고: 이 조합을 구성할 때의 의도(영어). 그대로 인용하지 말고 내용만 참고하세요]\n${clipForPrompt(composeNote, MAX_NOTE_CHARS)}`
    : '');

  const system = `당신은 모바일 게임 '승리의 여신: 니케'의 조합 전문가입니다. 아래에 이미 확정된 5인 조합과 멤버들의 실제 데이터, 그 조합이 채점된 근거 문장이 주어집니다.
이 조합은 캐릭터 개별 모드 티어 점수의 합만으로 이미 확정되었으므로, 당신의 역할은 새 조합을 만들거나 다른 조합을 제안하는 것이 아니라 이미 정해진 이 조합이 왜 좋은지 설명하는 것입니다 — members 구성을 바꾸지 마세요.
"~사이트에서 검증된", "~라는 이름의 조합"처럼 출처나 조합 이름을 언급하지 말고, 마치 이 조합을 직접 분석해서 설명하는 것처럼 자연스럽게 쓰세요.

[중요] 사용자가 지금 보유하지 않은 것을 장점으로 포장하지 마세요.
- 근거 문장에 "애장품을 갖추면 평가가 B → SS로 올라간다"처럼 적혀 있어도, 그건 지금 갖추지 못했다는 뜻이지 이 조합의 강점이 아닙니다. "향후 투자하면 좋아진다", "성장 잠재력이 있다", "장기적으로 유리하다" 같은 표현으로 미보유 상태를 긍정적으로 바꾸지 마세요.
- 사용자는 지금 당장 쓸 조합을 묻고 있습니다. 설명은 현재 상태 기준으로만 하세요.
- 애장품 미보유가 이 조합의 약점이라면 약점으로 짧게 언급하는 것은 괜찮습니다. 다만 그것을 장점으로 뒤집지는 마세요.

[중요] 반대 방향도 틀리면 안 됩니다 — 이미 보유한 것을 미보유처럼 쓰지 마세요.
- [확정된 조합]에 "애장품 보유"라고 적힌 캐릭터는 **지금 장착하고 있는 상태**입니다.
- 채점 근거에 "애장품을 장착하면 ~ 새로 생깁니다"처럼 조건형 문장이 있어도 그건 자료 원문의 말투일 뿐입니다. "애장품이 있다면", "애장품을 갖추면"처럼 **가정형으로 쓰지 말고**, 지금 그 효과를 쓰고 있는 것으로 단정해서 서술하세요.

[중요] 근거 문장에 "[조건 확인]"으로 시작하는 항목이 있으면 반드시 설명에 포함하세요.
- 그 캐릭터는 충분한 투자나 수동 조작 숙련이 갖춰졌을 때를 기준으로 티어가 매겨진 캐릭터입니다. 조건을 안 밝히면 이제 막 시작한 사용자가 등급만 보고 잘못 판단하게 됩니다.
- "○○는 투자가 많이 필요한 캐릭터라 육성이 덜 됐다면 기대만큼 안 나올 수 있습니다"처럼 짧고 담백하게 덧붙이세요. 겁을 주거나 조합 전체를 부정하는 투로 쓰지는 마세요.

[중요] 이 조합이 **어떤 구조인지**를 반드시 설명에 넣으세요. 이게 빠지면 사용자가 조합을 오해합니다.
- [확정된 조합]에 "토템 후보(버스트 대신 상시 버프/회복 역할 가능)"라고 적힌 캐릭터는 **버스트를 자주 쓰지 않고 상시 효과로 기여하는 자리**입니다. 버스트 단계만 보고 딜러처럼 서술하지 마세요. 예: 버스트3이라도 토템 자리면 "3버스트 딜러"가 아니라 "버스트를 아끼며 상시 버프·회복을 담당하는 자리"로 쓰세요.
- 실질 딜러가 한 명뿐이고 나머지가 버프·유틸이라면, **화력을 그 한 명에게 몰아주는 구성**이라는 점을 분명히 밝히세요. 딜러가 적어 보이는 것은 설계이지 결함이 아니지만, 말해주지 않으면 사용자는 "딜러가 1명뿐인데 괜찮나"라고 의심하게 됩니다.
- 스택을 모아 한 번에 터뜨리는 캐릭터가 있으면 그 운용도 한 마디로 짚어주세요.
- 이건 조합을 바꾸라는 뜻이 아닙니다. 이미 확정된 구성이 **왜 그렇게 생겼는지**를 설명하라는 뜻입니다.

반드시 아래 JSON 형식으로만, 다른 설명이나 코드블록 표시 없이 출력하세요.
{"reasoning": "${langName}로 작성한 200~350자(영어는 60~120단어) 분량의 설명, 줄바꿈 없이 한 문단"}`;

  const userContent = `모드: ${modeLabel}

[확정된 조합]
${rosterText}

[채점 근거]
${reasonsText}${noteBlock}

위 조합이 왜 좋은지 ${langName}로 자연스럽게 설명하세요.`;
  return { system, userContent };
}

// 요청 본문 — 모델에 따라 다른 것만 여기서 가른다.
// 설명은 이미 정해진 사실을 문장으로 옮기는 일이라 생각이 필요 없다(2026-08-08 하이쿠 4.5로 바꾸며 thinking을 뺐다 — 생각 토큰이 비용의 절반).
// 하이쿠 5.5부터는 적응형 생각이 **기본으로 켜져** 있어(effort medium) 그대로 두면 1024 상한을 생각이 먹을 수 있다 → 명시적으로 끈다.
export const EXPLAIN_MAX_TOKENS = 1024;
const THINKING_ON_BY_DEFAULT = new Set(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5']);
export function explainRequest(model, system, userContent) {
  return {
    model,
    max_tokens: EXPLAIN_MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: userContent }],
    ...(THINKING_ON_BY_DEFAULT.has(model) ? { thinking: { type: 'disabled' } } : {}),
    stop_sequences: ['}'],
  };
}
