#!/usr/bin/env node
/**
 * **얇은 로스터에서 AI와 엔진 중 누가 더 잘 짜는가 — 유저 판정 표본** (2026-09-14, 유저 지시 "2번 하자")
 *
 *   node scripts/experimentThinRoster.mjs --gen                      # 표본 20건 생성: 로스터·모드 + 엔진 답 + AI 프롬프트
 *   node scripts/experimentThinRoster.mjs --import=<answers.jsonl> --label=sonnet-tier   # AI 답 합치고 A/B 눈가림 판정지 작성
 *   node scripts/experimentThinRoster.mjs --score=<judgments.txt> --label=sonnet-tier    # 유저 판정 집계
 *
 * 왜 이 실험인가: experimentAiTeams(랭커 메타 재현)는 "AI가 메타를 아는가"만 잰다. 유저의 진짜 목표는
 * **보유가 적은 사람에게 잘 짜 주는가**인데, 거기엔 외부 정답지가 없다. 그래서 정답지를 유저(게임 지식 깊음)의
 * 판정으로 만든다 — 같은 로스터·같은 모드에 엔진 답과 AI 답을 A/B로 섞어 보여 주고 어느 쪽이 나은지 고른다.
 *
 * ■ 설계
 *   로스터 : SSR만(홈 선택 목록이 SSR 전용) 12·15·18명, 씨앗 고정(재현 가능). 기업 타워는 입장 가능 인원이 5명 미만이면 다시 뽑는다.
 *   모드   : 솔로레이드 5(속성 5종) · 타워 5(트라이브·엘리시온·미실리스·테트라·필그림) · 캠페인 5 · PvP 5 = 20건
 *   엔진 답: 사이트와 같은 경로(실사용 완전일치 → 아키타입 → 폴백 recommendTeams), probeRecommendations와 동일
 *   AI 답  : aiTeamPrompt.mjs(experimentAiTeams와 같은 프롬프트, tier 변형) — 로스터가 건마다 달라 캐시는 없다
 *   눈가림 : 건마다 A/B를 무작위로 배정, 정답 키는 probe-data/thin-key-<label>.json 에 따로 둔다. 판정지엔 근거 문장도 안 싣는다
 *           (엔진 근거는 사이트 문구라 어느 쪽인지 바로 드러난다). 두 답이 같으면 "동일"로 표시하고 판정에서 뺀다.
 *   관측   : 시뮬레이터 점수(관측자, 판정에 안 씀)와 AI 답의 규칙 위반(버스트·입장·로스터 밖)을 키 파일에 남긴다.
 *   판정   : judgments.txt 한 줄에 "번호 A|B|=|x" (= 비슷 · x 둘 다 나쁨). 집계는 엔진 승·AI 승·비슷·둘 다 나쁨.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemPrompt, userPrompt, MODE_SLICE, burstValid, towerEligible } from './aiTeamPrompt.mjs';
import { scoreComposition } from './simulateTeams.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);
const SEED = Number(arg('seed', 1)) || 1;
const N = Number(arg('n', 20)) || 20;
const LABEL = arg('label', 'sonnet-tier');
const DIR = path.join(ROOT, 'probe-data');
fs.mkdirSync(DIR, { recursive: true });
const CASES = path.join(DIR, `thin-cases-s${SEED}.jsonl`);
const PROMPTS = path.join(DIR, `thin-prompts-s${SEED}.jsonl`);

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = j('characterDatabase.json');
const metaStats = j('metaStats.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const KO = { Iron: '철갑', Wind: '풍압', Water: '수냉', Electronic: '전격', Fire: '작열' };
const TOWER_KO = { null: '트라이브(제한 없음)', elysion: '엘리시온', missilis: '미실리스', tetra: '테트라', pilgrim: '필그림/오버스펙' };
const MODE_KO = { campaign: '캠페인', bossing: '솔로레이드', tribe_tower: '타워', pvp: 'PvP' };
const nm = (t) => byTitle.get(t)?.name_kr || t;
const stageOf = (c) => (Array.isArray(c.burstStages) && c.burstStages.length ? c.burstStages.join('/') : String(c.burst));

// --- 엔진을 lib에서 그대로 불러온다(probeRecommendations와 같은 방식) ---
async function loadEngine() {
  const LIB = path.join(ROOT, 'lib');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-thin-'));
  const fix = (src) => src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, name) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${name}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, name) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${name}.mjs`)).href)};`);
  for (const f of ['synergyEngine', 'engineReasons', 'i18n']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
  return import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
}
// 사이트와 같은 선정 경로 — 실사용 완전일치 → 아키타입 → 폴백. probeRecommendations.mjs와 동일.
function engineAnswer(E, roster, mode, o) {
  let real = null, exact = null;
  try { real = E.findRealUsageTeamMatch(roster, mode, o); } catch { /* 무시 */ }
  try { exact = E.findExactTeamMatch(roster, mode, o); } catch { /* 무시 */ }
  if (real || exact) {
    const rs = real?.totalScore ?? -1, es = exact?.totalScore ?? -1;
    return real && rs >= es ? { path: 'real', team: real } : { path: 'arch', team: exact };
  }
  const r = E.recommendTeams(roster, mode, { ...o, topN: 1 });
  if (r.error || !r.teams?.length) return { path: 'error', error: r.error || '(에러도 팀도 없음)' };
  return { path: 'fallback', team: r.teams[0] };
}

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const line = '─'.repeat(84);

