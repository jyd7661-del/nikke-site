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
import { towerEligible } from '../lib/aiTeamPrompt.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const { scoreComposition } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'simulateTeams.mjs')).href);

// 기준선 — 메타 풀 백분위의 중앙값(%). 기본 표본 400에서 실측 70.5 (2026-09-09 버스트 쿨 감소 반영으로 69.5 → 70.5) (표본 1200이면 71.3 —
// 표본 수를 바꾸면 값이 조금 움직이므로 기준선은 기본값 기준이다). 떨어지면 시뮬레이터를 나쁘게 바꾼 것이다.
// 2026-09-29 속성 우위 반영(레이드를 그 시즌 약점으로 채점) 69 → 72.
// 같은 날 타워를 입장 가능 캐릭터끼리 비교(채점 공정성 — 모델은 그대로) 72 → 74. 타워 중앙은 오히려 68.3 → 64.5로 내려갔다(`--by-pool`).
// 2026-10-01 고정 피해(딜 계수 `as true damage` 9절 + True Damage ▲ 버프를 고정 피해 몫에만) 74.3 → 75.8.
//   레이드 77.3 → 76.0 · 타워 65.8 → 60.0(엘리시온 68.3 → 55.9 — 택티컬 업 3인 팀이 올라 메이드 조합이 상대적으로 밀림) · PvP 67.8 → 76.8.
// 2026-10-03 **정답 데이터가 바뀌어** 75.3 → 73.0: PvP 상위 조합을 시즌 38(22팀) → 39(19팀)로 갱신 — 레이드·타워·캠페인 줄은 그대로, PvP 중앙 76.8 → 73.0.
//   옛 데이터로 돌리면 문제 0건(같은 코드)이라 시뮬레이터 퇴행이 아니다. 기준선을 새 정답에 맞춘다.
const EXPECTED_MEDIAN = 73;
// 씨앗이 고정이라 코드가 그대로면 값도 그대로다 — 여유를 크게 둘 이유가 없다.
// 2로 뒀더니 **버프를 통째로 무시하는 역테스트(69.5 → 67.5)가 빠져나갔다.** 1로 조인다.
const TOLERANCE = 1;
// 등록 조합인데 버스트 1·2·3을 못 덮는 것의 수. 0이어야 한다 — 데이터가 깨진 신호다.
const EXPECTED_REAL_INVALID = 0;
// PvP 버스트 속도 백분위(아래 절). 2026-09-29 첫 측정: 값 있는 12팀 중앙 74.5%(같은 12팀의 딜 계산 ②는 0.5%·2.5%짜리가 섞여 있었다).
// 역테스트: 캐릭터끼리 값을 뒤섞으면(--shuffle-burst-gen) 48.4% — 이 기준선에 걸린다.
// 대조: 헬름·라플라스·드레이크를 애장품 보유로 보면(--treasure) 92.8%(헬름 2RL 값 5.6 → 39.82). enikk 등록 조합엔 애장품 여부가 없어 기본은 미보유.
// 2026-10-03 시즌 39 갱신으로 값 있는 팀 12 → 10, 중앙 76.6 → 69.8(정답 팀이 바뀜 — 옛 데이터로는 같은 코드에서 76.6).
const EXPECTED_PVP_BURST_MEDIAN = 70;
// 값을 잴 수 있는 PvP 등록 팀 수 — 신캐(아니스: 스타·라플라스: 얼티밋 히어로·네온: 비전 아이)가 시트에 없어 22팀 중 10팀이 빠진다.
// 줄면 이름 연결이나 데이터가 깨진 것이다. 늘면(시트가 신캐를 추가) 올린다.
const EXPECTED_PVP_BURST_TEAMS = 10;   // 2026-10-03 시즌 39(19팀 중 9팀에 시트에 없는 캐릭터)

const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith('--' + n + '='));
  return m ? m.split('=')[1] : d;
};
const SAMPLES = Number(arg('samples', 400)) || 400;
// --unfair-tower : 2026-09-29 이전처럼 타워도 입장 규칙 없이 비교(대조용)
const FAIR_TOWER = !process.argv.includes('--unfair-tower');

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
  teams.push({ src: '솔로레이드', m: t.members, boss: s.weakness })));
