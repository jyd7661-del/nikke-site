// AI 조합 구성 프롬프트 — 실험(scripts/experimentAiTeams.mjs·experimentThinRoster.mjs)과 운영
// (app/api/ai-recommend/route.js)이 **같은 파일**을 쓴다(2026-09-15, docs/ai-teams-plan.md §2·§7-2).
// 실험에서 잰 숫자(메타 80%·얇은 로스터 21:9)가 운영 프롬프트에 그대로 해당하려면 둘이 한 글자도 달라선 안 된다.
//
// ⚠️ 이 파일은 **아무것도 import하지 않는다.** JSON을 여기서 읽으면 스크립트가 node로 못 부른다
//    (.claude/rules/engine.md — `with { type: 'json' }` 문제). 데이터(metaStats·synergyNotes)는 호출자가 넘긴다.
// ⚠️ 출력은 바이트 단위로 안정적이어야 한다 — 정렬 고정, 날짜·ID 금지. v2(실험 1·2차) 프롬프트는
//    synergy·elementCycle을 안 넘기면 그대로 재현된다(scripts export를 cmp로 대조함).

// 프롬프트 버전. 응답 캐시 키에 들어간다 — 프롬프트를 고치면 반드시 올린다(옛 캐시가 그대로 나가는 걸 막는다).
//   v2: 규칙 + 로스터(스킬 원문 + usage 등급). 실험 1·2차·얇은 로스터 씨앗 1·2의 프롬프트.
//   v3: + 로스터 안에서 성립하는 시너지 짝/아키타입(synergyNotes, A등급) + 속성 순환 한 줄.
//       씨앗 2에서 엔진이 이긴 유형(크러스트→유키코, 나가+센티) 대응. 게이지 속도는 출처가 없어 안 넣는다.
export const PROMPT_VERSION = 'v3';

export const MODE_LABEL = {
  bossing: 'Solo Raid boss fight (single boss, 3-minute sustained damage race)',
  tribe_tower: 'Tribe Tower (stage clear; entry may be restricted by manufacturer)',
  campaign: 'Campaign stage clear (multiple enemies)',
  pvp: 'Champion Arena PvP (5v5, first to wipe the other side)',
};
// 타워 입장 조건 — enikk 풀 칩과 같다(towerCompositions.meta.poolNote): Tribe = 제한 없음, 제조사 3종 = 그 제조사만, pilgrim = 필그림 또는 overspec.
export const TOWER_RULE = (tw) => tw == null ? ' Tower: Tribe Tower (no manufacturer restriction).'
  : tw === 'pilgrim' ? ' Tower: Pilgrim/Over-Spec tower (only characters with manufacturer "pilgrim" or overspec=true may enter).'
  : ` Tower: ${tw} (only characters with manufacturer "${tw}" may enter).`;
// mode → metaStats.usageTier 슬라이스. 엔진 MODE_TO_META_SLICE와 같다(타워는 campaign).
export const MODE_SLICE = { bossing: 'soloraid', raid: 'soloraid', tribe_tower: 'campaign', campaign: 'campaign', story: 'campaign', pvp: 'arena' };
export const usageOf = (metaStats, slice, title) => { const e = metaStats?.usageTier?.[slice]?.[title]; return e ? { tier: e.tier, pct: e.usage } : null; };

// 로스터 한 줄. variant='tier'면 usage(등급·채용률)를 맨 앞에 붙인다.
export const rosterLine = (c, { variant, metaStats, slice }) => JSON.stringify({
  ...(variant === 'tier' ? { usage: usageOf(metaStats, slice, c.title) } : {}),
  // manufacturer는 타워 질문의 입장 조건 — 처음엔 빠져 있어서 하이쿠가 pilgrim 타워를 "로스터에 그런 제조사가 없다"고 거부했고(옳은 판단),
  // 다른 타워 답에는 남의 제조사가 섞였다(2026-09-14 서브에이전트 시험).
  title: c.title, class: c.class, burst: c.burst, element: c.element, weapon: c.weapon, manufacturer: c.manufacturer, overspec: !!c.overspec, squad: c.squad || null,
  skills: (c.skills || []).map((s) => ({ name: s.name, type: s.type, cd: s.cd, desc: s.desc })),
});

