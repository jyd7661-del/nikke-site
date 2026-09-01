#!/usr/bin/env node
/**
 * 무작위 보유 로스터로 추천을 계속 돌려 **약점을 센다**. (2026-09-01, 유저 지시)
 *
 *   node scripts/probeRecommendations.mjs                     # 기본: 20명 × 1000회, campaign
 *   node scripts/probeRecommendations.mjs --mode=bossing
 *   node scripts/probeRecommendations.mjs --size=40 --trials=300
 *   node scripts/probeRecommendations.mjs --seed=2 --deep=80   # 다른 표본 / 최적성 표본 확대
 *
 * `testRealTeams.mjs`와 **짝**이다. 잡는 것이 다르다:
 *   testRealTeams        — 우리 규칙이 **진짜 조합을 떨어뜨리는가** (등록 조합 → 우리 규칙)
 *   probeRecommendations — 특정 보유 상황에서 **무엇이 나가는가**   (무작위 로스터 → 추천)
 *
 * ⚠️ **"성공률"을 하나의 숫자로 뭉치지 않는다.** 항목마다 근거의 강도가 다르기 때문이다.
 *    합쳐 놓으면 어느 항목을 고쳐서 올랐는지 알 수 없고, 근거가 약한 항목을 향해
 *    최적화하게 된다. 실제로 "풀버스트 20초 사이클"을 기준에 넣자는 제안이 있었는데,
 *    등록 조합에 대보니 PvP 검증 조합의 95%가 걸려서 기각됐다(docs/open-items.md).
 *
 * 결함(무조건 고쳐야 하는 것) — 여기가 100%가 목표다:
 *   D1 근거 건전성   근거가 1줄 이상이고 `undefined`가 없다
 *   D2 죽은 자리 없음 버스트 순번에서 밀려 0점으로 들어간 인원이 없다(토템 예외는 낭비 아님)
 *   D3 에러 정확성   추천을 못 냈다면, 그 로스터에 정말 그 버스트 단계가 없다
 *
 * 관측치(100%가 목표가 아닌 것) — 추세만 본다:
 *   O1 근거의 출처   실사용/아키타입 헤드라인이 하나라도 붙었는가
 *                    (로스터가 좁으면 등록 조합이 아예 없을 수 있다. 0%가 정상인 구간이 있다)
 *   O2 티어 최적성   폴백 경로에서 같은 로스터에 tierTotal이 더 높은 유효 조합이 있었는가
 *                    (비싸서 앞쪽 --deep 회분만 전수 탐색한다)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'lib');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-probe-'));
const fixImports = (src) =>
  src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, name) =>
      `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${name}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, name) =>
      `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${name}.mjs`)).href)};`);
for (const f of ['synergyEngine', 'engineReasons', 'i18n']) {
  fs.writeFileSync(path.join(tmp, `${f}.mjs`), fixImports(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
}
const E = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));

const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  return m ? m.split('=')[1] : d;
};
const MODE = arg('mode', 'campaign');
const SIZE = Number(arg('size', 20));
const TRIALS = Number(arg('trials', 1000));
const DEEP = Number(arg('deep', 40));
const SEED = Number(arg('seed', 1));
// 2026-09-01: **모드가 요구하는 입력을 안 넘기면 그 경로가 조용히 꺼진다.**
//   보스전/레이드 실사용 매칭은 `bossElement`가 있어야 후보가 생기고(속성이 같은 시즌만 본다),
//   기업 타워는 `tower`로 로스터가 제조사별로 잘린다.
//   1000회 첫 측정에서 bossing의 "근거의 출처가 있음"이 23%로 나왔는데, 엔진 결함이 아니라
//   탐침이 bossElement를 안 넘겨서였다. 숫자를 믿을 수 없는 측정이었다.
// 지정하지 않으면 회차마다 돌려 가며 고르게 덮는다(seed 고정이라 재현된다).
const BOSS = arg('boss', null);      // Iron|Wind|Water|Electronic|Fire
const TOWER = arg('tower', null);    // elysion|missilis|tetra|pilgrim|tribe
const NEEDS_BOSS = ['bossing', 'raid'].includes(MODE);
const NEEDS_TOWER = MODE === 'tribe_tower';
const towerOf = (i) => {
  if (TOWER) return TOWER === 'tribe' ? null : TOWER;
  return [null, ...E.TOWER_CORPS][i % (E.TOWER_CORPS.length + 1)];
};
const bossOf = (i) => (BOSS || E.BOSS_ELEMENTS[i % E.BOSS_ELEMENTS.length]);

// 재현 가능한 난수 — 같은 seed면 같은 로스터가 나온다. 어제와 오늘을 비교할 수 있어야 한다.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED * 1000003 + SIZE * 7919 + TRIALS);
const sample = (arr, n) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};

const flexStages = (c) => (Array.isArray(c.burstStages) && c.burstStages.length ? c.burstStages.map(String) : ['1', '2', '3']);
// 엔진의 하드 제약과 같은 판정 — 에러 문구가 사실인지 검증할 때만 쓴다.
const coverableStages = (roster) => {
  const fixed = new Set(roster.filter((c) => !c.burstFlex).map((c) => String(c.burst)));
  const flex = roster.filter((c) => c.burstFlex);
  const out = new Set(fixed);
  flex.forEach((c) => flexStages(c).forEach((b) => out.add(b)));
  return out;
};

const HEADLINE = /^\[실전 기록\]|조합으로 알려진 구성입니다|에 등록된 \d+명\(/;

const N = { d1: 0, d2: 0, d3: 0, o1: 0 };
const fail = { d1: [], d2: [], d3: [] };
const paths = { real: 0, arch: 0, fallback: 0, error: 0 };
let deepChecked = 0; const deepWorse = [];
const nm = (m) => m.name_kr || m.title;

const t0 = Date.now();
for (let t = 0; t < TRIALS; t++) {
  const roster = sample(cdb, SIZE);
  const o = {};
  if (NEEDS_BOSS) o.bossElement = bossOf(t);
  if (NEEDS_TOWER) o.tower = towerOf(t);
  let real = null, exact = null;
  try { real = E.findRealUsageTeamMatch(roster, MODE, o); } catch { /* 무시 */ }
  try { exact = E.findExactTeamMatch(roster, MODE, o); } catch { /* 무시 */ }

  let chosen = null, p = null, err = null;
  if (real || exact) {
    const rs = real?.totalScore ?? -1, es = exact?.totalScore ?? -1;
    if (real && rs >= es) { chosen = real; p = 'real'; } else { chosen = exact; p = 'arch'; }
  } else {
    const r = E.recommendTeams(roster, MODE, { ...o, topN: 1 });
    if (r.error || !r.teams?.length) { err = r.error || '(에러도 팀도 없음)'; p = 'error'; } else { chosen = r.teams[0]; p = 'fallback'; }
  }
  paths[p] += 1;

  // --- D3: 추천을 못 냈다면 그 말이 사실인가 ---
  if (p === 'error') {
    // 기업 타워는 제조사로 로스터가 잘리므로, 잘린 뒤의 로스터로 판정해야 에러 문구가 맞는지 안다.
    const eligible = NEEDS_TOWER ? E.filterRosterByTower(roster, o.tower) : roster;
    const have = coverableStages(eligible);
    const reallyMissing = ['1', '2', '3'].filter((b) => !have.has(b));
    // 정당한 실패는 둘이다 — 단계가 비었거나, 단계는 다 있어도 5명을 못 채우거나.
    if (reallyMissing.length || eligible.length < 5) N.d3 += 1;
    else fail.d3.push(`5명 이상이고 1·2·3이 다 있는데 추천을 못 냈다 — ${eligible.map(nm).join(', ')}`);
    continue;
  }
  N.d3 += 1; // 추천이 나온 경우는 D3 대상이 아니다(통과로 센다)

  const members = chosen.members.map((m) => cdb.find((c) => c.id === m.id)).filter(Boolean);
  const scored = E.scoreTeam(members, MODE, o);
  const reasons = (chosen.reasons || []).map(String);

  // --- D1: 근거 건전성 ---
  const bad = reasons.filter((r) => r.includes('undefined'));
  if (reasons.length > 0 && bad.length === 0) N.d1 += 1;
  else fail.d1.push(`[${p}] 근거 ${reasons.length}줄${bad.length ? ` · undefined ${bad.length}건: ${bad[0].slice(0, 90)}` : ' (비어 있음)'}`);

  // --- D2: 죽은 자리 ---
  if ((scored.wastedCount || 0) === 0) N.d2 += 1;
  else fail.d2.push(`[${p}] 0점 인원 ${scored.wastedCount}명 — ${members.map((m) => `${nm(m)}(B${m.burst})`).join(', ')}`);

  // --- O1: 근거의 출처 ---
  if (reasons.some((r) => HEADLINE.test(r))) N.o1 += 1;

  // --- O2: 폴백의 티어 최적성 (표본만) ---
  if (p === 'fallback' && deepChecked < DEEP) {
    deepChecked += 1;
    let best = { tt: -1, m: null };
    const scanRoster = NEEDS_TOWER ? E.filterRosterByTower(roster, o.tower) : roster;
    const idx = [];
    const rec = (start, depth) => {
      if (depth === 5) {
        const mm = idx.map((i) => scanRoster[i]);
        const s = E.scoreTeam(mm, MODE, o);
        if (s.valid && s.tierTotal > best.tt) best = { tt: s.tierTotal, m: mm };
        return;
      }
      for (let i = start; i <= scanRoster.length - (5 - depth); i++) { idx[depth] = i; rec(i + 1, depth + 1); }
    };
    rec(0, 0);
    if (best.tt > (scored.tierTotal || 0)) {
      deepWorse.push({ mine: scored.tierTotal, best: best.tt,
        m: members.map(nm).join(', '), b: best.m.map(nm).join(', ') });
    }
  }
}