j('towerCompositions.json').pools.forEach((p) => (p.teams || []).forEach((t) =>
  teams.push({ src: '타워', m: t.members, pool: p.pool, tower: p.tower ?? null })));
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
  // 레이드는 **그 시즌 보스 약점**으로 채점한다(2026-09-29 — 시뮬레이터가 속성 우위를 안 볼 때 레이드 125팀 중 39팀이 50% 미만이었다).
  const so = t.boss ? { bossElement: t.boss } : {};
  const realScore = scoreComposition(real, so).total;

  // ① 무작위 풀 — 실제 5명 + 무작위 15명
  const ids = new Set(real.map((c) => c.id));
  // 기업 타워는 **그 타워에 들어갈 수 있는 캐릭터끼리** 비교한다(2026-09-29). 그전에는 입장 불가 캐릭터가 섞인 조합과
  // 겨뤄 채점이 불공정했다 — 레이드를 그 시즌 약점으로 채점한 것과 같은 종류의 수정. 규칙은 엔진·AI 검산기와 같은 towerEligible.
  const eligible = (c) => (t.src === '타워' && FAIR_TOWER ? towerEligible(c, t.tower) : true);
  const others = cdb.filter((c) => !ids.has(c.id) && eligible(c));
  const rpool = [...real];
  for (let i = 0; i < 15; i++) rpool.push(...others.splice(Math.floor(rnd() * others.length), 1));
  // ⚠️ **동점을 절반으로 센다(중간 순위).** `<=`로 세면 **점수가 모두 같은 계산기가 100%**를
  //    받는다 — 아무것도 안 재는 검사기가 만점을 받는 셈이라 검사가 통째로 무의미해진다.
  //    중간 순위로 세면 상수 계산기는 정확히 50%가 된다.
  let belowE = 0;
  for (let k = 0; k < SAMPLES; k++) {
    const v = scoreComposition(pick5(rpool), so).total;
    if (v < realScore - 1e-9) belowE += 1;
    else if (Math.abs(v - realScore) <= 1e-9) belowE += 0.5;
  }
  (easy[t.src] = easy[t.src] || []).push(belowE / SAMPLES * 100);

  // ② 메타 풀 — 버스트가 성립하는 조합끼리만
  const mpool = cdb.filter((c) => metaPool[t.src].has(c.id) && eligible(c));
  let belowH = 0; let n = 0; let guard = 0;
  while (n < SAMPLES && guard < SAMPLES * 20) {
    guard += 1; drawn += 1;
    const cand = pick5(mpool);
    if (!burstValid(cand)) continue;
    kept += 1; n += 1;
    const v = scoreComposition(cand, so).total;
    if (v < realScore - 1e-9) belowH += 1;
    else if (Math.abs(v - realScore) <= 1e-9) belowH += 0.5;
  }
  if (n) {
    const pct = belowH / n * 100;
    (hard[t.src] = hard[t.src] || []).push(pct);
    rows.push({ src: t.src, m: t.m, pct, pool: t.pool });
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

// --- PvP 버스트 속도 (2026-09-29) ---
// 위 ②의 PvP 줄은 **딜 계산**이라 PvP를 못 잰다. 딜 계산이 가장 낮게 본 PvP 등록 조합(0.5%·2.5%)이 전부 클립 RL·SG
// 배터리 팀이었다 — PvP는 먼저 버스트하는 쪽이 이긴다. 그래서 PvP는 **버스트 속도만으로** 따로 잰다(lib/pvpBurst.js,
// data/pvpBurstGen.json). 메타 풀·버스트 성립·중간 순위는 ②와 같다. 한 명이라도 값이 없는 조합은 양쪽 다 뺀다(모름 ≠ 느림).
// --shuffle-burst-gen : 역테스트 — 캐릭터끼리 값을 뒤섞으면 50% 근처로 떨어져야 한다.
// --treasure : 시트에 애장품 행이 있는 캐릭터(헬름·라플라스·드레이크)를 전부 애장품 보유로 본다(등록 조합·무작위 조합 모두).
//   enikk 등록 조합에는 애장품 여부가 없다 — 그래서 기본은 애장품 없음이고, 이 스위치는 대조용이다.
const { teamBurstSpeed, burstSpeedScore } = await import(pathToFileURL(path.join(ROOT, 'lib', 'pvpBurst.js')).href);
const burstGen = j('pvpBurstGen.json');
if (process.argv.includes('--shuffle-burst-gen')) {
  const ks = Object.keys(burstGen.byTitle); const vs = ks.map((k) => burstGen.byTitle[k]);
  for (let i = vs.length - 1; i > 0; i--) { const r = Math.floor(rnd() * (i + 1)); [vs[i], vs[r]] = [vs[r], vs[i]]; }
  burstGen.byTitle = Object.fromEntries(ks.map((k, i) => [k, vs[i]]));
}
const TREASURE = process.argv.includes('--treasure')
  ? new Set(Object.entries(burstGen.variants || {}).filter(([, v]) => v.some((x) => /^Treasure/.test(x.condition || ''))).map(([k]) => k)) : null;
const bo = { treasure: TREASURE };
const pvpBurst = []; let pvpBurstUnknown = 0;
for (const t of teams.filter((x) => x.src === 'PvP')) {
  const realS = burstSpeedScore(t.m, burstGen, bo);
  if (realS == null) { pvpBurstUnknown += 1; continue; }
  const mpool = cdb.filter((c) => metaPool.PvP.has(c.id) && burstGen.byTitle[c.title]);
  let below = 0; let n = 0; let guard = 0;
  while (n < SAMPLES && guard < SAMPLES * 20) {
    guard += 1;
    const cand = pick5(mpool);
    if (!burstValid(cand)) continue;
    n += 1;
    const v = burstSpeedScore(cand.map((c) => c.title), burstGen, bo);
    if (v < realS - 1e-9) below += 1;
    else if (Math.abs(v - realS) <= 1e-9) below += 0.5;
  }
  pvpBurst.push({ m: t.m, pct: below / n * 100, tier: teamBurstSpeed(t.m, burstGen, bo).tier });
}
const pvpBurstMed = pvpBurst.length ? med(pvpBurst.map((x) => x.pct)) : null;
console.log('');
console.log('  PvP 버스트 속도(딜 계산 대신) — 값 있는 ' + pvpBurst.length + '팀 중앙 ' + (pvpBurstMed ?? NaN).toFixed(1) + '% · 50% 미만 '
  + pvpBurst.filter((x) => x.pct < 50).length + '팀 · 값 없는 멤버가 있어 뺀 ' + pvpBurstUnknown + '팀'
  + ' (시트 v' + burstGen.source.version + ')');
if (process.argv.includes('--worst')) {
  [...pvpBurst].sort((a, b) => a.pct - b.pct).forEach((r) =>
    console.log('    ' + r.pct.toFixed(1).padStart(5) + '%  ' + String(r.tier).padEnd(6) + r.m.join(', ')));
}
if (pvpBurstMed == null || pvpBurstMed < EXPECTED_PVP_BURST_MEDIAN - TOLERANCE) {
  problems.push('PvP 버스트 속도 백분위 중앙값이 기준선 ' + EXPECTED_PVP_BURST_MEDIAN + '% → ' + (pvpBurstMed ?? NaN).toFixed(1)
    + '% — 버스트 수급 데이터(data/pvpBurstGen.json)나 lib/pvpBurst.js가 깨졌을 수 있다');
}
if (pvpBurst.length < EXPECTED_PVP_BURST_TEAMS) {
  problems.push('PvP 버스트 속도를 잴 수 있는 팀이 ' + pvpBurst.length + '팀으로 줄었다(기준 ' + EXPECTED_PVP_BURST_TEAMS
    + ') — 이름이 안 이어졌거나 값이 빠졌다. node scripts/refreshPvpBurstGen.mjs');
}

// --dump=<파일> : 팀별 백분위를 JSON으로 남긴다(무엇을 못 보는지 캐릭터별로 따져보려고, 2026-10-01)
if (arg('dump', null)) fs.writeFileSync(arg('dump', null), JSON.stringify(rows.map((r) => ({ src: r.src, pool: r.pool || null, m: r.m, pct: r.pct }))));

if (process.argv.includes('--by-pool')) {
  const g = {};
  rows.filter((r) => r.pool).forEach((r) => (g[r.pool] ||= []).push(r.pct));
  console.log('\n  타워 풀별 메타 풀 백분위(중앙) — ' + Object.entries(g).map(([k, v]) => `${k} ${med(v).toFixed(1)}%`).join(' · '));
}
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
console.log('  ⚠️ 우리 시뮬레이터는 CC·버스트 순환을 안 본다. PvP ② 줄(딜 계산)은 못 믿는다 — PvP는 버스트 속도 줄을 볼 것.');
console.log(line);

if (problems.length) {
  console.log('\n문제 ' + problems.length + '건\n');
  problems.forEach((p, i) => console.log('  ' + (i + 1) + '. ' + p));
  console.log('');
  process.exit(1);
}
console.log('문제 0건\n');
