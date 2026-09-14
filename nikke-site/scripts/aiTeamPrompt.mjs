/**
 * AI 조합 실험의 프롬프트 빌더 — experimentAiTeams(랭커 메타 재현)와 experimentThinRoster(얇은 로스터 × 유저 판정)가
 * **같은 프롬프트**를 쓰게 하려고 뺐다(2026-09-14). 두 실험의 차이는 로스터와 정답지뿐이어야 잣대가 비교된다.
 *
 * ⚠️ 출력은 바이트 단위로 안정적이어야 한다 — experimentAiTeams는 출처별 시스템 프롬프트를 캐시에 태우고,
 *    빼낸 뒤 옛 export 파일과 cmp로 대조했다(plain·tier 둘 다 동일).
 */
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
export const MODE_SLICE = { bossing: 'soloraid', tribe_tower: 'campaign', campaign: 'campaign', pvp: 'arena' };
export const usageOf = (metaStats, slice, title) => { const e = metaStats.usageTier?.[slice]?.[title]; return e ? { tier: e.tier, pct: e.usage } : null; };

// 로스터 한 줄. variant='tier'면 usage(등급·채용률)를 맨 앞에 붙인다.
export const rosterLine = (c, { variant, metaStats, slice }) => JSON.stringify({
  ...(variant === 'tier' ? { usage: usageOf(metaStats, slice, c.title) } : {}),
  // manufacturer는 타워 질문의 입장 조건 — 처음엔 빠져 있어서 하이쿠가 pilgrim 타워를 "로스터에 그런 제조사가 없다"고 거부했고(옳은 판단),
  // 다른 타워 답에는 남의 제조사가 섞였다(2026-09-14 서브에이전트 시험).
  title: c.title, class: c.class, burst: c.burst, element: c.element, weapon: c.weapon, manufacturer: c.manufacturer, overspec: !!c.overspec, squad: c.squad || null,
  skills: c.skills.map((s) => ({ name: s.name, type: s.type, cd: s.cd, desc: s.desc })),
});

export const systemPrompt = (rosterChars, { variant, metaStats, slice }) => [
  'You are an expert team builder for the mobile game GODDESS OF VICTORY: NIKKE.',
  'You will be given a roster (JSON, one character per line) and a content mode. Pick exactly 5 distinct characters from the roster that form the strongest team for that mode.',
  'Hard rules of the game:',
  '- A team needs Burst I, Burst II and Burst III stages covered by different members so Full Burst can trigger (some characters list burstStages that cover several stages).',
  '- Skills quoted are level-10 values. "Affects all allies" buffs reach every member; buffs that name a weapon/element/squad reach only matching members.',
  '- Do not invent characters; use the exact title strings from the roster.',
  ...(variant === 'tier' ? ['- "usage" is real adoption data from enikk.app for this content mode among top players: tier S > A > B > C, pct = share of tracked top teams that include the character. usage=null means the character is rarely used in this mode (tier D/F). Treat it as strong evidence of real strength, but the team must still satisfy the burst rule and fit the mode/boss.'] : []),
  'Return only the structured output.',
  '',
  'ROSTER:',
  rosterChars.map((c) => rosterLine(c, { variant, metaStats, slice })).join('\n'),
].join('\n');

// "Boss weakness element: Iron"은 모호했다 — 소넷이 문항마다 "보스가 철 속성"(→바람으로 친다)과 "철에 약하다"(→철로 친다)로 갈렸다.
// soloRaidTeams.weakness는 후자다(상위 10팀의 속성 분포가 그 속성으로 쏠린다). 2026-09-14
export const userPrompt = (t) => `Mode: ${MODE_LABEL[t.mode]}.` + (t.boss ? ` The boss is weak to ${t.boss}: ${t.boss}-element characters deal bonus damage to it.` : '') + (t.mode === 'tribe_tower' ? TOWER_RULE(t.tower) : '') + ' Choose the 5 members.';

// 채점에 같이 쓰는 버스트 성립 판정(유연 버스트 포함, 한 사람은 한 자리만).
const stagesOf = (c) => (Array.isArray(c.burstStages) && c.burstStages.length ? c.burstStages.map(String) : [String(c.burst)]);
export function burstValid(team) {
  const used = Array(team.length).fill(false);
  const go = (i) => { if (i === 3) return true; for (let k = 0; k < team.length; k++) { if (used[k] || !stagesOf(team[k]).includes(String(i + 1))) continue; used[k] = true; if (go(i + 1)) return true; used[k] = false; } return false; };
  return go(0);
}
export const towerEligible = (c, tower) => tower == null ? true : tower === 'pilgrim' ? (c.manufacturer === 'pilgrim' || !!c.overspec) : c.manufacturer === tower;
