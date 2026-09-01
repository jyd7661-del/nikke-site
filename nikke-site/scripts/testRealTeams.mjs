#!/usr/bin/env node
/**
 * 등록된 **실제 조합**으로 우리 규칙을 검증한다.
 *
 *   node scripts/testRealTeams.mjs
 *
 * 왜 필요한가 (2026-09-01):
 *   우리 엔진은 "버스트 I·II·III가 각 1명 이상"을 하드 제약으로 건다. 이건 게임 규칙이라
 *   맞는 제약인데, **우리 캐릭터 데이터가 틀리면 진짜 조합이 조용히 탈락한다.**
 *   실제로 그랬다 — enikk 실사용 조합 214건 중 20건이 "버스트 체인 없음"으로 후보에서
 *   빠져 있었고, 원인은 조합이 아니라 라피: 레드 후드의 `burstFlex`가 비어 있던 것이었다.
 *   그중에는 타워 elysion 클리어의 20.8%를 차지하는 5건이 통째로 들어 있었다.
 *
 *   `docs/engine.md`에는 그 20건이 "진짜로 버스트 체인이 없는 실사용 조합"이라고 적혀
 *   있었다. 근거 없이 규칙을 풀지 않은 것은 옳았지만, **"우리 규칙이 실제 기록을 얼마나
 *   떨어뜨리는가"를 아무도 계속 세고 있지 않았다.** 이 스크립트가 그걸 센다.
 *
 * 판정 기준: 사람들이 실제로 클리어에 쓴 조합은 우리 규칙에서도 성립해야 한다.
 *   성립하지 않는 게 있으면 **둘 중 하나가 틀린 것이다** — 우리 데이터이거나, 우리 규칙이다.
 *   어느 쪽인지는 사람이 판단한다. 기준선: 무효 0건.
 *
 * ⚠️ 여기서 버스트 **순환 속도**(쿨타임)는 판정하지 않는다. 2026-09-01 실측에서
 *    "20초마다 풀버스트"를 기준으로 재봤더니 PvP 등록 조합 20건 중 19건이 걸렸다 —
 *    아레나는 그 주기로 도는 판이 아니라서다. 솔로레이드도 34%가 걸렸는데 그쪽은
 *    40초 순환을 감수하는 상위 기록이 실제로 많다. 그래서 순환은 **참고 지표로만** 찍는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'lib');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-realteams-'));

// 엔진은 JSON을 import assertion 없이 읽어서 순수 Node로 직접 못 부른다.
// testEngineReasons.mjs와 같은 방식으로 임시 사본을 만들어 부르고 끝나면 지운다.
const fixImports = (src) =>
  src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, name) =>
      `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${name}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, name) =>
      `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${name}.mjs`)).href)};`);
for (const f of ['synergyEngine', 'engineReasons', 'i18n']) {
  fs.writeFileSync(path.join(tmp, `${f}.mjs`), fixImports(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
}
const engine = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = j('characterDatabase.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));

// --- 등록된 실사용 조합 모으기 (수집 규칙은 docs/data.md) ---
const teams = [];
j('soloRaidTeams.json').seasons.forEach((s) => (s.teams || []).forEach((t) =>
  teams.push({ src: '솔로레이드', mode: 'bossing', members: t.members, w: t.parses, label: `시즌${s.raid} ${s.boss} · ${t.parses} parses` })));
j('towerCompositions.json').pools.forEach((p) => (p.teams || []).forEach((t) =>
  teams.push({ src: '타워', mode: 'tribe_tower', members: t.members, w: t.uses, label: `${p.pool}${p.tower ? '/' + p.tower : ''} · ${t.pctOfClears}% of clears` })));
const ms = j('metaStats.json');
(ms.campaignCompositions?.list || []).forEach((t) =>
  teams.push({ src: '캠페인', mode: 'campaign', members: t.members, w: t.totalUses, label: `${t.pctOfClears}% of clears` }));
(ms.pvp?.topTeams || []).forEach((t) =>
  teams.push({ src: 'PvP', mode: 'pvp', members: t.members, w: t.n, label: `승률 ${t.wr}% · 채택 ${t.adoption}%` }));

const problems = [];
const stats = new Map();

// --- 참고 지표: 풀버스트 순환 (판정 아님) ---
const cdOf = (c) => {
  const s = (c.skills || [])[(c.skills || []).length - 1];
  const n = Number(s?.cd);
  return Number.isNaN(n) || !n ? null : n;
};
function cycleSeconds(members) {
  const flex = members.filter((m) => m.burstFlex);
  const stage = { 1: [], 2: [], 3: [] };
  members.filter((m) => !m.burstFlex).forEach((m) => { if (stage[m.burst]) stage[m.burst].push(cdOf(m) ?? 40); });
  const evaluate = (st) => {
    let worst = 0;
    for (const b of ['1', '2', '3']) {
      if (!st[b].length) return Infinity;
      worst = Math.max(worst, 1 / st[b].reduce((a, c) => a + 1 / c, 0));
    }
    return worst;
  };
  if (!flex.length) return evaluate(stage);
  let best = Infinity;
  for (const b of ['1', '2', '3']) {
    if (!flex.every((m) => (Array.isArray(m.burstStages) ? m.burstStages.map(String) : ['1', '2', '3']).includes(b))) continue;
    const st = { 1: [...stage[1]], 2: [...stage[2]], 3: [...stage[3]] };
    flex.forEach((m) => st[b].push(cdOf(m) ?? 40));
    best = Math.min(best, evaluate(st));
  }
  return best;
}

for (const t of teams) {
  const members = t.members.map((n) => byTitle.get(n));
  const missing = t.members.filter((n) => !byTitle.get(n));
  if (missing.length) {
    // 이름이 안 맞으면 그 조합은 매칭에서 통째로 빠진다 — 조용한 누락이라 여기서 잡는다.
    problems.push(`[${t.src}] ${t.label}: 이름을 characterDatabase에서 못 찾음 — ${missing.join(', ')}`);
    continue;
  }
  const s = stats.get(t.src) || { n: 0, invalid: 0, cyc: { ok: 0, slow: 0 } };
  s.n += 1;
  const scored = engine.scoreTeam(members, t.mode, {});
  if (!scored.valid) {
    s.invalid += 1;
    problems.push(
      `[${t.src}] ${t.label}: 실제로 쓰인 조합인데 우리 규칙에서 버스트 체인 불성립 — ` +
      `${members.map((m) => `${m.name_kr || m.title}(B${m.burst}${m.burstFlex ? '/유연' : ''})`).join(', ')}`);
  }
  const cyc = cycleSeconds(members);
  if (cyc <= 20.001) s.cyc.ok += 1; else s.cyc.slow += 1;
  stats.set(t.src, s);
}

const line = '─'.repeat(88);
console.log(line);
console.log(`등록된 실사용 조합으로 우리 규칙 검증 — ${teams.length}건`);
console.log(line);
console.log('출처          조합수   버스트 체인 불성립   (참고) 20초 순환 아님');
for (const [src, s] of stats) {
  console.log(`${src.padEnd(12)} ${String(s.n).padStart(5)}   ${String(s.invalid).padStart(10)}건        ` +
    `${String(s.cyc.slow).padStart(4)}건 (${Math.round(s.cyc.slow / s.n * 100)}%)`);
}
console.log(line);
console.log('※ 오른쪽 "20초 순환 아님"은 참고 지표다 — 판정하지 않는다.');
console.log('  PvP와 솔로레이드는 20초 주기를 전제하지 않는 판이라 여기 걸려도 정상이다.');
console.log(line);

if (problems.length) {
  console.log(`문제 ${problems.length}건 — 우리 데이터가 틀렸거나, 우리 규칙이 틀렸다\n`);
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log('');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
console.log('문제 0건 — 실제로 쓰인 조합이 전부 우리 규칙에서도 성립한다\n');
fs.rmSync(tmp, { recursive: true, force: true });
