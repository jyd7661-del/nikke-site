#!/usr/bin/env node
/**
 * **실제 랭커 조합이 우리 시뮬레이터에서도 높게 나오는가.** (2026-09-09, 유저 지시)
 *
 *   node scripts/testRankerTeams.mjs
 *   node scripts/testRankerTeams.mjs --samples=1200   # 표본을 늘려 더 정밀하게
 *
 * 유저 지시: "시뮬레이션이 만들어지면 실제 랭커들이 사용하는 조합들이 우리 시뮬레이션에서도
 *            높은 점수가 나오는지 확인해야해."
 *
 * 이 프로젝트에서 시뮬레이터를 **조합 단위로** 검증하는 유일한 지표다.
 *   simulateTeams --selftest 의 ρ  → 캐릭터 1명짜리다. 조합을 안 잰다.
 *   솔로레이드 실측 avgDamage      → 투자 상태가 지배해 상관 0.01~0.15. 못 쓴다(docs/open-items.md).
 *   여기                           → 등록된 실사용 조합 214건이 **같은 풀의 무작위 조합보다 높은가**.
 *
 * ⚠️ **"맞다"의 증명이 아니다.** 등록 조합이 그 풀에서 최적이라는 보장이 없고(사람이 고른
 *    것이며 원소 상성·투자 상태가 섞여 있다), 우리 시뮬레이터는 원소·상성·CC를 아예 안 본다.
 *    다만 시뮬레이터가 **무의미하다면 50%가 나온다.** 50%에서 얼마나 떨어져 있는지를 잰다.
 *
 * 두 대조를 함께 낸다 — 난이도가 다르고, 쉬운 쪽만 보면 착각한다:
 *   ① 무작위 풀   실제 5명 + 무작위 15명. **멤버가 세면 이긴다** — 조합 능력을 안 잰다
 *   ② 메타 풀     그 출처의 등록 조합에 나온 캐릭터끼리만. **여기가 진짜 시험이다**
 *
 * ②는 버스트 1·2·3을 덮을 수 있는 조합끼리만 비교한다. 안 그러면 공격형 5명 같은
 * **작동하지 않는 조합**과 겨루게 되는데, 우리 시뮬레이터는 버스트 순환을 안 보므로
 * 그런 조합이 오히려 높게 나온다. 실측: 무작위 5인 중 버스트가 성립하는 것은 52%뿐이다.
 *
 * 래칫: 메타 풀 백분위의 **중앙값**이 기준선보다 떨어지면 실패한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const { scoreComposition } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'simulateTeams.mjs')).href);

// 기준선 — 메타 풀 백분위의 중앙값(%). 기본 표본 400에서 실측 70.5 (2026-09-09 버스트 쿨 감소 반영으로 69.5 → 70.5) (표본 1200이면 71.3 —
// 표본 수를 바꾸면 값이 조금 움직이므로 기준선은 기본값 기준이다). 떨어지면 시뮬레이터를 나쁘게 바꾼 것이다.
const EXPECTED_MEDIAN = 70;
// 씨앗이 고정이라 코드가 그대로면 값도 그대로다 — 여유를 크게 둘 이유가 없다.
// 2로 뒀더니 **버프를 통째로 무시하는 역테스트(69.5 → 67.5)가 빠져나갔다.** 1로 조인다.
const TOLERANCE = 1;
// 등록 조합인데 버스트 1·2·3을 못 덮는 것의 수. 0이어야 한다 — 데이터가 깨진 신호다.
const EXPECTED_REAL_INVALID = 0;

const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith('--' + n + '='));
  return m ? m.split('=')[1] : d;
};
const SAMPLES = Number(arg('samples', 400)) || 400;

const cdb = j('characterDatabase.json').filter((c) => (c.skills || []).length);
const byTitle = new Map(cdb.map((c) => [c.title, c]));

// 그 캐릭터가 채울 수 있는 버스트 단계. burstStages가 있으면 그것만, 없으면 기본 단계 하나.
// (lib/synergyEngine.js와 같은 취지 — 없는 유연함을 만들지 않는다)
const stagesOf = (c) => (Array.isArray(c.burstStages) && c.burstStages.length
  ? c.burstStages.map(String) : [String(c.burst)]);

/** 1·2·3단계를 서로 다른 멤버로 덮을 수 있는가. 5명이라 완전탐색이 싸다. */
function burstValid(team) {
  const need = ['1', '2', '3'];
  const used = Array(team.length).fill(false);
  const go = (i) => {
    if (i === need.length) return true;
    for (let k = 0; k < team.length; k++) {
      if (used[k] || !stagesOf(team[k]).includes(need[i])) continue;
      used[k] = true;
      if (go(i + 1)) return true;
      used[k] = false;
    }
    return false;
  };
  return go(0);
}

