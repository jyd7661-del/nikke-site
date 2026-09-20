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
 *
 * 🔴 **이 수치만 보고 엔진 변경을 채택하지 말 것 — 이전 엔진 대비 판정을 함께 한다.** (2026-09-18)
 *    이 지표는 "엔진 vs AI"만 비교한다. 그래서 엔진이 **스스로 나빠져도** AI보다만 나으면 안 보인다.
 *    실제로 D1 동점 처리 1판은 바뀐 10건 중 좋아진 4 · 나빠진 4로 순효과 0이었는데, 그중 3건은
 *    여전히 AI보다 나아서 이 수치로는 퇴행이 안 잡혔다. 한 건은 오히려 AI와 같아져 "일치"로 셌다.
 *    그래서 엔진을 고쳐 답이 바뀐 건은 **(1) 새 엔진 vs AI** 와 **(2) 새 엔진 vs 이전 엔진**을 둘 다
 *    판정해 probe-data/rejudge-*.json 에 남기고, (2)에서 나아짐 > 나빠짐일 때만 채택한다.
 *    D1 2판은 나아짐 3 · 나빠짐 1 · 같음 2로 채택했다(docs/log/2026-09.md).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buffWithNoTarget, emptyBuffMembers } from '../lib/buffTargets.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const SEEDS = [1, 2];
const LABEL = 'sonnet-tier';

const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const nm = (t) => byTitle.get(t)?.name_kr || t;

