#!/usr/bin/env node
/**
 * **사람들의 선택 시험 — enikk 넓은 조합 표로 "엔진이 무엇을 버리고 무엇을 넣는가"를 센다** (2026-10-24, 유저: "엔닉 조합을 많이 받아보는게 효과가 크네?
 * 더 받아보고 분석을 한 뒤에 왜 이 조합이 나왔는가 찾고 적용을 계속 시도하면 좋겠어")
 *
 *   node scripts/benchPeopleChoice.mjs                       # 캠페인·타워·솔로레이드 넓은 표 상위 조합
 *   node scripts/benchPeopleChoice.mjs --mode=campaign       # 한 모드만(campaign | tribe_tower | bossing)
 *   node scripts/benchPeopleChoice.mjs --top=150             # 목록(풀·시즌)마다 상위 몇 조합(기본 120 · 타워 풀·레이드 시즌은 그 안에서 나눔)
 *   node scripts/benchPeopleChoice.mjs --off=SWITCH          # 엔진 스위치(globalThis.__NIKKE_<이름>)를 켜고 — 이전 엔진 대비
 *   node scripts/benchPeopleChoice.mjs --json=out.json       # 못 맞힌 건 전부(파고들 때)
 *   node scripts/benchPeopleChoice.mjs --who=Mast            # 그 니케가 엔진 답/사람 판 한쪽에만 든 건을 줄줄이
 *
 * ■ benchRankerRecall과 다른 점
 *   그쪽은 엔진이 읽는 등록 표(캠페인 20 · 타워 50 · 레이드 시즌당 25)로 맞힘률을 잰다. 이쪽은 엔진이 읽지 않는 넓은 표(data/campaignRosters.json ·
 *   towerRosters.json · soloRaidRosters.json — 수백~수천 조합)로 **어긋남의 모양**을 센다:
 *   · 엔진이 자주 버리는 니케(사람 판에 있고 로스터에도 있는데 엔진 답에 없음) · 자주 넣는 니케(그 반대) — 사용 수 가중
 *   · 버림 → 넣음 짝(한 자리만 다른 건에서) — "목단을 넣고도 마스트를 남긴다" 같은 버릇이 짝으로 보인다
 *   맞힘률은 곁다리다 — 넓은 표의 아래쪽은 "갖고 있는 걸로 버틴" 조합이라 엔진이 더 나은 걸 골라도 틀림으로 잡힌다. 그래서 사용 수로 가중하고,
 *   개선 판단은 늘 이전 엔진 대비(--off) + /engine-change 판정으로 한다.
 *
 * ■ 로스터 = 사람 판 5명 + 무작위 SSR 15명(조합마다 씨앗 = 조합 이름의 해시 — 표가 늘어도 다른 조합의 로스터가 안 바뀐다). 애장품은 전원 보유.
 *   실사용 경로는 켜고 그 조합 자신만 뺀다(LOO). 타워는 그 풀에 나갈 수 있는 니케만 섞는다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const TOP = Number(arg('top', 120));
const EXTRA = Number(arg('extra', 15));
const ONLY = arg('mode', null);
const WHO = arg('who', null);
for (const sw of (arg('off', '') || '').split(',').filter(Boolean)) globalThis['__NIKKE_' + sw] = true;
// --rows=odd|even: 목록에서 홀수/짝수 순위 조합만 시험한다. --camp-table=even|odd|all[:K]: 엔진의 캠페인 실사용 표를 넓은 표(상위 K, 기본 600)로 바꿔 끼운다.
//   둘을 엇갈리게(--rows=odd --camp-table=even) 쓰면 시험 조합이 표에 없는 채로 "넓은 표가 표 밖 조합을 더 잘 찾나"를 본다.
const ROWS = arg('rows', 'all');
// --camp-pairs=even|odd|all:최소lift:가중치 — 그 순위 조합들로 짝 lift(같이 쓴 몫 / 각자 몫의 곱)를 세어 엔진에 끼운다(__NIKKE_CAMP_PAIRS).
//   짝의 같이 쓴 몫이 0.5% 미만이면 뺀다(표본이 얇은 짝의 lift는 튄다). 시험 조합과 엇갈린 순위로 세야 자기 자신을 안 본다.
const pickRows = (rows, which) => rows.filter((_, i) => which === 'all' || (which === 'odd' ? i % 2 === 0 : i % 2 === 1));
const CAMP_TABLE = arg('camp-table', null);
const CAMP_PAIRS = arg('camp-pairs', null);
if (CAMP_PAIRS) {
  const [which, minLift, w] = CAMP_PAIRS.split(':');
  const cr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'campaignRosters.json'), 'utf8'));
  const rows = pickRows(cr.most, which);
  const tot = rows.reduce((a, r) => a + r.u, 0);
  const one = {}; const two = {};
  for (const r of rows) {
    r.m.forEach((t) => { one[t] = (one[t] || 0) + r.u; });
    for (let i = 0; i < 5; i++) for (let k = i + 1; k < 5; k++) { const key = [r.m[i], r.m[k]].sort().join('|'); two[key] = (two[key] || 0) + r.u; }
  }
  globalThis.__NIKKE_CAMP_PAIRS = Object.entries(two).filter(([, v]) => v / tot >= 0.005).map(([key, v]) => {
    const [a, b] = key.split('|'); return { a, b, lift: (v / tot) / ((one[a] / tot) * (one[b] / tot)) };
  }).filter((p) => p.lift >= Number(minLift || 2));
  globalThis.__NIKKE_CAMP_PAIR_W = Number(w || 1);
}
if (CAMP_TABLE) {
  const [which, k] = CAMP_TABLE.split(':');
  const cr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'campaignRosters.json'), 'utf8'));
  globalThis.__NIKKE_CAMP_TABLE = pickRows(cr.most.slice(0, Number(k || 600)), which)
    .map((r) => ({ members: r.m, totalUses: r.u, pctOfClears: Number((r.u / cr.meta.analyzedClears * 100).toFixed(3)) }));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-pc-'));
const fix = (src) => src
  .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
  .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets', 'pvpBurst']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8')));
const E = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
fs.rmSync(tmp, { recursive: true, force: true });

const j = (f) => { const p = path.join(ROOT, 'data', f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const cdb = j('characterDatabase.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const ssr = cdb.filter((c) => String(c.rarity).toUpperCase() === 'SSR');
const TREASURE = new Set(j('treasureEffects.json').characters.map((t) => t.characterId));
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// 목록 = { mode, label, ctx, rows: [{ m: [5], u }] } — 목록마다 상위 TOP(타워 풀·레이드 시즌은 목록 수로 나눈 몫, 최소 20)
const lists = [];
const camp = j('campaignRosters.json');
if (camp) lists.push({ mode: 'campaign', label: '캠페인', ctx: {}, rows: camp.most, top: TOP });
const tw = j('towerRosters.json');
if (tw) for (const p of tw.pools) lists.push({ mode: 'tribe_tower', label: `타워 ${p.pool}`, ctx: { tower: p.tower }, rows: p.rows, top: Math.max(20, Math.round(TOP / tw.pools.length)) });
const sr = j('soloRaidRosters.json');
if (sr) for (const s of sr.seasons) lists.push({ mode: 'bossing', label: `레이드 ${s.raid}`, ctx: { bossElement: E.WEAKNESS_TO_BOSS_ELEMENT[s.weakness] }, rows: s.rows, top: Math.max(20, Math.round(TOP / sr.seasons.length * 2)) });

const NAME = { campaign: '캠페인', tribe_tower: '타워', bossing: '솔로레이드' };
const per = {};
const misses = [];
for (const L of lists) {
  if (ONLY && L.mode !== ONLY) continue;
  const S = (per[L.mode] ||= { n: 0, exact: 0, four: 0, w: 0, wExact: 0, inData: 0, eu: 0, dropped: {}, added: {}, pairs: {}, present: {} });
  const sigUses = new Map(L.rows.map((r) => [[...r.m].sort().join('|'), r.u]));
  for (const row of pickRows(L.rows, ROWS).slice(0, L.top)) {
    const team = row.m.map((t) => byTitle.get(t));
    if (team.some((x) => !x)) continue;
    const rnd = mulberry32(hash(L.label + '|' + row.m.join('|')));
    const pool = ssr.filter((x) => !row.m.includes(x.title) && (L.mode !== 'tribe_tower' || !L.ctx.tower || E.isTowerEligible(x, L.ctx.tower)));
    const roster = [...team];
    while (roster.length < 5 + EXTRA && pool.length) roster.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const treasureIds = new Set(roster.filter((x) => TREASURE.has(x.id)).map((x) => x.id));
    const r = E.pickSiteTeam(roster, L.mode, { ...L.ctx, treasureIds, excludeRealSig: [...row.m].sort().join('|') });
    const got = (r.team?.members || []).map((m) => m.title);
    const lost = row.m.filter((t) => !got.includes(t));
    const add = got.filter((t) => !row.m.includes(t));
    const u = row.u || 1;
    S.n++; S.w += u;
    const eu = sigUses.get([...got].sort().join('|')) || 0;
    if (eu) S.inData++; S.eu += Math.min(eu, u);
    if (!lost.length) { S.exact++; S.wExact += u; }
    if (lost.length <= 1) S.four++;
    row.m.forEach((t) => { S.present[t] = (S.present[t] || 0) + u; });
    lost.forEach((t) => { S.dropped[t] = (S.dropped[t] || 0) + u; });
    add.forEach((t) => { S.added[t] = (S.added[t] || 0) + u; });
    if (lost.length === 1) { const k = `${lost[0]} → ${add[0]}`; S.pairs[k] = (S.pairs[k] || 0) + u; }
    if (lost.length) misses.push({ list: L.label, mode: L.mode, ctx: L.ctx, u, eu, want: row.m, got, lost, add, path: r.path, roster: roster.map((x) => x.title) });
  }
}

const fmt = (n) => Math.round(n).toLocaleString();
const topOf = (o, k = 12) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);
console.log(`사람들의 선택 — 목록마다 상위 조합${ROWS !== 'all' ? `(${ROWS} 순위만)` : ''} · 섞은 SSR ${EXTRA}명 · 실사용은 자기 조합만 빼고 켬${arg('off', '') ? ` · 스위치 ${arg('off')}` : ''}${CAMP_TABLE ? ` · 캠페인 표 ${CAMP_TABLE}(${globalThis.__NIKKE_CAMP_TABLE.length}조합)` : ''}${CAMP_PAIRS ? ` · 짝 ${CAMP_PAIRS}(${globalThis.__NIKKE_CAMP_PAIRS.length}쌍)` : ''}`);
for (const [m, S] of Object.entries(per)) {
  console.log(`\n■ ${NAME[m]} ${S.n}조합 · 완전 일치 ${(S.exact / S.n * 100).toFixed(1)}% (사용 수 가중 ${(S.wExact / S.w * 100).toFixed(1)}%) · 4명+ ${(S.four / S.n * 100).toFixed(1)}% · 엔진 답이 목록에 ${(S.inData / S.n * 100).toFixed(1)}% · 사용 수 비 ${(S.eu / S.w * 100).toFixed(1)}%`);
  console.log('  (사용 수 비 = Σmin(엔진 답 사용 수, 사람 판 사용 수) / Σ사람 판 — 엔진 답이 사람들이 그만큼 쓰는 다른 판이면 오답이 아니라고 본다)');
  console.log('  엔진이 버림(사용 수 가중 · 그 니케가 든 사람 판 대비):');
  for (const [t, v] of topOf(S.dropped)) console.log(`    ${t.padEnd(28)} ${fmt(v).padStart(9)}  (${(v / S.present[t] * 100).toFixed(0)}%)`);
  console.log('  엔진이 넣음:');
  for (const [t, v] of topOf(S.added)) console.log(`    ${t.padEnd(28)} ${fmt(v).padStart(9)}`);
  console.log('  한 자리만 다를 때 버림 → 넣음:');
  for (const [k, v] of topOf(S.pairs, 15)) console.log(`    ${k.padEnd(48)} ${fmt(v).padStart(9)}`);
}
if (WHO) {
  console.log(`\n■ ${WHO}가 한쪽에만 든 건`);
  for (const x of misses.filter((x) => x.lost.includes(WHO) || x.add.includes(WHO)).sort((a, b) => b.u - a.u).slice(0, 40))
    console.log(`  [${x.list} ${fmt(x.u)}] 사람 ${x.want.join('/')}  ←→  엔진 ${x.got.join('/')} (${x.path})`);
}
const out = arg('json', null);
if (out) fs.writeFileSync(out, JSON.stringify({ per, misses }, null, 1));