// --- 등록된 실사용 조합 (수집 규칙은 docs/data.md) ---
const teams = [];
j('soloRaidTeams.json').seasons.forEach((s) => (s.teams || []).forEach((t) =>
  teams.push({ src: '솔로레이드', m: t.members })));
j('towerCompositions.json').pools.forEach((p) => (p.teams || []).forEach((t) =>
  teams.push({ src: '타워', m: t.members })));
const ms = j('metaStats.json');
(ms.campaignCompositions?.list || []).forEach((t) => teams.push({ src: '캠페인', m: t.members }));
(ms.pvp?.topTeams || []).forEach((t) => teams.push({ src: 'PvP', m: t.members }));

// 출처별 메타 풀 — 그 출처의 등록 조합에 한 번이라도 나온 캐릭터
const metaPool = {};
for (const t of teams) {
  for (const n of t.m) {
    const c = byTitle.get(n);
    if (c) (metaPool[t.src] = metaPool[t.src] || new Set()).add(c.id);
  }
}

// 씨앗 고정 — 검사는 매번 같은 값을 내야 한다.
let seed = 13572468;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick5 = (pool) => {
  const p = [...pool]; const out = [];
  for (let i = 0; i < 5; i++) out.push(...p.splice(Math.floor(rnd() * p.length), 1));
  return out;
};

const easy = {}; const hard = {};
let realInvalid = 0; let drawn = 0; let kept = 0;
const rows = [];

for (const t of teams) {
  const real = t.m.map((x) => byTitle.get(x)).filter(Boolean);
  if (real.length !== 5) continue;
  if (!burstValid(real)) realInvalid += 1;
  const realScore = scoreComposition(real).total;

  // ① 무작위 풀 — 실제 5명 + 무작위 15명
  const ids = new Set(real.map((c) => c.id));
  const others = cdb.filter((c) => !ids.has(c.id));
  const rpool = [...real];
  for (let i = 0; i < 15; i++) rpool.push(...others.splice(Math.floor(rnd() * others.length), 1));
  // ⚠️ **동점을 절반으로 센다(중간 순위).** `<=`로 세면 **점수가 모두 같은 계산기가 100%**를
  //    받는다 — 아무것도 안 재는 검사기가 만점을 받는 셈이라 검사가 통째로 무의미해진다.
  //    중간 순위로 세면 상수 계산기는 정확히 50%가 된다.
  let belowE = 0;
  for (let k = 0; k < SAMPLES; k++) {
    const v = scoreComposition(pick5(rpool)).total;
    if (v < realScore - 1e-9) belowE += 1;
    else if (Math.abs(v - realScore) <= 1e-9) belowE += 0.5;
  }
  (easy[t.src] = easy[t.src] || []).push(belowE / SAMPLES * 100);

  // ② 메타 풀 — 버스트가 성립하는 조합끼리만
  const mpool = cdb.filter((c) => metaPool[t.src].has(c.id));
  let belowH = 0; let n = 0; let guard = 0;
  while (n < SAMPLES && guard < SAMPLES * 20) {
    guard += 1; drawn += 1;
    const cand = pick5(mpool);
    if (!burstValid(cand)) continue;
    kept += 1; n += 1;
    const v = scoreComposition(cand).total;
    if (v < realScore - 1e-9) belowH += 1;
    else if (Math.abs(v - realScore) <= 1e-9) belowH += 0.5;
  }
  if (n) {
    const pct = belowH / n * 100;
    (hard[t.src] = hard[t.src] || []).push(pct);
    rows.push({ src: t.src, m: t.m, pct });
  }
}

