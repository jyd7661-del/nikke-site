#!/usr/bin/env node
/**
 * **같은 보유 로스터면 순서가 어떻든 같은 조합이 나오는가.** (2026-09-18)
 *
 *   node scripts/testEngineDeterminism.mjs
 *
 * 왜 생겼나: `recommendTeams`의 후보 정렬이 네 기준(티어 합 · 낭비 · 스킬 시너지 · 전아군 버퍼)까지만
 * 있었고, 그게 전부 같은 후보가 아주 많이 남았다. 안정 정렬이라 그중 무엇이 뽑히는지는
 * **입력 배열의 순서** — 즉 `ownedCharacters`의 순서였다. 그 순서는 사용자가 니케를 고른 순서다
 * (`app/(home)/page.js` → `lib/rosterBridge.js`). 결과:
 *
 *   **같은 니케를 보유한 두 사람이 고른 순서만 달라서 다른 조합을 추천받고 있었다.**
 *
 * 실측(고치기 전, 얇은 로스터 20건 × 순서 6가지): 8건에서 답이 갈렸고 한 건은 4가지가 나왔다.
 * 에러가 없어 아무도 몰랐다 — 원칙 3의 "조용한 누락". CLAUDE.md 원칙 1이 말하는
 * "엔진이 완전히 결정적"도 이 구간에선 사실이 아니었다.
 *
 * 고친 방법: 마지막 동점 처리로 **멤버 id 정렬 문자열**을 넣었다(lib/synergyEngine.js).
 * 점수가 아니라 정렬 키라 순위를 뒤집지 않는다.
 *
 * ⚠️ 이 검사는 "좋은 조합인가"를 묻지 않는다. **같은 입력에 같은 답인가**만 본다.
 *    품질은 testRankerTeams·testRealTeams·testJudgmentMatch가 본다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const byTitle = new Map(cdb.map((c) => [c.title, c]));

async function loadEngine() {
  const LIB = path.join(ROOT, 'lib');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-det-'));
  const fix = (src) => src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
  for (const f of ['synergyEngine', 'engineReasons', 'i18n']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
  return import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
}
const E = await loadEngine();

// 재현 가능한 셔플 — 같은 씨앗이면 같은 순서. 어제와 오늘을 비교할 수 있어야 한다.
const rng = (s) => () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const shuffled = (arr, seed) => {
  const a = [...arr]; const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const keyOf = (team) => [...team.members.map((m) => m.title)].sort().join('|');

// 사이트와 같은 선정 경로 — 세 갈래를 다 태워야 화면에 나가는 답을 재는 것이 된다.
function siteAnswer(roster, mode, o) {
  let real = null, exact = null;
  try { real = E.findRealUsageTeamMatch(roster, mode, o); } catch { /* 무시 */ }
  try { exact = E.findExactTeamMatch(roster, mode, o); } catch { /* 무시 */ }
  if (real || exact) {
    const rs = real?.totalScore ?? -1, es = exact?.totalScore ?? -1;
    return real && rs >= es ? real : exact;
  }
  const r = E.recommendTeams(roster, mode, { ...o, topN: 1 });
  return r.teams?.[0] || null;
}

// 표본 — 얇은 로스터 표본이 있으면 그것을(실제로 문제가 난 구간), 없으면 무작위 로스터를 만든다.
const samples = [];
for (const seed of [1, 2]) {
  const p = path.join(ROOT, 'probe-data', `thin-cases-s${seed}.jsonl`);
  if (!fs.existsSync(p)) continue;
  for (const c of fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)) {
    samples.push({ id: `s${seed}-${c.id}`, roster: c.roster, mode: c.mode, boss: c.boss, tower: c.tower });
  }
}
if (!samples.length) {
  // 표본 파일은 gitignore라 새 체크아웃에는 없다. 그때는 여기서 직접 만든다(씨앗 고정).
  const ssr = cdb.filter((c) => c.rarity === 'SSR' && (c.skills || []).length).map((c) => c.title);
  const MODES = [['campaign', null, null], ['bossing', 'Iron', null], ['pvp', null, null], ['tribe_tower', null, null]];
  for (let i = 0; i < 24; i++) {
    const [mode, boss, tower] = MODES[i % MODES.length];
    samples.push({ id: `gen-${i}`, roster: shuffled(ssr, i + 1).slice(0, 12 + (i % 3) * 3), mode, boss, tower });
  }
}

const ORDERS = 6;
let checked = 0, bad = 0;
const fails = [];
for (const s of samples) {
  const base = s.roster.map((t) => byTitle.get(t)).filter(Boolean);
  if (base.length < 5) continue;
  const answers = new Map();
  for (let k = 0; k < ORDERS; k++) {
    const team = siteAnswer(shuffled(base, k + 1), s.mode, { bossElement: s.boss || null, tower: s.tower || null });
    if (!team) continue;
    const key = keyOf(team);
    if (!answers.has(key)) answers.set(key, []);
    answers.get(key).push(k + 1);
  }
  checked++;
  if (answers.size > 1) {
    bad++;
    fails.push({ id: s.id, mode: s.mode, variants: [...answers.keys()] });
  }
}

const line = '─'.repeat(84);
console.log(line);
console.log(`엔진 결정성 검사 — 같은 로스터를 순서 ${ORDERS}가지로 넣어 답이 하나인가`);
console.log(line);
console.log(`  표본 ${checked}건 · 순서마다 ${ORDERS}회`);
if (bad) {
  console.log(`\n❌ 순서에 따라 답이 갈리는 건 ${bad}건 — 같은 니케를 가진 사람이 다른 추천을 받는다`);
  for (const f of fails.slice(0, 8)) {
    console.log(`   ${f.id} (${f.mode}) 답 ${f.variants.length}가지`);
    f.variants.forEach((v) => console.log(`      ${v.split('|').map((t) => byTitle.get(t)?.name_kr || t).join(' · ')}`));
  }
  if (fails.length > 8) console.log(`   … 외 ${fails.length - 8}건`);
} else {
  console.log('\n✅ 전부 순서와 무관하게 같은 답');
}
console.log(`\n문제 ${bad}건`);
console.log(line);
process.exit(bad ? 1 : 0);