if (has('gen')) {
  const E = await loadEngine();
  const rnd = mulberry32(SEED * 1000003 + 7);
  const sample = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a.slice(0, n); };
  const ssr = cdb.filter((c) => c.rarity === 'SSR' && (c.skills || []).length);
  // 모드 순서표 — 20건. 로스터 크기는 12·15·18을 돌려 쓴다.
  const plan = [
    ...['Iron', 'Wind', 'Water', 'Electronic', 'Fire'].map((b) => ({ mode: 'bossing', boss: b })),
    ...[null, 'elysion', 'missilis', 'tetra', 'pilgrim'].map((t) => ({ mode: 'tribe_tower', tower: t })),
    ...Array(5).fill({ mode: 'campaign' }),
    ...Array(5).fill({ mode: 'pvp' }),
  ].slice(0, N);
  const SIZES = [12, 15, 18];
  const cases = [];
  plan.forEach((p, i) => {
    const size = SIZES[i % SIZES.length];
    let roster, eng, tries = 0;
    // 기업 타워는 로스터가 제조사로 잘려 5명이 안 될 수 있다 — 엔진이 답을 낼 때까지 다시 뽑는다(횟수를 기록).
    do { roster = sample(ssr, size); eng = engineAnswer(E, roster, p.mode, { bossElement: p.boss || null, tower: p.tower || null }); tries++; }
    while (eng.path === 'error' && tries < 200);
    if (eng.path === 'error') throw new Error(`${i}: 엔진이 200번 다시 뽑아도 답을 못 냈다 — ${eng.error}`);
    cases.push({ id: `T${String(i + 1).padStart(2, '0')}`, mode: p.mode, boss: p.boss || null, tower: p.tower || null, size, resampled: tries - 1,
      roster: roster.map((x) => x.title).sort(),
      engine: { path: eng.path, members: eng.team.members.map((m) => m.title), totalScore: eng.team.totalScore, reasons: eng.team.reasons || [] } });
  });
  fs.writeFileSync(CASES, cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
  fs.writeFileSync(PROMPTS, cases.map((c) => JSON.stringify({ id: c.id, system: systemPrompt(c.roster.map((t) => byTitle.get(t)), { variant: 'tier', metaStats, slice: MODE_SLICE[c.mode] }), user: userPrompt(c) })).join('\n') + '\n');
  console.log(line); console.log(`얇은 로스터 표본 ${cases.length}건 생성 (seed ${SEED}) → ${path.relative(ROOT, CASES)} · AI 프롬프트 → ${path.relative(ROOT, PROMPTS)}`); console.log(line);
  const paths = {}; cases.forEach((c) => { paths[c.engine.path] = (paths[c.engine.path] || 0) + 1; });
  cases.forEach((c) => console.log(`  ${c.id} ${MODE_KO[c.mode].padEnd(5)} ${(c.boss ? KO[c.boss] : c.mode === 'tribe_tower' ? TOWER_KO[c.tower] : '').padEnd(12)} ${c.size}명 · 엔진 ${c.engine.path}${c.resampled ? ` · 재추출 ${c.resampled}` : ''}`));
  console.log(`  엔진 경로: ${JSON.stringify(paths)}`); console.log(line);
  process.exit(0);
}

