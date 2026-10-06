/**
 * 솔로레이드 **5팀 분배** 채점 (2026-10-06, 유저: "레이드 5팀 분배로 가자")
 *
 *   node scripts/benchRaidSquads.mjs                    # 현재 시즌 5개 · 엔진만(실사용 경로 끔 — 그 시즌 등록 팀을 그대로 꺼내면 정답 유출)
 *   node scripts/benchRaidSquads.mjs --loso             # 현재 시즌 · 실사용 경로 켜되 **그 시즌 표 전체만** 뺌(지난 시즌 등 나머지는 그대로)
 *   node scripts/benchRaidSquads.mjs --site             # 현재 시즌 · 사이트 그대로(그 시즌 표도 씀 — 정답 유출. 랭커 풀이면 등록 팀을 얼마나 잘 '나눠 꺼내는가'만 본다)
 *   node scripts/benchRaidSquads.mjs --holdout          # 오래된 시즌 5개(probe-data/soloRaidHoldout2.json) · 사이트 경로 그대로
 *   node scripts/benchRaidSquads.mjs --roster=all       # 로스터 = SSR 전원(기본: 그 시즌 등록 팀에 나온 니케 전원 = 랭커 풀)
 *   node scripts/benchRaidSquads.mjs --algo=greedy      # 분배 방식(lib/synergyEngine.js pickRaidSquads의 algo)
 *   node scripts/benchRaidSquads.mjs --verbose          # 시즌마다 엔진 5팀 · 정답 5팀
 *
 * ■ 왜 5팀인가
 *   솔로레이드는 서로 다른 니케로 5팀을 짜서 친다. 등록 상위 팀(soloRaidTeams.json, 시즌마다 사용 횟수 상위 25)에서
 *   **서로 안 겹치는 5팀**이 시즌마다 있다 — 작열(40)은 사용 횟수 1~5위가 그대로 서로 안 겹친다. 한 팀 추천만 하면
 *   1팀이 핵심(크라운·리타·토브…)을 다 가져가고 나머지 4팀은 사용자가 알아서 짜야 한다.
 *
 * ■ 정답(오라클) = 그 시즌 등록 팀 중 서로 안 겹치는 5팀의 **평균 피해(avgDamage) 합 최대**. 엔진 데이터가 아니라 enikk 화면 값이다(A등급).
 * ■ 지표
 *   등록팀   = 엔진 5팀 중 그 시즌 등록 팀과 5명이 같은 팀 수
 *   피해합%  = 등록 팀과 같은 엔진 팀의 avgDamage 합 ÷ 오라클 합 (등록 팀이 아니면 0으로 셈 — 하한)
 *   정답팀   = 엔진 5팀 중 오라클 5팀과 같은 팀 수
 *   겹침     = 엔진 팀마다 등록 팀과 최대 겹침 인원의 평균
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);
for (const sw of (arg('off', '') || '').split(',').filter(Boolean)) globalThis['__NIKKE_' + sw] = true;

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-rs-'));
const fix = (src) => src
  .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
  .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets', 'pvpBurst']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8')));
const E = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
fs.rmSync(tmp, { recursive: true, force: true });

const cdb = j('characterDatabase.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const TREASURE = new Set(j('treasureEffects.json').characters.map((t) => t.characterId));
const HOLD = has('holdout');
const seasons = HOLD
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'probe-data', 'soloRaidHoldout2.json'), 'utf8')).seasons
  : j('soloRaidTeams.json').seasons.filter((s) => !s.archive);
const dmg = (x) => { const m = String(x || '').match(/^([\d.]+)\s*([BMK]?)$/i); return m ? Number(m[1]) * ({ B: 1e9, M: 1e6, K: 1e3 }[m[2].toUpperCase()] || 1) : 0; };
const sig = (ms) => [...ms].sort().join('|');

function oracle(teams) {
  let best = { tot: -1, pick: [] };
  const rec = (i, used, pick, tot) => {
    if (pick.length === 5) { if (tot > best.tot) best = { tot, pick: [...pick] }; return; }
    for (let k = i; k < teams.length; k++) if (!teams[k].members.some((m) => used.has(m))) rec(k + 1, new Set([...used, ...teams[k].members]), [...pick, k], tot + teams[k].dmg);
  };
  rec(0, new Set(), [], 0);
  return best;
}

const ALGO = arg('algo', undefined);
const ALL = arg('roster', 'pool') === 'all';
const ssr = cdb.filter((c) => String(c.rarity).toUpperCase() === 'SSR');
const sum = { seasons: 0, made: 0, reg: 0, orc: 0, ov: 0, dmg: 0, odmg: 0 };
console.log(`솔로레이드 5팀 분배 — ${HOLD ? '오래된 시즌(검증)' : has('loso') ? '현재 시즌 · 실사용은 그 시즌만 뺌' : has('site') ? '현재 시즌 · 사이트 그대로(유출)' : '현재 시즌 · 실사용 경로 끔'} · 로스터 ${ALL ? 'SSR 전원' : '그 시즌 랭커 풀'}${ALGO ? ` · algo ${ALGO}` : ''}${arg('off', '') ? ` · 스위치 ${arg('off')}` : ''}`);
for (const s of seasons) {
  const teams = (s.teams || []).filter((t) => t.members.every((n) => byTitle.has(n))).map((t) => ({ members: t.members, dmg: dmg(t.avgDamage), sig: sig(t.members) }));
  const bySig = new Map(teams.map((t) => [t.sig, t]));
  const orc = oracle(teams);
  const orcSigs = new Set(orc.pick.map((k) => teams[k].sig));
  const pool = ALL ? ssr : [...new Set(teams.flatMap((t) => t.members))].map((n) => byTitle.get(n));
  const treasureIds = new Set(pool.filter((c) => TREASURE.has(c.id)).map((c) => c.id));
  const bossElement = E.WEAKNESS_TO_BOSS_ELEMENT[String(s.weakness || '').toLowerCase()];
  const LOSO = has('loso');
  const r = E.pickRaidSquads(pool, { bossElement, treasureIds, skipRealUsage: !HOLD && !LOSO && !has('site'), excludeRealRaid: LOSO ? s.raid : undefined, algo: ALGO });
  const got = r.squads.map((q) => q.team.members.map((m) => m.title));
  const reg = got.filter((g) => bySig.has(sig(g)));
  const ov = got.map((g) => Math.max(0, ...teams.map((t) => t.members.filter((m) => g.includes(m)).length)));
  const d = reg.reduce((a, g) => a + bySig.get(sig(g)).dmg, 0);
  sum.seasons++; sum.made += got.length; sum.reg += reg.length; sum.orc += got.filter((g) => orcSigs.has(sig(g))).length;
  sum.ov += ov.reduce((a, b) => a + b, 0); sum.dmg += d; sum.odmg += orc.tot;
  console.log(`  ${s.raid} ${String(s.weakness).padEnd(8)} 팀 ${got.length}/5 · 등록팀 ${reg.length} · 정답팀 ${got.filter((g) => orcSigs.has(sig(g))).length} · 피해합 ${(100 * d / orc.tot).toFixed(0)}% · 겹침 ${(ov.reduce((a, b) => a + b, 0) / Math.max(1, ov.length)).toFixed(2)} · 경로 ${r.squads.map((q) => q.path).join(',')}`);
  if (has('verbose')) {
    got.forEach((g, i) => console.log(`      엔진${i + 1} ${g.join('/')}${bySig.has(sig(g)) ? ' ✓' : ''} (겹침 ${ov[i]})`));
    orc.pick.forEach((k, i) => console.log(`      정답${i + 1} ${teams[k].members.join('/')} ${(teams[k].dmg / 1e9).toFixed(2)}B`));
  }
}
console.log(`  전체 ${sum.seasons}시즌 · 팀 ${sum.made}/${sum.seasons * 5} · 등록팀 ${sum.reg} · 정답팀 ${sum.orc} · 피해합 ${(100 * sum.dmg / sum.odmg).toFixed(1)}% · 겹침 ${(sum.ov / Math.max(1, sum.made)).toFixed(2)}`);
