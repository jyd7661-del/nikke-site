// 👎 피드백에 함께 저장하는 "그때 추천을 받은 조건" — 보유 니케·애장품·타워·역할·포함 니케·제외 목록. (2026-10-26)
//
// 왜: 첫 👎(10-25, 보스전 철갑)는 조합 5명만 남아 그 사람이 무엇을 갖고 있었는지 몰랐다.
//     "좋은 2버스트가 없었다"는 짐작으로 재현해야 했다. 이 값이 있으면 같은 요청을 그대로 다시 돌릴 수 있다.
// 👍에는 붙이지 않는다(유저와 정한 범위). 개인 정보는 없다 — 게임 니케 이름 목록이다.
//
// 순수 함수라 scripts/testFeedbackContext.mjs가 DB 없이 검사한다.

const MAX_TITLES = 400; // 니케 전체가 203명(10-26). 넉넉히 두되 무한정 받지는 않는다.
const MAX_TITLE_LEN = 60;
const MAX_TREASURES = 100;
const ROLES = new Set(['healer', 'tank']);
const TOWERS = new Set(['elysion', 'missilis', 'tetra', 'pilgrim']);

function cleanTitles(list, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const v of list) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (!s || s.length > MAX_TITLE_LEN || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// rating이 'down'이 아니거나 보유 니케가 없으면 null(저장 안 함).
export function cleanFeedbackContext(rating, ctx) {
  if (rating !== 'down' || !ctx || typeof ctx !== 'object') return null;
  const titles = cleanTitles(ctx.titles, MAX_TITLES);
  if (titles.length === 0) return null;
  return {
    titles,
    treasureIds: cleanTitles(Array.isArray(ctx.treasureIds) ? ctx.treasureIds.map(String) : [], MAX_TREASURES),
    tower: TOWERS.has(ctx.tower) ? ctx.tower : null,
    role: ROLES.has(ctx.role) ? ctx.role : null,
    requireTitle: cleanTitles([ctx.requireTitle], 1)[0] || null,
    excludeTitles: cleanTitles(ctx.excludeTitles, MAX_TITLES),
  };
}