const cases = fs.readFileSync(CASES, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const KEY = path.join(DIR, `thin-key-${LABEL}-s${SEED}.json`);
const SHEET = path.join(DIR, `thin-judge-${LABEL}-s${SEED}.md`);

if (arg('import', null)) {
  const rnd = mulberry32(SEED * 7919 + [...LABEL].reduce((a, ch) => a + ch.charCodeAt(0), 0));
  const answers = new Map(fs.readFileSync(arg('import'), 'utf8').split('\n').filter((s) => s.trim()).map((s) => JSON.parse(s)).map((a) => [a.id, a]));
  const key = []; const md = [];
  md.push(`# 얇은 로스터 판정지 — 표본 s${SEED} · 비교 ${LABEL} (눈가림)`, '',
    '같은 보유 로스터·같은 모드에서 두 답(A·B) 중 **어느 쪽을 추천받고 싶은가**를 고른다. 한쪽은 지금 사이트의 엔진, 다른 쪽은 AI이고 순서는 건마다 무작위다.',
    `답은 \`probe-data/thin-judgments-${LABEL}-s${SEED}.txt\`에 한 줄에 하나: \`T01 A\` / \`T01 B\` / \`T01 =\`(비슷) / \`T01 x\`(둘 다 나쁨). 채팅으로 \`T01 A, T02 B …\`로 줘도 된다.`, '',
    '버스트 단계는 이름 뒤 괄호. 로스터는 가나다순.', '');
  let same = 0;
  for (const c of cases) {
    const a = answers.get(c.id);
    const aiT = (a?.members || []).map((t) => byTitle.get(t)).filter(Boolean);
    const rosterSet = new Set(c.roster);
    const flaws = [];
    if (!a) flaws.push('답 없음');
    else {
      if (aiT.length !== 5 || new Set(aiT.map((x) => x.id)).size !== 5) flaws.push('5명 아님');
      (a.members || []).filter((t) => !byTitle.has(t)).forEach((t) => flaws.push(`미지 이름 ${t}`));
      aiT.filter((x) => !rosterSet.has(x.title)).forEach((x) => flaws.push(`로스터 밖 ${x.title}`));
      if (aiT.length === 5 && !burstValid(aiT)) flaws.push('버스트 불성립');
      if (c.mode === 'tribe_tower') aiT.filter((x) => !towerEligible(x, c.tower)).forEach((x) => flaws.push(`입장 불가 ${x.title}`));
    }
    const engT = c.engine.members.map((t) => byTitle.get(t));
    const identical = aiT.length === 5 && engT.every((x) => aiT.some((y) => y.id === x.id));
    if (identical) same++;
    const engineIsA = rnd() < 0.5;
    const A = engineIsA ? engT : aiT, B = engineIsA ? aiT : engT;
    key.push({ id: c.id, engineIsA, identical, aiFlaws: flaws, ai: a?.members || null, aiReasoning: a?.reasoning || null, engine: c.engine.members, enginePath: c.engine.path,
      sim: { engine: scoreComposition(engT).total, ai: aiT.length === 5 ? scoreComposition(aiT).total : null } });
    const ctx = c.mode === 'bossing' ? `보스 약점 ${KO[c.boss]}` : c.mode === 'tribe_tower' ? `${TOWER_KO[c.tower]} 타워` : '';
    // ⚠️ 둘 다 같은 규칙으로 정렬한다 — 엔진 답은 표시 순서(버스트 1→2→3)로 오고 AI 답은 답한 순서라, 그대로 실으면 순서만으로 어느 쪽인지 드러난다(역테스트에서 발견).
    const fmt = (T) => T.length ? [...T].sort((x, y) => stageOf(x).localeCompare(stageOf(y)) || nm(x.title).localeCompare(nm(y.title), 'ko')).map((x) => `${nm(x.title)}(${stageOf(x)})`).join(' · ') : '(답 없음)';
    md.push(`## ${c.id} — ${MODE_KO[c.mode]}${ctx ? ' · ' + ctx : ''} · 보유 ${c.size}명`, '',
      `보유: ${c.roster.map(nm).sort((x, y) => x.localeCompare(y, 'ko')).join(', ')}`, '',
      identical ? `**A = B (두 답이 같음, 판정 제외):** ${fmt(A)}` : `- **A:** ${fmt(A)}\n- **B:** ${fmt(B)}`, '', '판정: ', '');
  }
  fs.writeFileSync(KEY, JSON.stringify(key, null, 1));
  fs.writeFileSync(SHEET, md.join('\n'));
  const flawed = key.filter((k) => k.aiFlaws.length);
  console.log(line); console.log(`판정지 → ${path.relative(ROOT, SHEET)} · 키 → ${path.relative(ROOT, KEY)}`);
  console.log(`  ${cases.length}건 · 두 답 동일 ${same}건(판정 제외) · AI 규칙 위반 ${flawed.length}건${flawed.length ? ': ' + flawed.map((k) => k.id + '(' + k.aiFlaws.join(', ') + ')').join(' ') : ''}`);
  const sim = key.filter((k) => k.sim.ai != null && !k.identical);
  console.log(`  시뮬레이터(관측만): AI가 높음 ${sim.filter((k) => k.sim.ai > k.sim.engine).length} · 엔진이 높음 ${sim.filter((k) => k.sim.ai < k.sim.engine).length} · 같음 ${sim.filter((k) => k.sim.ai === k.sim.engine).length}`);
  console.log(line); process.exit(0);
}

if (arg('score', null)) {
  const key = new Map(JSON.parse(fs.readFileSync(KEY, 'utf8')).map((k) => [k.id, k]));
  const tally = { engine: 0, ai: 0, tie: 0, bothBad: 0, skipped: 0 }; const rows = [];
  for (const ln of fs.readFileSync(arg('score'), 'utf8').split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)) {
    const m = ln.match(/^(T\d\d)\s*[:\-]?\s*([ABab=xX])/); if (!m) { console.log(`  ⚠️ 읽지 못한 줄: ${ln}`); continue; }
    const k = key.get(m[1]); if (!k) { console.log(`  ⚠️ 없는 번호: ${m[1]}`); continue; }
    const v = m[2].toUpperCase();
    if (k.identical) { tally.skipped++; continue; }
    const winner = v === '=' ? 'tie' : v === 'X' ? 'bothBad' : ((v === 'A') === k.engineIsA ? 'engine' : 'ai');
    tally[winner]++; rows.push(`  ${m[1]} ${v} → ${winner}${k.aiFlaws.length ? ' (AI 위반: ' + k.aiFlaws.join(', ') + ')' : ''}`);
  }
  console.log(line); console.log(`유저 판정 집계 — ${LABEL} · s${SEED}`); console.log(line);
  rows.forEach((r) => console.log(r));
  console.log(`\n  엔진 승 ${tally.engine} · AI 승 ${tally.ai} · 비슷 ${tally.tie} · 둘 다 나쁨 ${tally.bothBad} · 동일해서 제외 ${tally.skipped}`);
  console.log(line); process.exit(0);
}
console.log('사용법: --gen | --import=<answers.jsonl> --label=<이름> | --score=<judgments.txt> --label=<이름>');
