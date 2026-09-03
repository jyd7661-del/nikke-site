// 가이드 글에 실리는 **수치를 빌드 때 계산한다.** (2026-09-04, 애드센스 3차 반려 대응)
//
// 왜 계산하는가 — 글에 숫자를 손으로 적으면 데이터가 바뀐 순간 글이 거짓말이 된다.
// 이 사이트는 캐릭터가 늘고 시즌이 늘고 조합 표가 갱신된다. 그때마다 사람이 글을 고칠
// 수는 없다. 그래서 **문장은 사람이 쓰고 숫자는 여기서 만든다.**
//
// ⚠️ 도감(`/nikke`)의 원칙 "새 판정·점수·해석을 만들지 않는다"와 여기는 다르다.
//    가이드는 명시적으로 **분석 글**이라 해석이 들어간다. 다만 규칙은 그대로다:
//    **숫자는 전부 데이터 파일에서 기계적으로 따라 나와야 한다.** 지어내지 않는다.
//    화면에 나가는 모든 값은 `scripts/testGuides.mjs`가 원본과 대조한다.
//
// ⚠️ 합치면 안 되는 값이 있다(`docs/data.md`). 솔로레이드 `parses`는 서버별 표본이고
//    타워 `pctOfClears`는 풀 안의 비율이라 조합끼리 더하면 뜻이 없어진다. 여기서 세는 것은
//    **"몇 건의 조합에 등장하는가"** 하나뿐이다 — 그건 합산이 아니라 계수(count)라 안전하다.
import cdb from '@/data/characterDatabase.json';
import weapons from '@/data/weapons.json';
import solo from '@/data/soloRaidTeams.json';
import tower from '@/data/towerCompositions.json';
import meta from '@/data/metaStats.json';
import { memberName } from '@/lib/memberName';

const CHARS = Array.isArray(cdb) ? cdb : cdb.characters;
// ⚠️ 이름을 여기서 직접 고르지 않는다(`.claude/rules/ui-i18n.md`). name_kr을 손으로 집으면
//    이름 규칙이 두 곳으로 갈라지고, 그러면 언어 하나만 조용히 틀린다. memberName이
//    유일한 정의다 — 가이드는 한국어 글이라 'ko'로 고정해 부른다.
const BY_TITLE = new Map(CHARS.map((c) => [c.title, c]));
const krName = (title) => memberName(BY_TITLE.get(title), 'ko') || title;
const ID = new Map(CHARS.map((c) => [c.title, c.id]));

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

// ---------------------------------------------------------------------------
// 실사용 조합 — lib/usage.js와 같은 원본을 같은 방식으로 읽는다.
// (usage.js는 "캐릭터 한 명"을 위한 뷰라 전체 집계 함수가 없다. 여기서 다시 만든다.)
function buildEntries() {
  const out = [];
  (solo.seasons || []).forEach((s) => (s.teams || []).forEach((t) => out.push({ kind: 'raid', members: t.members || [] })));
  (tower.pools || []).forEach((p) => (p.teams || []).forEach((t) => out.push({ kind: 'tower', members: t.members || [] })));
  ((meta.campaignCompositions || {}).list || []).forEach((t) => out.push({ kind: 'campaign', members: t.members || [] }));
  ((meta.pvp || {}).topTeams || []).forEach((t) => out.push({ kind: 'pvp', members: t.members || [] }));
  return out;
}
const ENTRIES = buildEntries();

