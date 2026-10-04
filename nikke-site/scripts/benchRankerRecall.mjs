#!/usr/bin/env node
/**
 * **랭커 조합 복원 시험** — 내 판정이 들어가지 않는 정답지로 엔진을 잰다. (2026-10-01)
 *
 *   node scripts/benchRankerRecall.mjs                 # 실사용 경로를 끄고(엔진이 스스로 찾게) 잰다
 *   node scripts/benchRankerRecall.mjs --no-arch       # 아키타입(prydwen 등록 조합) 경로까지 끈다 — 폴백 탐색만
 *   node scripts/benchRankerRecall.mjs --extra=25      # 섞는 니케 수(기본 15)
 *   node scripts/benchRankerRecall.mjs --off=SWITCH    # 엔진 스위치(globalThis.__NIKKE_<이름>)를 켜고 잰다 — 이전 엔진 대비
 *   node scripts/benchRankerRecall.mjs --verbose       # 못 맞힌 건마다 무엇을 골랐는지
 *   node scripts/benchRankerRecall.mjs --loo           # 실사용 경로를 켜되 정답 팀 자신만 뺀다(leave-one-out)
 *   node scripts/benchRankerRecall.mjs --loo --off=REAL_PARTIAL_OFF   # 실사용 4/5 부분 일치를 끈 판(2026-10-03 이전)
 *   node scripts/benchRankerRecall.mjs --holdout=probe-data/soloRaidHoldout.json   # 엔진 데이터에 없는 지난 레이드 시즌으로만(검증)
 *
 * ■ 왜 필요한가
 *   judgmentBench(엔진 = 내 조합)는 99%까지 올랐지만 정답지가 **내 판정**이다. 2026-10-01 하루에만 내 판정이 여러 번 틀렸다
 *   (목단 애장품·20초 주기·토템) — 그 지표로는 내 판단 이상으로 깎을 수 없다(유저: "계속 깎아 나가야겠네").
 *   랭커는 캐릭터를 다 가지고도 그 5명을 골랐다. 그 5명에 무작위 니케를 섞은 로스터를 주면 엔진이 그 5명을 다시 골라야 한다.
 *
 * ■ 설계
 *   · 정답: 등록 실사용 조합 — 캠페인(enikk 클리어 조합) · 타워(풀별) · 솔로레이드(시즌 약점 속성) · PvP(아레나 상위). 이름이 DB에 없는 팀은 뺀다
 *   · 로스터 = 그 5명 + 무작위 SSR N명(씨앗 고정, 팀마다 다름). 애장품은 로스터의 애장품 캐릭터 전원 보유(랭커 기록은 보유자 기록 — 유저 원칙 10-01)
 *   · 엔진은 사이트 경로(pickSiteTeam) 그대로, 단 실사용 경로(랭커 기록을 그대로 꺼냄)는 끈다. --no-arch면 prydwen 아키타입도 끈다
 *   · 지표: 5명 완전 복원 % · 평균 겹침(0~5) · 4명 이상 겹침 %. 모드별로 따로(한 판 성격이 달라 합치면 가린다)
 *   ⚠️ 섞은 니케 중에 랭커 팀보다 나은 대안이 있을 수 있다(랭커도 사람마다 다르다). 그래서 100%가 목표가 아니라 **이전 엔진 대비 오르내림**을 본다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);
const EXTRA = Number(arg('extra', 15));
const NO_ARCH = has('no-arch');
const VERBOSE = has('verbose');
// --loo: 실사용 경로를 켜되 정답 팀 자신만 뺀다(leave-one-out). 실사용 4/5 부분 일치(2026-10-03 기본 켬)는 여기서만 의미가 있다.
//   --off=REAL_PARTIAL_OFF로 부분 일치를 끈 판과 비교한다. --partial-compete는 부분 일치를 폴백과 겨루게 하는 비교용(기본 엔진은 안 겨룸).
const LOO = has('loo');
const COMPETE = has('partial-compete');
for (const sw of (arg('off', '') || '').split(',').filter(Boolean)) globalThis['__NIKKE_' + sw] = true;

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-rr-'));
// --raid-teams=<파일>: 엔진이 읽는 soloRaidTeams.json을 바꿔 끼운다(실험 — 표를 넓히면 나아지는가). 운영 파일은 안 건드린다.
const RAID_TEAMS = arg('raid-teams', null);
const dataPath = (n) => (n === 'soloRaidTeams' && RAID_TEAMS ? path.resolve(ROOT, RAID_TEAMS) : path.join(ROOT, 'data', `${n}.json`));
const fix = (src) => src
  .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(dataPath(n)).href)} with { type: 'json' };`)
  .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets', 'pvpBurst']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8')));
const E = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
fs.rmSync(tmp, { recursive: true, force: true });

const cdb = j('characterDatabase.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const ssr = cdb.filter((c) => String(c.rarity).toUpperCase() === 'SSR');
const TREASURE = new Set(j('treasureEffects.json').characters.map((t) => t.characterId));
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const cases = [];
const ms = j('metaStats.json');
// --holdout=<파일>: 엔진 데이터에 없는 지난 레이드 시즌(probe-data/soloRaidHoldout.json)으로만 잰다 — 오늘 엔진을 다듬으며 한 번도 안 본 데이터.
//   그 팀들은 엔진의 실사용 표에 없으므로 자기 팀을 뺄 필요 없이 실사용 경로를 그대로 켠다(사이트와 같은 조건).
const HOLDOUT = arg('holdout', null);
if (HOLDOUT) {
  const h = JSON.parse(fs.readFileSync(path.resolve(ROOT, HOLDOUT), 'utf8'));
  // PvP 보관 시즌(probe-data/pvpHoldout-s38.json: { topTeams })
  (h.topTeams || []).forEach((t, i) => cases.push({ key: `hold-pvp-${i}`, mode: 'pvp', members: t.members, ctx: {} }));
  (h.seasons || []).forEach((s) => (s.teams || []).forEach((t, i) => cases.push({
    key: `hold-${s.raid}-${i}`, mode: 'bossing', members: t.members,
    ctx: { bossElement: E.WEAKNESS_TO_BOSS_ELEMENT[String(s.weakness || '').toLowerCase()] } })));
}
if (!HOLDOUT) {
(ms.campaignCompositions?.list || []).forEach((t, i) => cases.push({ key: `camp-${i}`, mode: 'campaign', members: t.members, ctx: {} }));
j('towerCompositions.json').pools.forEach((p) => (p.teams || []).forEach((t, i) => cases.push({ key: `tower-${p.tower || p.pool}-${i}`, mode: 'tribe_tower', members: t.members, ctx: { tower: p.tower || null } })));
j('soloRaidTeams.json').seasons.filter((s) => !s.archive).forEach((s) => (s.teams || []).forEach((t, i) => cases.push({
  key: `raid-${s.raid}-${i}`, mode: 'bossing', members: t.members,
  ctx: { bossElement: E.WEAKNESS_TO_BOSS_ELEMENT[String(s.weakness || '').toLowerCase()] } })));
(ms.pvp?.topTeams || []).forEach((t, i) => cases.push({ key: `pvp-${i}`, mode: 'pvp', members: t.members, ctx: {} }));
}

const rnd = mulberry32(20261001);
const stats = {};
const misses = [];
for (const c of cases) {
  const team = c.members.map((n) => byTitle.get(n));
  if (team.length !== 5 || team.some((x) => !x)) continue;
  const pool = ssr.filter((x) => !c.members.includes(x.title));
  // --drop=k: 정답 5명 중 k명을 로스터에서 뺀다(불완전 로스터 — 그 자리는 무작위로 채워 크기는 같게). 지표는 **남은 정답 멤버를 몇 명 살렸나**.
  const DROP = Number(arg('drop', 0));
  const kept = [...team];
  for (let d = 0; d < DROP; d++) kept.splice(Math.floor(rnd() * kept.length), 1);
  const roster = [...kept];
  while (roster.length < 5 + EXTRA && pool.length) roster.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const treasureIds = new Set(roster.filter((x) => TREASURE.has(x.id)).map((x) => x.id));
  const r = E.pickSiteTeam(roster, c.mode, HOLDOUT
    ? { ...c.ctx, treasureIds, skipArchetype: NO_ARCH }
    : LOO
    ? { ...c.ctx, treasureIds, skipArchetype: NO_ARCH, excludeRealSig: [...c.members].sort().join('|'), realPartialCompete: COMPETE }
    : { ...c.ctx, treasureIds, skipRealUsage: true, skipArchetype: NO_ARCH });
  const got = (r.team?.members || []).map((m) => m.title);
  const ov = got.filter((t) => c.members.includes(t) && roster.some((x) => x.title === t)).length;
  const keptN = kept.length;
  const s = (stats[c.mode] ||= { n: 0, exact: 0, four: 0, ov: 0, paths: {} });
  // drop이면 '완전' = 남은 정답 멤버 전원 유지, '4명+' 자리는 남은 멤버의 (keptN-1)명 이상 유지
  s.n++; s.ov += ov; if (ov === keptN) s.exact++; if (ov >= keptN - 1) s.four++;
  s.paths[r.path] = (s.paths[r.path] || 0) + 1;
  if (ov < keptN) misses.push({ key: c.key, mode: c.mode, ov, want: c.members, got, path: r.path });
}

const NAME = { campaign: '캠페인', tribe_tower: '타워', bossing: '솔로레이드', pvp: 'PvP' };
console.log(`랭커 조합 복원${arg('drop', 0) > 0 ? ` [불완전 로스터: 정답 ${arg('drop')}명 뺌 — 완전 = 남은 ${5 - arg('drop')}명 전원 유지 · 4명+ 칸 = ${4 - arg('drop')}명 이상 유지]` : ''}${HOLDOUT ? ` [검증 전용 ${HOLDOUT}]` : ''} — 섞은 니케 ${EXTRA}명 · ${HOLDOUT ? '실사용 경로 그대로' : LOO ? `실사용은 자기 팀만 빼고 켬${COMPETE ? '(부분 일치는 폴백과 겨룸)' : ''}` : '실사용 경로 끔'}${NO_ARCH ? ' · 아키타입도 끔' : ''}${arg('off', '') ? ` · 스위치 ${arg('off')}` : ''}${RAID_TEAMS ? ` · 레이드 표 ${RAID_TEAMS}` : ''}`);
let T = { n: 0, exact: 0, four: 0, ov: 0 };
for (const [m, s] of Object.entries(stats)) {
  console.log(`  ${NAME[m].padEnd(6)} ${String(s.n).padStart(3)}팀 · 완전 복원 ${(s.exact / s.n * 100).toFixed(1).padStart(5)}% · 4명+ ${(s.four / s.n * 100).toFixed(1).padStart(5)}% · 평균 겹침 ${(s.ov / s.n).toFixed(2)} · 경로 ${JSON.stringify(s.paths)}`);
  T = { n: T.n + s.n, exact: T.exact + s.exact, four: T.four + s.four, ov: T.ov + s.ov };
}
console.log(`  전체   ${String(T.n).padStart(3)}팀 · 완전 복원 ${(T.exact / T.n * 100).toFixed(1).padStart(5)}% · 4명+ ${(T.four / T.n * 100).toFixed(1).padStart(5)}% · 평균 겹침 ${(T.ov / T.n).toFixed(2)}`);
if (VERBOSE) for (const x of misses) console.log(`  [${x.key} ${x.ov}/5 ${x.path}] 랭커 ${x.want.join('/')}  ←→  엔진 ${x.got.join('/')}`);
const out = arg('json', null);
if (out) fs.writeFileSync(out, JSON.stringify({ stats, misses }, null, 1));
