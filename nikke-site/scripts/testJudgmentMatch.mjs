#!/usr/bin/env node
/**
 * **사이트 추천이 내 판정과 같아졌는가** — 보완의 목표를 숫자로 만든다. (2026-09-18, 유저 지시)
 *
 *   node scripts/testJudgmentMatch.mjs            # 일치율 + 안 맞는 건의 원인 분류
 *   node scripts/testJudgmentMatch.mjs --verbose  # 건마다 두 조합을 나란히
 *   node scripts/testJudgmentMatch.mjs --selftest # D1 판정기 역테스트(고장을 심어 잡히는지)
 *
 * 유저 지시: *"너가 생각한 결과랑 사이트에서 추천해주는 결과가 같아질 때까지 시스템보완을 해 나가자."*
 * 그러려면 "같다"가 수치여야 한다. 그 수치가 이 스크립트다.
 *
 * ■ 무엇을 재는가
 *   얇은 로스터 A/B 표본(씨앗 1·2 = 40건)에서 **엔진이 낸 답이 내 판정과 같은 비율**.
 *   판정 파일(probe-data/thin-judgments-*.txt)이 정답지다 — 내가 스킬 원문을 대조해 고른 쪽.
 *     · 두 답이 같았던 건(identical)은 엔진이 곧 그 답이므로 일치로 센다(따로 표시).
 *     · 판정이 엔진 쪽 → 일치. 판정이 AI 쪽 → 불일치(= 사이트가 내가 안 고를 조합을 낸다).
 *
 * ■ 왜 이 표본인가
 *   폴백 구간(등록 조합이 없는 얇은 로스터)이 엔진의 약한 곳이고, 초보 유저가 실제로 있는 구간이다.
 *   등록 조합이 열리는 구간은 `testRealTeams`·`testRankerTeams`가 이미 지킨다.
 *
 * ⚠️ **이 수치를 목표로 삼되, 가드를 함께 본다.** 내 판정에 맞추려고 엔진을 비틀면
 *    실제 랭커 조합을 알아보는 능력이 깎일 수 있다. 그래서 고칠 때마다 반드시 함께 돌린다:
 *      node scripts/testRankerTeams.mjs   (메타 풀 백분위 중앙 70.5% — 내려가면 그 변경은 되돌린다)
 *      node scripts/testRealTeams.mjs     (등록 조합 214건 성립 — 0건 유지)
 *    `docs/open-items.md`의 "탐침으로 약점 찾기" 원칙과 같다: 관측치를 목표로 삼되 근거를 잃지 말 것.
 *
 * ⚠️ 판정자는 클로드다. 유저가 다르게 느낀 건이 생기면 **판정 파일을 고치고** 경위를 log에 적는다.
 *    정답지가 사람 손으로 바뀌는 검사이므로, 바뀌면 이 숫자도 같이 움직이는 게 정상이다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scopeOf } from './simulateTeams.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const SEEDS = [1, 2];
const LABEL = 'sonnet-tier';

const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const nm = (t) => byTitle.get(t)?.name_kr || t;
const lc = (v) => String(v || '').toLowerCase();

// --- 원인 분류 D1: 버프 대상이 팀에 없는 멤버 ---
//
// 씨앗 1·2의 불일치 21건에서 가장 많이 나온 이유다. 엔진이 티어 합만 보고 고르다 보니
// **조건부 버프가 자기 말고 아무에게도 안 닿는 캐릭터**를 넣는다:
//   · 아니스 : 스파클링 서머 — "Affects all Electric Code allies" 인데 팀에 전격이 자기뿐
//   · 아크레인저 블랙 — "all Wind Code allies with assault rifles" 인데 해당자가 자기뿐
// 티어 점수에는 그 자리가 멀쩡해 보이지만 스킬 원문상 그 칸은 빈다.
//
// 판정이 아니라 **사실 확인**이다: 대상절을 읽고 팀에서 해당자를 센다. 새 가중치를 만들지 않는다.
const ELEMENTS = ['fire', 'water', 'wind', 'iron', 'electric'];
const WEAPON_WORDS = [
  ['sniper rifle', 'sr'], ['rocket launcher', 'rl'], ['submachine gun', 'smg'],
  ['assault rifle', 'ar'], ['machine gun', 'mg'], ['shotgun', 'sg'], ['shotgun-wielding', 'sg'],
];
// 대상절 문자열 → 팀에서 그 버프를 받는 멤버(시전자 포함). 해석 못 하면 null(모르는 건 세지 않는다).
function resolveAllyScope(scope, caster, team) {
  const s = lc(scope);
  if (!/all\b/.test(s) || /enem/.test(s)) return null;      // 아군 전체 계열만 본다
  const el = ELEMENTS.find((e) => new RegExp(`all ${e} (code|type) all(y|ies)`).test(s) || new RegExp(`allies with ${e} element`).test(s));
  const wp = WEAPON_WORDS.find(([w]) => s.includes(w));
  const squad = /from the same squad/.test(s);
  if (!el && !wp && !squad) return null;                     // 조건 없는 "all allies"는 대상이 항상 있다
  let out = team;
  if (el) out = out.filter((m) => lc(m.element) === el);
  if (wp) out = out.filter((m) => lc(m.weapon) === wp[1]);
  if (squad) { if (!caster.squad) return null; out = out.filter((m) => m.squad === caster.squad); }
  return out;
}
// 팀에서 "조건부 아군 버프가 자기 말고 아무에게도 안 닿는" 멤버를 찾는다.
function buffWithNoTarget(team) {
  const out = [];
  for (const c of team) {
    const dead = [];
    for (const sk of c.skills || []) {
      for (const clause of String(sk.desc || '').split(/(?<=\.)\s+/)) {
        const scope = scopeOf(clause.trim());
        if (scope === null) continue;
        const targets = resolveAllyScope(scope, c, team);
        if (targets === null) continue;
        if (targets.filter((m) => m.id !== c.id).length === 0) dead.push(scope.trim());
      }
    }
    if (dead.length) out.push({ title: c.title, scopes: [...new Set(dead)] });
  }
  return out;
}

// --- 역테스트 — 검사를 만들면 반드시 고장을 심어 잡히는지 본다(CLAUDE.md 원칙 3) ---
if (process.argv.includes('--selftest')) {
  const by = (t) => byTitle.get(t);
  const names = (r) => r.map((x) => `${nm(x.title)}(${x.scopes[0]})`).join(', ') || '(없음)';
  // ⚠️ 시험 팀은 **속성·무기를 확인하고** 짠다. 처음 짤 때 전격 버퍼 옆에 클레이(전격),
  //    샷건 버퍼 옆에 나가(샷건)를 넣어 두 건이 "안 잡힌다"고 나왔는데, 판정기가 아니라
  //    시험 데이터가 틀린 것이었다(2026-09-18). 역테스트가 그걸 잡았다.
  const cases = [
    { why: '전격 버퍼(아니스:스파클링 서머)를 전격 동료 0명인 팀에 — 잡혀야 한다',
      team: ['Anis: Sparkling Summer', 'Jackal', 'Liberalio', 'Diesel: Winter Sweets', 'Modernia'], expect: true },
    { why: '같은 캐릭터를 전격 동료와 함께 — 잡히면 안 된다',
      team: ['Anis: Sparkling Summer', 'Anis: Star', 'Ada Wong', 'Jackal', 'Liberalio'], expect: false },
    { why: '조건 없는 전 아군 버퍼만 — 잡히면 안 된다',
      team: ['Crown', 'Liter', 'Naga', 'Red Hood', 'Modernia'], expect: false },
    { why: '샷건 버퍼(누아르)를 샷건 동료 0명인 팀에 — 잡혀야 한다',
      team: ['Noir', 'Crown', 'Liter', 'Modernia', 'Rapunzel'], expect: true },
  ];
  let bad = 0;
  console.log('─'.repeat(84));
  console.log('D1(버프 대상 없음) 판정기 역테스트');
  console.log('─'.repeat(84));
  for (const c of cases) {
    const team = c.team.map(by).filter(Boolean);
    if (team.length !== c.team.length) { console.log(`  ⚠️ 이름을 못 찾음: ${c.team.filter((t) => !by(t)).join(', ')}`); bad++; continue; }
    const hit = buffWithNoTarget(team);
    // 첫 멤버(고장을 심은 캐릭터)가 잡혔는가로 판정한다 — 팀의 다른 멤버가 우연히 걸리는 것과 구분한다.
    const got = hit.some((h) => h.title === c.team[0]);
    const ok = got === c.expect;
    if (!ok) bad++;
    console.log(`  ${ok ? '✅' : '❌'} ${c.why}`);
    console.log(`       → ${names(hit)}`);
  }
  console.log(`\n문제 ${bad}건`);
  console.log('─'.repeat(84));
  process.exit(bad ? 1 : 0);
}

// --- 엔진을 지금 코드로 다시 돌린다 ---
//
// ⚠️ 판정 파일에 적힌 엔진 답을 **믿고 쓰면 안 된다.** 그건 판정하던 날의 답이다.
//    엔진을 고치면 답이 바뀌는데, 그때 옛 답으로 계속 재면 고친 효과가 안 보인다.
//    (실제로 2026-09-18에 결정성 버그를 고치자 40건 중 11건의 답이 바뀌었다.)
//    그래서 지금 코드로 다시 돌리고, 답이 바뀐 건은 **"재판정 필요"로 빼고 센다** —
//    내 판정은 "그때 보여준 두 조합 중" 고른 것이라 새 답에는 그대로 적용되지 않는다.
async function loadEngine() {
  const LIB = path.join(ROOT, 'lib');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-jm-'));
  const fix = (src) => src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
  for (const f of ['synergyEngine', 'engineReasons', 'i18n']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
  return import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
}
const E = await loadEngine();
// 사이트와 같은 선정 경로(experimentThinRoster.engineAnswer와 동일)
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
const rosterOf = new Map();   // id → 표본 로스터(제목)
for (const seed of SEEDS) {
  const p = path.join(ROOT, 'probe-data', `thin-cases-s${seed}.jsonl`);
  if (!fs.existsSync(p)) continue;
  for (const c of fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)) {
    rosterOf.set(`s${seed}-${c.id}`, c);
  }
}

// --- 표본 읽기 ---
const cases = [];
for (const seed of SEEDS) {
  const keyPath = path.join(ROOT, 'probe-data', `thin-key-${LABEL}-s${seed}.json`);
  const judgePath = path.join(ROOT, 'probe-data', `thin-judgments-${LABEL}-s${seed}.txt`);
  if (!fs.existsSync(keyPath) || !fs.existsSync(judgePath)) {
    console.error(`씨앗 ${seed} 표본이 없다 — experimentThinRoster.mjs로 먼저 만들 것: ${path.relative(ROOT, keyPath)}`);
    process.exit(1);
  }
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const judged = new Map();
  for (const ln of fs.readFileSync(judgePath, 'utf8').split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)) {
    const m = ln.match(/^(T\d\d)\s*[:\-]?\s*([ABab=xX])/);
    if (m) judged.set(m[1], m[2].toUpperCase());
  }
  for (const k of key) cases.push({ seed, ...k, verdict: judged.get(k.id) || null });
}

// --- 집계 ---
let match = 0, identical = 0, mismatch = 0, unjudged = 0, stale = 0;
const rows = [];
const staleIds = [];
for (const c of cases) {
  // 지금 엔진을 다시 돌려, 판정하던 날의 답과 같은지 본다.
  const sample = rosterOf.get(`s${c.seed}-${c.id}`);
  if (sample) {
    const roster = sample.roster.map((t) => byTitle.get(t)).filter(Boolean);
    const now = siteAnswer(roster, sample.mode, { bossElement: sample.boss || null, tower: sample.tower || null });
    const nowKey = now ? [...now.members.map((m) => m.title)].sort().join('|') : '';
    if (nowKey !== [...c.engine].sort().join('|')) {
      stale++; staleIds.push(`s${c.seed} ${c.id}`);
      continue; // 판정이 그 답에 대한 것이 아니므로 세지 않는다
    }
  }
  if (c.identical) { identical++; match++; continue; }
  if (!c.verdict || ['=', 'X'].includes(c.verdict)) { unjudged++; continue; }
  const judgeWinner = ((c.verdict === 'A') === c.engineIsA) ? 'engine' : 'ai';
  if (judgeWinner === 'engine') { match++; continue; }
  mismatch++;
  const engTeam = c.engine.map((t) => byTitle.get(t)).filter(Boolean);
  const aiTeam = (c.ai || []).map((t) => byTitle.get(t)).filter(Boolean);
  rows.push({
    seed: c.seed, id: c.id,
    engine: c.engine, ai: c.ai,
    d1Engine: buffWithNoTarget(engTeam),
    d1Ai: buffWithNoTarget(aiTeam),
  });
}

const total = match + mismatch;
const line = '─'.repeat(84);
console.log(line);
console.log('사이트 추천 ↔ 내 판정 일치율 — 얇은 로스터 표본(씨앗 ' + SEEDS.join('·') + ')');
console.log(line);
console.log(`  일치 ${match}/${total} = ${total ? (match / total * 100).toFixed(1) : '—'}%  (그중 두 답이 같았던 건 ${identical})`);
console.log(`  불일치 ${mismatch}건 — 사이트가 내가 안 고를 조합을 낸다`);
if (unjudged) console.log(`  판정 제외 ${unjudged}건(비슷·둘 다 나쁨)`);
if (stale) {
  console.log(`\n  🔁 재판정 필요 ${stale}건 — 엔진을 고쳐 답이 바뀌었다. 옛 판정은 그 답에 대한 것이라 세지 않는다.`);
  console.log(`     ${staleIds.join(', ')}`);
  console.log('     → experimentThinRoster.mjs --gen 으로 표본을 새로 만들고 다시 판정하면 이 수가 0으로 돌아온다.');
}

// 원인 분류
const d1Only = rows.filter((r) => r.d1Engine.length > r.d1Ai.length);
console.log('');
console.log(`  [D1] 버프 대상이 팀에 없는 멤버가 **엔진 쪽에 더 많은** 건: ${d1Only.length}/${mismatch}`);
for (const r of d1Only) {
  const who = r.d1Engine.map((x) => `${nm(x.title)}(${x.scopes[0]})`).join(', ');
  console.log(`     s${r.seed} ${r.id}: ${who}`);
}
const rest = rows.filter((r) => !d1Only.includes(r));
if (rest.length) {
  console.log(`  [D?] 아직 분류 안 된 불일치: ${rest.length}건 — ${rest.map((r) => 's' + r.seed + ' ' + r.id).join(', ')}`);
}

if (VERBOSE) {
  console.log('');
  for (const r of rows) {
    console.log(`  s${r.seed} ${r.id}`);
    console.log(`    엔진: ${r.engine.map(nm).join(' · ')}`);
    console.log(`    내 판정: ${(r.ai || []).map(nm).join(' · ')}`);
  }
}
console.log('');
console.log('  ⚠️ 고친 뒤에는 반드시 함께: testRankerTeams(중앙 70.5%) · testRealTeams(0건).');
console.log('     내 판정에 맞추려다 실제 랭커 조합을 알아보는 능력을 깎으면 그 변경은 되돌린다.');
console.log(line);