// synergyNotes의 아키타입 mode ↔ 요청 mode 호환. 엔진 MODE_COMPAT와 같은 취지(캠페인↔타워, 보스전↔레이드).
const ARCH_MODE_OK = {
  campaign: new Set(['campaign', 'tribe_tower']),
  tribe_tower: new Set(['campaign', 'tribe_tower']),
  bossing: new Set(['bossing', 'raid']),
  raid: new Set(['bossing', 'raid']),
  pvp: new Set(['pvp']),
};
// v3: 로스터 안에서 **전원이 보유된** 시너지 짝·아키타입만 고른다(A등급 — prydwen/enikk 원문).
// 영어 원문(name_en/note_en/reason_en)을 쓴다 — 프롬프트가 영어이고 lang은 설명 단계에서 따로 처리한다.
// 정렬은 이름 고정, 상한 30개(프롬프트 크기 상한 — 큰 로스터에선 아키타입이 수십 개 성립한다).
export function selectSynergyForRoster(synergyNotes, rosterTitles, mode, limit = 30) {
  const have = new Set(rosterTitles);
  const ok = ARCH_MODE_OK[mode] || ARCH_MODE_OK.campaign;
  const out = [];
  for (const p of synergyNotes?.synergyPairs || []) {
    if (!(p.members || []).length || !p.members.every((m) => have.has(m))) continue;
    out.push({ kind: 'pair', name: p.type || p.members.join(' + '), members: p.members, note: p.reason_en || p.reason || '' });
  }
  for (const a of synergyNotes?.archetypes || []) {
    if (a.notRecommended) continue;
    if (a.mode && !ok.has(a.mode)) continue;
    if (!(a.members || []).length || a.members.length < 2 || !a.members.every((m) => have.has(m))) continue;
    out.push({ kind: 'team', name: a.name_en || a.name, members: a.members, note: a.note_en || a.note || '' });
  }
  out.sort((x, y) => x.members.length - y.members.length || x.name.localeCompare(y.name));
  return out.slice(0, limit);
}

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    members: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['members', 'reasoning'],
  additionalProperties: false,
};

// 시스템 프롬프트. rosterChars = characterDatabase 항목 배열(정렬은 호출자가 고정한다).
//   variant     : 'plain' | 'tier'  (운영은 항상 'tier')
//   synergy     : selectSynergyForRoster() 결과. 넘기지 않으면 v2와 바이트 동일.
//   elementCycle: synergyNotes.mechanics.elementCycle. 넘기지 않으면 v2와 바이트 동일.
export const systemPrompt = (rosterChars, { variant, metaStats, slice, synergy, elementCycle }) => [
  'You are an expert team builder for the mobile game GODDESS OF VICTORY: NIKKE.',
  'You will be given a roster (JSON, one character per line) and a content mode. Pick exactly 5 distinct characters from the roster that form the strongest team for that mode.',
  'Hard rules of the game:',
  '- A team needs Burst I, Burst II and Burst III stages covered by different members so Full Burst can trigger (some characters list burstStages that cover several stages).',
  '- Skills quoted are level-10 values. "Affects all allies" buffs reach every member; buffs that name a weapon/element/squad reach only matching members.',
  '- Do not invent characters; use the exact title strings from the roster.',
  ...(variant === 'tier' ? ['- "usage" is real adoption data from enikk.app for this content mode among top players: tier S > A > B > C, pct = share of tracked top teams that include the character. usage=null means the character is rarely used in this mode (tier D/F). Treat it as strong evidence of real strength, but the team must still satisfy the burst rule and fit the mode/boss.'] : []),
  ...(elementCycle ? [`- Element cycle (each beats the next, +10% damage; a small bonus — burst coverage, CDR and role balance matter more): ${(elementCycle.order || []).join(' > ')} > ${(elementCycle.order || [])[0] || ''}.`] : []),
  'Return only the structured output.',
  '',
  'ROSTER:',
  rosterChars.map((c) => rosterLine(c, { variant, metaStats, slice })).join('\n'),
  ...(synergy && synergy.length ? [
    '',
    'KNOWN SYNERGIES AVAILABLE IN THIS ROSTER (from published guides and real clear data; every member listed is owned):',
    ...synergy.map((s) => JSON.stringify({ kind: s.kind, name: s.name, members: s.members, note: s.note })),
  ] : []),
].join('\n');

// "Boss weakness element: Iron"은 모호했다 — 소넷이 문항마다 "보스가 철 속성"(→바람으로 친다)과 "철에 약하다"(→철로 친다)로 갈렸다.
// soloRaidTeams.weakness는 후자다(상위 10팀의 속성 분포가 그 속성으로 쏠린다). 2026-09-14
export const userPrompt = (t) => `Mode: ${MODE_LABEL[t.mode] || MODE_LABEL.campaign}.` + (t.boss ? ` The boss is weak to ${t.boss}: ${t.boss}-element characters deal bonus damage to it.` : '') + (t.mode === 'tribe_tower' ? TOWER_RULE(t.tower) : '') + ' Choose the 5 members.';

// 채점·검산에 같이 쓰는 버스트 성립 판정(유연 버스트 포함, 한 사람은 한 자리만).
const stagesOf = (c) => (Array.isArray(c.burstStages) && c.burstStages.length ? c.burstStages.map(String) : [String(c.burst)]);
export function burstValid(team) {
  const used = Array(team.length).fill(false);
  const go = (i) => { if (i === 3) return true; for (let k = 0; k < team.length; k++) { if (used[k] || !stagesOf(team[k]).includes(String(i + 1))) continue; used[k] = true; if (go(i + 1)) return true; used[k] = false; } return false; };
  return go(0);
}
export const towerEligible = (c, tower) => tower == null ? true : tower === 'pilgrim' ? (c.manufacturer === 'pilgrim' || !!c.overspec) : c.manufacturer === tower;
