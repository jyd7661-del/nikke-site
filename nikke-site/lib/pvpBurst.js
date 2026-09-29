/**
 * PvP 팀 버스트 속도 — `data/pvpBurstGen.json`(커뮤니티 계산기 시트, 생성: scripts/refreshPvpBurstGen.mjs)으로 계산한다. (2026-09-29)
 *
 * 규칙은 출처 가이드 그대로다(prydwen /nikke/guides/pvp-burst): 단계마다 5명 값을 더해 **100 이상이 되는 가장 빠른 단계**가
 * 그 팀의 버스트 속도. 2RL(가장 빠름) · 2.5RL · 3RL · 3.5RL · 4RL, 그보다 느리면 'slower'(가이드: "4RL보다 느린 팀은 권하지 않는다").
 *
 * ⚠️ 한 명이라도 값이 없으면 **tier = null(모름)**이다. 없는 사람을 0이나 무기 평균으로 채우지 않는다(원칙 2) —
 *    0으로 채우면 신캐가 든 팀이 "느린 팀"으로 조용히 깎인다(원칙 3).
 *
 * 데이터를 인자로 받는다 — 노드 스크립트가 JSON을 직접 넘겨 쓸 수 있게 import가 없다.
 *
 * `treasure`: 애장품을 가진 캐릭터 title 집합(Set). 시트에 애장품 행이 있으면(헬름·라플라스·드레이크) 그 행을 쓴다 —
 *   헬름은 2RL 값이 5.6 → 39.82로 7배다. 여럿이면 첫 행(시트 순서상 최대 스킬 조건)이다. 없으면 기본 행.
 */
const genOf = (t, data, treasure) => {
  if (treasure?.has(t)) {
    const v = (data.variants?.[t] || []).find((x) => /^Treasure/.test(x.condition || ''));
    if (v) return v.gen;
  }
  return data.byTitle[t].gen;
};

export function teamBurstSpeed(titles, data, { treasure } = {}) {
  const tiers = data.tiers;
  const missing = titles.filter((t) => !data.byTitle[t]);
  if (missing.length) return { tier: null, index: null, sums: null, missing };
  const sums = tiers.map((_, k) => titles.reduce((s, t) => s + genOf(t, data, treasure)[k], 0));
  const index = sums.findIndex((s) => s >= 100 - 1e-9);
  return { tier: index >= 0 ? tiers[index] : 'slower', index: index >= 0 ? index : tiers.length, sums, missing };
}

/**
 * 비교용 연속값 — 클수록 빠르다. 단계가 같으면 **한 단계 더 빠른 쪽에 얼마나 가까운가**(그 단계 합 / 100)로 가른다.
 * 값이 없으면 null.
 */
export function burstSpeedScore(titles, data, opts) {
  const r = teamBurstSpeed(titles, data, opts);
  if (!r.tier) return null;
  const n = data.tiers.length;
  const nearer = r.index > 0 ? r.sums[r.index - 1] / 100 : r.sums[0] / 100;
  return (n - r.index) + Math.min(nearer, 1);
}
