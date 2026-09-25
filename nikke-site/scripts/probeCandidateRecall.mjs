#!/usr/bin/env node
/**
 * 엔진 상위 K개 후보 안에 **더 나은 답이 들어 있는가** — "엔진이 후보를 만들고 싼 모델이 고른다" 설계의 전제를 잰다. (2026-09-26)
 *
 *   node scripts/probeCandidateRecall.mjs            # K = 1·3·5·10·20
 *   node scripts/probeCandidateRecall.mjs --verbose  # 건마다 가장 가까운 후보
 *
 * 유저 결정(2026-09-26): 소넷 건당 약 67원은 광고로 못 덮는다 → 하이쿠로도 정확도가 나오게 엔진을 고친다.
 * 하이쿠에게 자유 구성을 맡기면 규칙을 놓친다(실험 2차: 버스트 불성립 2/12, 속성 무시 5/5). 그래서 후보는 엔진이
 * 만들고(규칙은 엔진이 보장) 모델은 고르기만 하게 좁힌다. 그러려면 **좋은 답이 후보 안에 있어야** 한다 — 그 비율이 이 수치다.
 *
 * 정답지: testJudgmentMatch와 같은 얇은 로스터 표본(씨앗 1·2)의 내 판정. 판정이 **AI 쪽**인 건 = 엔진 1위보다 나은 답이 있다고
 * 내가 본 건이다. 그 AI 답이 엔진 상위 K개에 그대로 있으면 "고르기만 잘하면 된다", 없으면 "후보 생성부터 고쳐야 한다".
 * 판정이 엔진 쪽인 건은 1위가 이미 정답이라 K와 무관하게 회수된다(참고로만 센다).
 *
 * ⚠️ 이건 회수율(recall)이지 정확도가 아니다. K를 키우면 회수율은 오르지만 고르는 쪽의 부담(입력 토큰·헷갈림)도 오른다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const SEEDS = [1, 2];
const LABEL = 'sonnet-tier';
const KS = [1, 3, 5, 10, 20];

const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const nm = (t) => byTitle.get(t)?.name_kr || t;

// testJudgmentMatch.loadEngine과 같은 방식 — 엔진은 JSON import 속성이 없어 node로 직접 못 부른다
async function loadEngine() {
  const LIB = path.join(ROOT, 'lib');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-cr-'));
  const fix = (src) => src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
  for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
  const mod = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
  fs.rmSync(tmp, { recursive: true, force: true });
  return mod;
}
const E = await loadEngine();

const setKey = (titles) => [...titles].sort().join('|');
const cases = [];
for (const seed of SEEDS) {
  const rosters = new Map(fs.readFileSync(path.join(ROOT, 'probe-data', `thin-cases-s${seed}.jsonl`), 'utf8')
    .trim().split('\n').filter(Boolean).map(JSON.parse).map((c) => [c.id, c]));
  const key = JSON.parse(fs.readFileSync(path.join(ROOT, 'probe-data', `thin-key-${LABEL}-s${seed}.json`), 'utf8'));
  const judged = new Map();
  for (const ln of fs.readFileSync(path.join(ROOT, 'probe-data', `thin-judgments-${LABEL}-s${seed}.txt`), 'utf8').split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)) {
    const m = ln.match(/^(T\d\d)\s*[:\-]?\s*([ABab=xX])/);
    if (m) judged.set(m[1], m[2].toUpperCase());
  }
  for (const k of key) {
    const v = judged.get(k.id);
    if (k.identical || !v || ['=', 'X'].includes(v)) continue;
    const winner = ((v === 'A') === k.engineIsA) ? 'engine' : 'ai';
    cases.push({ seed, id: k.id, winner, target: winner === 'ai' ? k.ai : k.engine, sample: rosters.get(k.id) });
  }
}

const maxK = Math.max(...KS);
const rows = [];
for (const c of cases) {
  const roster = c.sample.roster.map((t) => byTitle.get(t)).filter(Boolean);
  const r = E.recommendTeams(roster, c.sample.mode, { bossElement: c.sample.boss || null, tower: c.sample.tower || null, topN: maxK });
  const teams = (r.teams || []).map((t) => t.members.map((m) => m.title));
  const want = setKey(c.target);
  const rank = teams.findIndex((t) => setKey(t) === want);   // -1 = 상위 maxK 밖
  const overlap = teams.map((t) => t.filter((x) => c.target.includes(x)).length);
  const best = overlap.length ? Math.max(...overlap) : 0;
  rows.push({ ...c, rank, best, bestTeam: teams[overlap.indexOf(best)] || [], n: teams.length });
}

const ai = rows.filter((r) => r.winner === 'ai');
const line = '─'.repeat(84);
console.log(line);
console.log(`엔진 상위 K개 후보의 회수율 — 얇은 로스터 표본(씨앗 ${SEEDS.join('·')}), 판정 ${rows.length}건 중 "더 나은 답이 따로 있다" ${ai.length}건`);
console.log(line);
for (const K of KS) {
  const hit = ai.filter((r) => r.rank >= 0 && r.rank < K).length;
  console.log(`  K=${String(K).padStart(2)}  더 나은 답 회수 ${hit}/${ai.length}` + (K === 1 ? '   (K=1 = 지금 사이트 — 정의상 0)' : ''));
}
const near = ai.filter((r) => r.rank < 0);
console.log(`\n  상위 ${maxK}개 밖 ${near.length}건 — 가장 가까운 후보와 겹치는 인원: ${near.map((r) => `${r.best}/5`).join(' · ') || '—'}`);
if (VERBOSE) {
  for (const r of ai) {
    console.log(`\n  s${r.seed} ${r.id} [${r.sample.mode}${r.sample.boss ? ' ' + r.sample.boss : ''}] 로스터 ${r.sample.roster.length}명 · 후보 ${r.n}개 · 순위 ${r.rank < 0 ? `>${maxK}` : r.rank + 1}`);
    console.log(`     더 나은 답: ${r.target.map(nm).join(', ')}`);
    if (r.rank < 0) console.log(`     가장 가까운(${r.best}/5): ${r.bestTeam.map(nm).join(', ')}`);
  }
}
console.log(line);
