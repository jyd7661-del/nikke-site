#!/usr/bin/env node
/**
 * **스테이지 "힐러 포함 / 탱커 포함" 시험 — enikk 사람들의 판이 정답지** (2026-10-23, 유저: "힐러 포함 탱커 포함 평가는 어떻게 했지?" → "방법이 있을까?" → "진행해")
 *
 *   node scripts/benchStageRoles.mjs                 # 많이 쓴·보스 두 목록 × 힐러·탱커
 *   node scripts/benchStageRoles.mjs --verbose       # 못 맞힌 건마다 사람들 판 ↔ 엔진 답
 *   node scripts/benchStageRoles.mjs --off=SWITCH    # 엔진 스위치(globalThis.__NIKKE_<이름>)를 켜고 — 이전 엔진 대비
 *
 * ■ 정답지: data/campaignRosters.json(enikk 캠페인 Compositions — 많이 쓴 600조합 · 보스 스테이지 904조합)
 *   역할 없는 조합 R(목록 상위 40)마다, **R과 4명이 같고 그 역할이 든 조합 중 가장 많이 쓴 것 G** = 사람들이 R에 힐러/탱커를 넣을 때 실제로 쓰는 판.
 *   랭커 캠페인 힐러 조합이 전부 "핵심 4명 + 헬름/플로라" 꼴이라(benchRankerRecall --role-swap) 한 자리 교체를 정답 모양으로 본다.
 * ■ 로스터 = R ∪ G + 무작위 SSR 15명 + 그 역할 니케 2명(씨앗 고정) → pickSiteTeam(requireRole). 실사용 경로는 G 자신만 빼고 켠다(LOO).
 * ■ 지표: G와 완전 일치 · 4명+ · 엔진 답이 목록에 있는가 · 사용 수 합(엔진 답 vs G)
 *   ⚠️ 목록에 없다고 틀린 답은 아니다(600·904조합 밖일 수 있다). 완전 일치가 주 지표, 나머지는 모양을 보는 보조.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const VERBOSE = process.argv.includes('--verbose');
for (const sw of (arg('off', '') || '').split(',').filter(Boolean)) globalThis['__NIKKE_' + sw] = true;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-sr-'));
const fix = (src) => src
  .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
  .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets', 'pvpBurst']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8')));
const E = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
fs.rmSync(tmp, { recursive: true, force: true });

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = j('characterDatabase.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const TREASURE = new Set(j('treasureEffects.json').characters.map((t) => t.characterId));
const ssr = cdb.filter((c) => String(c.rarity).toUpperCase() === 'SSR');
const rosters = j('campaignRosters.json');
const load = (rows) => rows.map((r, i) => ({ rank: i + 1, names: r.m, chars: r.m.map((t) => byTitle.get(t)), uses: r.u, sig: [...r.m].sort().join('|') }));
const LISTS = [['많이 쓴', load(rosters.most)], ['보스', load(rosters.boss)]];
const pct = (a, b) => `${(a / (b || 1) * 100).toFixed(1)}%`;

console.log(`스테이지 역할 시험 — enikk 캠페인 ${rosters.meta.asOf}${arg('off', '') ? ` · 스위치 ${arg('off')}` : ''}`);
const rnd = ((a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(20261023);
for (const [label, rows] of LISTS) {
  const sigUses = new Map(rows.map((r) => [r.sig, r.uses]));
  for (const role of ['healer', 'tank']) {
    const pool = ssr.filter((x) => E.teamRoleMembers([x])[role].length);
    let n = 0, exact = 0, ov4 = 0, inData = 0, gUses = 0, eUses = 0;
    const lines = [];
    for (const R of rows.filter((r) => !E.teamHasRole(r.chars, role)).slice(0, 40)) {
      const G = rows.filter((g) => E.teamHasRole(g.chars, role) && g.names.filter((t) => R.names.includes(t)).length === 4).sort((a, b) => b.uses - a.uses)[0];
      if (!G) continue;
      const roster = [...new Map([...R.chars, ...G.chars].map((c) => [c.title, c])).values()];
      const rest = ssr.filter((x) => !roster.includes(x));
      while (roster.length < 6 + 15 && rest.length) roster.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
      const rp = pool.filter((x) => !roster.includes(x));
      for (let k = 0; k < 2 && rp.length; k++) roster.push(rp.splice(Math.floor(rnd() * rp.length), 1)[0]);
      const treasureIds = new Set(roster.filter((x) => TREASURE.has(x.id)).map((x) => x.id));
      const r = E.pickSiteTeam(roster, 'campaign', { treasureIds, requireRole: role, excludeRealSig: G.sig });
      const got = (r.team?.members || []).map((m) => m.title);
      const ov = got.filter((t) => G.names.includes(t)).length;
      const u = sigUses.get([...got].sort().join('|')) || 0;
      n++; if (ov === 5) exact++; if (ov >= 4) ov4++; if (u) inData++; gUses += G.uses; eUses += u;
      if (ov < 5) lines.push(`    [${label} #${R.rank}] 사람들 ${G.names.join('/')} (${G.uses})  ←→  엔진 ${got.join('/')} (${u || '목록에 없음'})`);
    }
    console.log(`  ${label} · ${role === 'healer' ? '힐러' : '탱커'}: ${n}건 · 완전 일치 ${exact} (${pct(exact, n)}) · 4명+ ${ov4} (${pct(ov4, n)}) · 엔진 답이 목록에 있음 ${inData}/${n} · 사용 수 합 사람 ${gUses.toLocaleString()} / 엔진 ${eUses.toLocaleString()}`);
    if (VERBOSE) lines.forEach((l) => console.log(l));
  }
}