const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const line = '─'.repeat(84);
const problems = [];

console.log(line);
console.log('실제 랭커 조합이 시뮬레이터에서도 높게 나오는가 — 표본 ' + SAMPLES + '조합/팀 (씨앗 고정)');
console.log(line);
console.log('  50% = 무작위 조합과 같다는 뜻. 100%에 가까울수록 우리 계산이 실제 조합을 알아본다.');
console.log('');
console.log('  출처        팀   ① 무작위 풀(쉬움)      ② 메타 풀 · 버스트 성립(판정)');
for (const k of Object.keys(hard)) {
  const e = easy[k]; const h = hard[k];
  console.log('  ' + k.padEnd(10) + String(h.length).padStart(3)
    + '   중앙 ' + med(e).toFixed(1).padStart(5) + '% 평균 ' + avg(e).toFixed(1).padStart(5) + '%'
    + '   중앙 ' + med(h).toFixed(1).padStart(5) + '% 평균 ' + avg(h).toFixed(1).padStart(5) + '%'
    + '  50% 미만 ' + h.filter((x) => x < 50).length + '팀');
}
const allE = Object.values(easy).flat(); const allH = Object.values(hard).flat();
console.log('  ' + '전체'.padEnd(10) + String(allH.length).padStart(3)
  + '   중앙 ' + med(allE).toFixed(1).padStart(5) + '% 평균 ' + avg(allE).toFixed(1).padStart(5) + '%'
  + '   중앙 ' + med(allH).toFixed(1).padStart(5) + '% 평균 ' + avg(allH).toFixed(1).padStart(5) + '%');
console.log('');
console.log('  무작위 5인 중 버스트 1·2·3이 성립한 비율 ' + (kept / drawn * 100).toFixed(0) + '%'
  + ' · 등록 조합 중 버스트 불성립 ' + realInvalid + '팀');

if (process.argv.includes('--worst')) {
  console.log('\n  우리 계산이 가장 낮게 본 등록 조합 8건 — 여기에 우리가 못 보는 것이 있다');
  [...rows].sort((a, b) => a.pct - b.pct).slice(0, 8).forEach((r) =>
    console.log('    ' + r.pct.toFixed(1).padStart(5) + '%  [' + r.src + '] ' + r.m.join(', ')));
}

const m = med(allH);
if (m < EXPECTED_MEDIAN - TOLERANCE) {
  problems.push('메타 풀 백분위 중앙값이 기준선 ' + EXPECTED_MEDIAN + '% → ' + m.toFixed(1)
    + '%로 떨어졌다 — 시뮬레이터가 실제 조합을 덜 알아보게 된 것이다');
} else if (m > EXPECTED_MEDIAN + TOLERANCE) {
  console.log('\n  ✅ 중앙값이 ' + EXPECTED_MEDIAN + '% → ' + m.toFixed(1) + '%로 올랐다. EXPECTED_MEDIAN을 '
    + Math.floor(m) + '로 높일 것.');
}
if (realInvalid > EXPECTED_REAL_INVALID) {
  problems.push('등록된 실사용 조합 중 버스트 1·2·3을 못 덮는 것이 ' + realInvalid
    + '팀 있다 — burst/burstStages 데이터나 조합 수집이 깨진 신호다');
}

console.log('');
console.log('  ⚠️ ①은 쉬운 대조다. 멤버가 세면 이기므로 조합 능력을 안 잰다. 판정은 ②로 한다.');
console.log('  ⚠️ 우리 시뮬레이터는 원소 상성·CC·버스트 순환을 안 본다. PvP는 특히 못 믿는다.');
console.log(line);

if (problems.length) {
  console.log('\n문제 ' + problems.length + '건\n');
  problems.forEach((p, i) => console.log('  ' + (i + 1) + '. ' + p));
  console.log('');
  process.exit(1);
}
console.log('문제 0건\n');
