// 도감의 "실사용 데이터" 집계 — enikk.app에서 옮겨 온 조합 214건을 캐릭터별로 뒤집는다.
// (2026-08-25, 성장 계획: 도감 페이지에 우리만 가진 고유 정보를 붙인다)
//
// ■ 왜 만들었나
//   도감 196페이지의 본문은 전부 스킬 설명이고, 그건 남의 문장이다(prydwen·나무위키·game8).
//   반면 "이 캐릭터가 실제 조합 몇 건에 등장했고, 어느 보스·타워에서, 누구와 함께였는지"는
//   우리가 모아 집계한 값이라 어디에도 없다. docs/open-items.md '애드센스 저품질 판정' 참고.
//
// ■ 무엇을 만들어도 되고 무엇은 안 되는가
//   여기서 하는 일은 **세는 것뿐이다.** 등장 횟수·동반 등장 횟수는 원본에서 기계적으로 따라
//   나오는 값이라 새 판정이 아니다. 반대로 아래 두 가지는 **절대 하지 않는다**:
//
//   1. parses(솔로레이드)를 팀 간에 더하지 않는다.
//      soloRaidTeams.meta.caveat: "각 행은 (조합 × 서버) 단위다. parses는 전 서버 합계가
//      아니라 한 서버에서의 표본 수다." 서버가 표시되지 않으므로 더하면 뜻 없는 수가 된다.
//   2. pctOfClears(타워)를 풀 간에 더하지 않는다.
//      towerCompositions.meta.pctNote: "% of clears는 그 풀 안에서의 비율이다."
//
//   그래서 화면에 나가는 집계는 **팀 수**와 **동반 등장 횟수**뿐이고, parses·uses·wr 같은
//   원시 수치는 그 팀 한 줄에 붙은 값을 **그대로** 보여준다(A등급).
//
// ■ 서버 전용 모듈이다
//   metaStats(43KB) + soloRaidTeams(36KB) + towerCompositions(19KB)를 최상위에서 읽는다.
//   클라이언트 컴포넌트에서 import하면 이게 통째로 브라우저 번들에 실린다 —
//   lib/dex.js가 같은 이유로 lib/dexLabels.js를 떼어냈다(그 주석 참고). 페이지에서 호출해
//   **순수 데이터만** 클라이언트로 넘길 것.
import meta from '@/data/metaStats.json';
import solo from '@/data/soloRaidTeams.json';
import tower from '@/data/towerCompositions.json';

// ---------------------------------------------------------------------------
// 원본을 한 모양으로 편다. 여기서 만든 entry가 곧 화면 한 줄이다.
// ---------------------------------------------------------------------------
function buildEntries() {
  const out = [];

  // 솔로레이드 — 시즌마다 보스와 약점 속성이 다르다. 그게 이 조합의 조건이라 함께 싣는다.
  (solo.seasons || []).forEach((s) => {
    (s.teams || []).forEach((t) => {
      out.push({
        kind: 'raid',
        members: t.members || [],
        // 화면에 그대로 나갈 값들 (A등급). 합치지 않는다.
        raid: s.raid, boss: s.boss, weakness: s.weakness,
        parses: t.parses, maxDamage: t.maxDamage || null, avgDamage: t.avgDamage || null,
        // 표본 크기 비교용 정렬 키. 화면에 숫자로 노출하지 않는다.
        rank: t.parses || 0,
      });
    });
  });

  // 트라이브/기업 타워 — pool은 enikk의 '타워 로스터 풀' 칩이다.
  (tower.pools || []).forEach((p) => {
    (p.teams || []).forEach((t) => {
      out.push({
        kind: 'tower',
        members: t.members || [],
        pool: p.pool, tower: p.tower ?? null,
        uses: t.uses, pctOfClears: t.pctOfClears ?? null, floors: t.floors ?? null,
        rank: t.uses || 0,
      });
    });
  });

  // 캠페인
  ((meta.campaignCompositions || {}).list || []).forEach((t) => {
    out.push({
      kind: 'campaign',
      members: t.members || [],
      totalUses: t.totalUses, pctOfClears: t.pctOfClears ?? null,
      stages: t.stages ?? null, bossClears: t.bossClears ?? null,
      rank: t.totalUses || 0,
    });
  });

  // 챔피언 아레나 5인 — 슬롯 순서 변형은 원본 단계에서 이미 접혀 있다(metaStats.pvp.meta).
  ((meta.pvp || {}).topTeams || []).forEach((t) => {
    out.push({
      kind: 'pvp',
      members: t.members || [],
      wr: t.wr ?? null, n: t.n ?? null, adoption: t.adoption ?? null,
      rank: t.adoption || 0,
    });
  });

  return out;
}

const ENTRIES = buildEntries();