const countBy = (entries) => {
  const m = new Map();
  entries.forEach((e) => new Set(e.members).forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
  return m;
};
const APPEAR = countBy(ENTRIES);

const named = (title, n) => ({ title, kr: krName(title), id: ID.get(title) || null, n });

export const USAGE = {
  total: ENTRIES.length,
  byKind: {
    raid: ENTRIES.filter((e) => e.kind === 'raid').length,
    tower: ENTRIES.filter((e) => e.kind === 'tower').length,
    campaign: ENTRIES.filter((e) => e.kind === 'campaign').length,
    pvp: ENTRIES.filter((e) => e.kind === 'pvp').length,
  },
  charactersSeen: APPEAR.size,
  charactersTotal: CHARS.length,
  // 등장 횟수 상위. "몇 건의 조합에 이름이 있는가"이지 사용 횟수의 합이 아니다.
  top: [...APPEAR.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12).map(([t, n]) => named(t, n)),
  // 모드별 1위 — 같은 캐릭터가 모드마다 다른 얼굴을 가진다는 걸 보여준다.
  topByKind: Object.fromEntries(['raid', 'tower', 'campaign', 'pvp'].map((k) => {
    const c = countBy(ENTRIES.filter((e) => e.kind === k));
    return [k, [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([t, n]) => named(t, n))];
  })),
};

// 함께 등장하는 쌍. 조합의 뼈대가 무엇인지 드러난다.
export const PAIRS = (() => {
  const m = new Map();
  ENTRIES.forEach((e) => {
    const u = [...new Set(e.members)].sort();
    for (let i = 0; i < u.length; i += 1) {
      for (let j = i + 1; j < u.length; j += 1) m.set(`${u[i]}|${u[j]}`, (m.get(`${u[i]}|${u[j]}`) || 0) + 1);
    }
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([k, n]) => {
    const [a, b] = k.split('|');
    return { a: named(a, null), b: named(b, null), n };
  });
})();

// ---------------------------------------------------------------------------
// 버스트
const lastSkill = (c) => (c.skills || [])[(c.skills || []).length - 1];

export const BURST = {
  byStage: ['1', '2', '3'].map((b) => ({ stage: b, n: CHARS.filter((c) => String(c.burst) === b).length })),
  total: CHARS.length,
  flex: CHARS.filter((c) => c.burstFlex).map((c) => named(c.title, null)),
  reentry: CHARS.filter((c) => c.burstReentry).map((c) => named(c.title, null)),
  cooldowns: (() => {
    const m = new Map();
    CHARS.forEach((c) => {
      const s = lastSkill(c);
      const v = s && s.cd ? Number(s.cd) : null;
      if (v) m.set(v, (m.get(v) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([cd, n]) => ({ cd, n }));
  })(),
  // 풀버스트 1사이클은 20초다(엔진 상수). 쿨 40초짜리는 두 사이클에 한 번만 쓴다 —
  // 이것이 "쿨타임이 안 도는 조합"의 정체다.
  cycleSec: 20,
};

// ---------------------------------------------------------------------------
// 무기 — 계수·장탄·재장전은 Fandom(B), 연사속도는 아카라이브(B, 6초 상수로 교차검증).
const MOTION_SEC = 0.25;      // 차지 조준 모션. 출처 글이 "모션시간 0.25초 포함"이라 적었다.
const MAG_SEC = weapons.derived?.magazineSeconds ?? 6;

export const WEAPONS = {
  totalKinds: Object.values(weapons.byType || {}).reduce((a, r) => a + r.length, 0),
  magazineSeconds: MAG_SEC,
  source: weapons.meta?.source || null,
  fireRateSource: weapons.fireRate?._source || null,
  types: Object.entries(weapons.byType || {}).map(([t, rows]) => {
    const coef = median(rows.filter((r) => r.shotCoefPct).map((r) => r.shotCoefPct));
    const cap = median(rows.filter((r) => r.capacity).map((r) => r.capacity));
    const rel = median(rows.filter((r) => r.reloadSec).map((r) => r.reloadSec));
    const ct = median(rows.filter((r) => r.chargeTimeSec).map((r) => r.chargeTimeSec));
    const mult = median(rows.filter((r) => r.fullChargeMultPct).map((r) => r.fullChargeMultPct));
    const rate = ct ? 1 / (ct + MOTION_SEC) : cap / MAG_SEC;
    const perShot = coef * (ct ? mult / 100 : 1);
    const fireSec = cap / rate;
    const cycleSec = fireSec + rel;
    return {
      type: t, kinds: rows.length, coef, cap, rel,
      chargeSec: ct, chargeMult: mult,
      rate: Number(rate.toFixed(2)),
      fireSec: Number(fireSec.toFixed(1)),
      cycleSec: Number(cycleSec.toFixed(1)),
      dps: Number(((perShot * cap) / cycleSec).toFixed(1)),
    };
  }).sort((a, b) => b.dps - a.dps),
  // 6초 상수 — 두 출처가 서로를 검증한 지점. 이 글의 핵심이다.
  selfCheck: weapons.fireRate?._selfCheck?.table || null,
};
WEAPONS.spread = (() => {
  const d = WEAPONS.types.map((x) => x.dps);
  return Number((Math.max(...d) / Math.min(...d)).toFixed(1));
})();

// 풀차지 배율을 빼면 격차가 얼마나 벌어지는가 — 2026-09-03까지 우리가 그 상태였다.
// 글에서 "배율을 빼면 N배로 보인다"를 손으로 적지 않기 위해 여기서 계산한다.
WEAPONS.spreadWithoutCharge = (() => {
  const d = WEAPONS.types.map((x) => (x.chargeMult ? x.dps / (x.chargeMult / 100) : x.dps));
  return Number((Math.max(...d) / Math.min(...d)).toFixed(1));
})();

// 캐릭터가 실제로 어느 무기를 드는가 — 무기 타입별 인원.
export const WEAPON_POPULATION = ['sg', 'mg', 'smg', 'ar', 'sr', 'rl']
  .map((w) => ({ type: w, n: CHARS.filter((c) => c.weapon === w).length }))
  .filter((x) => x.n > 0);