// --- 원인 분류 D1: 버프 대상이 팀에 없는 멤버 ---
//
// 불일치에서 가장 많이 나온 이유다. 엔진이 티어 합만 보고 고르다 보니 **조건부 버프가 자기 말고
// 아무에게도 안 닿는 캐릭터**를 넣는다(아니스:SS를 전격 동료 없는 팀에, 누아르를 샷건 동료 없는 팀에).
// 판정기는 lib/buffTargets.js 하나뿐이다 — 엔진이 고치는 대상과 여기서 세는 대상이 같은 정의여야 한다.

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
    // ↓ 2판(2026-09-18)에서 정의를 좁힌 두 규칙을 그대로 시험한다. 1판이 엔진에서 일으킨 퇴행 패턴이다.
    { why: '[2판②] 샷건 버퍼(토브)의 샷건 동료가 지원형(나가)뿐 — 공격형이 아니라 잡혀야 한다',
      team: ['Tove', 'Naga', 'Crown', 'Liter', 'Modernia'], expect: true },
    { why: '[2판②] 트리나의 전격 소총 버프 대상이 방어형(목단)뿐 — 잡혀야 한다(1판은 여기서 목단을 끼워 넣었다)',
      team: ['Trina', 'Moran', 'Crown', 'Liter', 'Modernia'], expect: true },
    { why: '[2판①] 공격형(아크레인저 블랙)은 조건부 버프가 비어도 세지 않는다 — 잡히면 안 된다',
      team: ['Ark Ranger Black', 'Crown', 'Liter', 'Rapunzel', 'Modernia'], expect: false },
    { why: '[2판①] 공격형(누아르)도 마찬가지 — 잡히면 안 된다(1판에서는 잡혔다)',
      team: ['Noir', 'Crown', 'Liter', 'Modernia', 'Rapunzel'], expect: false },
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
  // --- D3(아군 버프가 이 팀에서 전부 빈다) 판정기 역테스트 ---
  //
  // D1과 **다른 판정기**이므로 따로 고장을 심는다. D3은 점수를 깎으므로(낭비 칸과 같은 처리)
  // 범위를 넓게 잡으면 멀쩡한 버퍼가 통째로 0점이 된다 — 그 오작동을 여기서 잡는다.
  // 실제로 넓은 1판(= D1 정의 그대로)을 넣어 보니 트리나·소다가 걸렸고, 둘 다 "전 아군" 절을
  // 따로 들고 있어 잘못된 판정이었다(2026-09-20).
  const d3cases = [
    { why: '[D3] 아니스:스파클링 서머 — 아군 절이 "all Electric Code allies" 하나뿐, 전격 공격형 0명이면 잡혀야 한다',
      team: ['Anis: Sparkling Summer', 'Jackal', 'Liberalio', 'Diesel: Winter Sweets', 'Modernia'], expect: true },
    { why: '[D3] 같은 캐릭터 + 전격 공격형(아다 웡) — 잡히면 안 된다',
      team: ['Anis: Sparkling Summer', 'Ada Wong', 'Jackal', 'Liberalio', 'Modernia'], expect: false },
    { why: '[D3] 메이든:아이스 로즈 — 아군 절이 전격 하나뿐, 전격 공격형 0명이면 잡혀야 한다',
      team: ['Maiden: Ice Rose', 'Dorothy', 'Crown', 'Marciana: Marine Study', 'Emilia'], expect: true },
    { why: '[D3] 트리나 — 조건부 절(전격 소총)이 비어도 "전 아군" 절이 따로 있다. 잡히면 안 된다',
      team: ['Trina', 'Moran', 'Crown', 'Liter', 'Modernia'], expect: false },
    { why: '[D3] 소다 — 같은 이유로 잡히면 안 된다(화염 절은 비어도 S2가 전 아군)',
      team: ['Soda', 'Mint', 'Prika', 'Drake: Great Villain', 'Yukiko'], expect: false },
    { why: '[D3] 레이블 — "all allies (except self)" 절이 있다. 자기 강화형으로 오해하면 안 된다',
      team: ['Label', 'Anis: Star', 'Anchor: Innocent Maid', 'Neon: Vision Eye', 'Drake'], expect: false },
    { why: '[D3] 공격형(누아르)은 세지 않는다 — 본인 딜이 몫이다',
      team: ['Noir', 'Crown', 'Liter', 'Modernia', 'Rapunzel'], expect: false },
  ];
  console.log('');
  console.log('─'.repeat(84));
  console.log('D3(아군 버프가 이 팀에서 전부 빔) 판정기 역테스트');
  console.log('─'.repeat(84));
  for (const c of d3cases) {
    const team = c.team.map(by).filter(Boolean);
    if (team.length !== c.team.length) { console.log(`  ⚠️ 이름을 못 찾음: ${c.team.filter((t) => !by(t)).join(', ')}`); bad++; continue; }
    const hit = emptyBuffMembers(team);
    const got = hit.some((h) => h.title === c.team[0]);
    const ok = got === c.expect;
    if (!ok) bad++;
    console.log(`  ${ok ? '✅' : '❌'} ${c.why}`);
    console.log(`       → ${names(hit)}`);
  }
  // --- 전 아군 버프 스탯 이름 인식 역테스트 (2026-09-21) ---
  //
  // `allyBufferCount`(동점 처리에 쓰인다)는 스킬 원문의 스탯 **이름**으로 버프를 가린다.
  // 이름 표기가 하나 다르면 멀쩡한 버퍼가 0명으로 세어지는데 화면에는 아무 증상이 없다 —
  // 실제로 헬름의 `Critical Rate of normal attack ▲14.64%` · `ATK damage ▲11.85%`가
  // 둘 다 안 세어져, 같은 티어의 누아르(ATK ▲14.08%)에게 동점 처리에서 밀리고 있었다.
  // 반대 방향(공격 버프가 아닌 것을 세는 것)도 같이 막는다 — DEF·Max HP는 버퍼가 아니다.
  const E2 = await loadEngine();
  const filler = ['Jackal', 'Liberalio', 'Modernia', 'Rapunzel'];   // 전 아군 공격 버프가 없는 4명
  const bufferCases = [
    { why: '[스탯 이름] 헬름 — "Critical Rate of normal attack"·"ATK damage" 표기도 버퍼로 세어야 한다', who: 'Helm', expect: true },
    { why: '[스탯 이름] 누아르 — "ATK" 표기(기존에도 되던 것)', who: 'Noir', expect: true },
    { why: '[반대 방향] 루피 : 윈터 쇼퍼 — DEF ▲19%는 공격 버프가 아니다. 세면 안 된다', who: 'Rupee: Winter Shopper', expect: false },
    { why: '[반대 방향] 에이드 — Max HP ▲15.6%도 공격 버프가 아니다', who: 'Ade', expect: false },
  ];
  console.log('');
  console.log('─'.repeat(84));
  console.log('전 아군 버프 스탯 이름 인식 역테스트');
  console.log('─'.repeat(84));
  // 채울 4명은 전 아군 공격 버프가 없어야 한다. 그래야 "이 사람 때문에 1명이 되었다"가 성립한다.
  const baseTeam = filler.map(by).filter(Boolean);
  const baseCount = E2.scoreTeam(baseTeam.concat(by('Poli')), 'campaign', {}).allyBufferCount;
  if (baseCount !== 0) { console.log(`  ⚠️ 채우기 5인이 이미 버퍼 ${baseCount}명이다 — 시험 데이터를 고칠 것`); bad++; }
  for (const c of bufferCases) {
    const who = by(c.who);
    if (!who || baseTeam.length !== filler.length) { console.log(`  ⚠️ 이름을 못 찾음: ${c.who}`); bad++; continue; }
    const counted = E2.scoreTeam(baseTeam.concat(who), 'campaign', {}).allyBufferCount;
    const ok = (counted > baseCount) === c.expect;
    if (!ok) bad++;
    console.log(`  ${ok ? '✅' : '❌'} ${c.why}`);
    console.log(`       → 이 5인에서 버퍼로 세어진 인원 ${counted}명 (채우기만 넣으면 ${baseCount}명)`);
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
  for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
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
// D2~D6 — 판정 근거에서 사람(클로드)이 분류한 원인. 계산으로는 못 가린다(판단이 들어간다).
// probe-data/mismatch-causes.json 에 **분류 당시 엔진 팀**과 함께 적혀 있다. 엔진 답이 바뀌면
// 그 분류는 그 답에 대한 것이 아니므로 무효로 보고 다시 "미분류"로 돌린다(재판정과 같은 원리).
const CAUSE_LABEL = {
  D2: 'PvP 버스트 경쟁 — 게이지 속도·풀버스트 한 방(게이지 속도는 출처 있는 데이터가 없다)',
  D3: '버퍼 자리에 딜러를 못 키우는 캐릭터 — 자기 강화형·역할 중복 탱커',
  D4: '딜러 수 부족 — 버퍼는 많고 실제로 때리는 사람이 적다',
  D5: '유연 버스트 멤버가 약한 단계로 밀림 — 라피:레드 후드가 1단계로 내려가 3단계 버스트를 잃는다',
  D6: '모드 적합 — 타워 무리 처리엔 광역, 캠페인 연속 스테이지엔 회복',
};
const causesPath = path.join(ROOT, 'probe-data', 'mismatch-causes.json');
const causes = fs.existsSync(causesPath) ? JSON.parse(fs.readFileSync(causesPath, 'utf8')) : {};
const byCause = {};
const unclassified = [];
for (const r of rows.filter((x) => !d1Only.includes(x))) {
  const k = `s${r.seed}-${r.id}`;
  const c = causes[k];
  if (c && c.engine === [...r.engine].sort().join('|')) (byCause[c.cause] ||= []).push({ r, note: c.note });
  else unclassified.push(r);
}
for (const code of Object.keys(CAUSE_LABEL)) {
  const list = byCause[code];
  if (!list) continue;
  console.log(`  [${code}] ${CAUSE_LABEL[code]}: ${list.length}/${mismatch}`);
  if (VERBOSE) list.forEach(({ r, note }) => console.log(`     s${r.seed} ${r.id}: ${note}`));
  else console.log(`     ${list.map(({ r }) => 's' + r.seed + ' ' + r.id).join(', ')}`);
}
if (unclassified.length) {
  console.log(`  [D?] 아직 분류 안 된 불일치: ${unclassified.length}건 — ${unclassified.map((r) => 's' + r.seed + ' ' + r.id).join(', ')}`);
  console.log('     (분류는 probe-data/mismatch-causes.json — 엔진 답이 바뀐 건은 여기로 돌아온다)');
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