// PvP 부분 조합(2·3·4인). 5인 팀과 성격이 달라 등장 횟수에 섞지 않고 따로 둔다 —
// 섞으면 "몇 건에 등장" 이라는 말의 단위가 조합과 조합 조각으로 뒤죽박죽이 된다.
const PVP_SUBSETS = ['pairs', 'trios', 'quads'].flatMap((key) =>
  ((meta.pvp || {})[key] || []).map((t) => ({
    size: (t.members || []).length,
    members: t.members || [],
    wr: t.wr ?? null, n: t.n ?? null, adoption: t.adoption ?? null,
  })),
);

// 화면에 "214건 중 N건"이라고 쓸 때의 분모. 하드코딩하지 않는다 —
// 시즌이나 풀이 늘면 데이터만 갱신해도 문구가 따라가야 한다.
export const USAGE_TOTALS = {
  all: ENTRIES.length,
  raid: ENTRIES.filter((e) => e.kind === 'raid').length,
  tower: ENTRIES.filter((e) => e.kind === 'tower').length,
  campaign: ENTRIES.filter((e) => e.kind === 'campaign').length,
  pvp: ENTRIES.filter((e) => e.kind === 'pvp').length,
};

// enikk이 매긴 실사용 채용률 등급. **prydwen 티어와 다른 척도다** —
// enikk은 S가 최고인 6단계, prydwen은 SSS가 최고인 9단계다(docs/engine.md 4-2).
// 화면에서 두 표를 나란히 놓을 때 반드시 출처를 밝혀야 하는 이유다.
const TIER_SLICES = ['overall', 'campaign', 'soloraid', 'arena'];

// 언제 본 화면인지. 낡았는지 사람이 판단할 수 있어야 한다.
export const USAGE_SOURCE = {
  site: 'enikk.app',
  asOf: (meta.meta || {}).asOf || null,
  raidCapturedOn: (solo.meta || {}).capturedOn || null,
  campaignAsOf: ((meta.campaignCompositions || {}).meta || {}).asOf || null,
  pvpAsOf: ((meta.pvp || {}).meta || {}).asOf || null,
};

/**
 * 한 캐릭터의 실사용 데이터. 아무 데이터도 없으면 null을 돌려준다
 * (도감 198명 중 100명이 여기 해당한다 — enikk이 상위만 게시하기 때문이다.
 *  빈 절을 그리는 것보다 아예 안 그리는 쪽이 낫다. DexInvestment와 같은 방식).
 *
 * @param {string} title characterDatabase.json의 title(영문). id가 아니다 —
 *   enikk 원본이 영문 이름으로 되어 있고 checkData가 그 이름을 title과 대조해 지킨다.
 */
export function usageFor(title) {
  if (!title) return null;

  const mine = ENTRIES.filter((e) => e.members.includes(title));

  // 채용률 — 슬라이스마다 있을 수도 없을 수도 있다.
  const tiers = [];
  TIER_SLICES.forEach((slice) => {
    const row = ((meta.usageTier || {})[slice] || {})[title];
    if (row) tiers.push({ slice, tier: row.tier, usage: row.usage ?? null });
  });

  const subsets = PVP_SUBSETS.filter((s) => s.members.includes(title));

  if (mine.length === 0 && tiers.length === 0 && subsets.length === 0) return null;

  // 동반 등장 — 5인 조합 안에서 같이 나온 횟수. 자기 자신은 뺀다.
  const partnerCount = new Map();
  mine.forEach((e) => {
    e.members.forEach((m) => {
      if (m === title) return;
      partnerCount.set(m, (partnerCount.get(m) || 0) + 1);
    });
  });
  const partners = [...partnerCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, count]) => ({ title: t, count }));

  const byKind = (k) => mine.filter((e) => e.kind === k).sort((a, b) => b.rank - a.rank);

  return {
    counts: {
      all: mine.length,
      raid: byKind('raid').length,
      tower: byKind('tower').length,
      campaign: byKind('campaign').length,
      pvp: byKind('pvp').length,
    },
    tiers,
    partners,
    // 모드별로 표본이 가장 큰 것부터. 화면에서 몇 개를 쓸지는 페이지가 정한다.
    raid: byKind('raid'),
    tower: byKind('tower'),
    campaign: byKind('campaign'),
    pvp: byKind('pvp'),
    pvpSubsets: subsets.sort((a, b) => (b.adoption ?? 0) - (a.adoption ?? 0)),
  };
}

// 검사기(scripts/testDexUsage.mjs)가 쓰는 전수 목록. 화면은 쓰지 않는다.
export function allUsageTitles() {
  const s = new Set();
  ENTRIES.forEach((e) => e.members.forEach((m) => s.add(m)));
  PVP_SUBSETS.forEach((e) => e.members.forEach((m) => s.add(m)));
  TIER_SLICES.forEach((slice) => Object.keys((meta.usageTier || {})[slice] || {}).forEach((m) => s.add(m)));
  return [...s];
}