const done = TRIALS - paths.error;
const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '—');
const line = '─'.repeat(92);
console.log(line);
const inputNote = NEEDS_BOSS ? ` · 보스속성 ${BOSS || '5종 순환'}` : (NEEDS_TOWER ? ` · 타워 ${TOWER || '부족+기업4종 순환'}` : '');
console.log(`추천 탐침 — 보유 ${SIZE}명 무작위 × ${TRIALS}회 · 모드 ${MODE}${inputNote} · seed ${SEED} · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
console.log(`경로: 실사용 ${paths.real} · 아키타입 ${paths.arch} · 폴백 ${paths.fallback} · 추천 실패 ${paths.error}`);
console.log(line);
console.log('결함 — 여기가 100%가 목표다');
console.log(`  D1 근거 건전성    ${pct(N.d1, done)}   (${N.d1}/${done})   실패 ${fail.d1.length}건`);
console.log(`  D2 죽은 자리 없음  ${pct(N.d2, done)}   (${N.d2}/${done})   실패 ${fail.d2.length}건`);
console.log(`  D3 에러 정확성    ${pct(N.d3, TRIALS)}   (${N.d3}/${TRIALS})   실패 ${fail.d3.length}건`);
console.log(line);
console.log('관측치 — 100%가 목표가 아니다');
console.log(`  O1 근거의 출처가 있음   ${pct(N.o1, done)}   (${N.o1}/${done})`);
console.log(`  O2 폴백이 티어 최적    ${pct(deepChecked - deepWorse.length, deepChecked)}   ` +
  `(${deepChecked - deepWorse.length}/${deepChecked} 표본)`);
console.log(line);
for (const [k, label] of [['d1', 'D1 근거 건전성'], ['d2', 'D2 죽은 자리'], ['d3', 'D3 에러 정확성']]) {
  if (!fail[k].length) continue;
  console.log(`${label} 실패 ${fail[k].length}건 — 앞 5건`);
  fail[k].slice(0, 5).forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log('');
}
if (deepWorse.length) {
  console.log(`O2 폴백이 더 나은 조합을 두고 낮은 걸 골랐다 — ${deepWorse.length}건, 앞 3건`);
  deepWorse.slice(0, 3).forEach((d, i) => {
    console.log(`  ${i + 1}. 고른 것 ${d.mine}점: ${d.m}`);
    console.log(`     더 나은 것 ${d.best}점: ${d.b}`);
  });
}
console.log(line);

fs.rmSync(tmp, { recursive: true, force: true });
