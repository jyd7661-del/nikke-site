#!/usr/bin/env node
/**
 * D1(버프 대상 없음)이 **동점 처리로 고쳐지는 문제인가**를 먼저 잰다. (2026-09-18, 일회성 측정)
 *
 * 왜 먼저 재는가: 고치는 방법이 둘인데 성격이 완전히 다르다.
 *   (가) 동점 처리 — 티어 합이 같은 후보들 사이에서만 "대상 없는 버프가 적은 쪽"을 고른다.
 *        순위를 뒤집지 않으므로 근거 없는 숫자를 만들지 않는다(원칙 2). `wastedCount`와 같은 패턴.
 *   (나) 감점 — 티어 합에서 점수를 깎는다. 얼마나 깎을지가 **근거 없는 수치**다. 원칙 2가 막는 방향.
 *
 * 그래서 먼저 확인한다: 같은 티어 합에 "대상 없는 버프가 더 적은" 후보가 실제로 존재하는가?
 * 있으면 (가)로 충분하다. 없으면 (가)로는 아무것도 안 바뀌고 다른 접근이 필요하다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scopeOf } from './simulateTeams.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const nm = (t) => byTitle.get(t)?.name_kr || t;
const lc = (v) => String(v || '').toLowerCase();

const ELEMENTS = ['fire', 'water', 'wind', 'iron', 'electric'];
const WEAPON_WORDS = [['sniper rifle', 'sr'], ['rocket launcher', 'rl'], ['submachine gun', 'smg'], ['assault rifle', 'ar'], ['machine gun', 'mg'], ['shotgun', 'sg'], ['shotgun-wielding', 'sg']];
function resolveAllyScope(scope, caster, team) {
  const s = lc(scope);
  if (!/all\b/.test(s) || /enem/.test(s)) return null;
  const el = ELEMENTS.find((e) => new RegExp(`all ${e} (code|type) all(y|ies)`).test(s) || new RegExp(`allies with ${e} element`).test(s));
  const wp = WEAPON_WORDS.find(([w]) => s.includes(w));
  const squad = /from the same squad/.test(s);
  if (!el && !wp && !squad) return null;
  let out = team;
  if (el) out = out.filter((m) => lc(m.element) === el);
  if (wp) out = out.filter((m) => lc(m.weapon) === wp[1]);
  if (squad) { if (!caster.squad) return null; out = out.filter((m) => m.squad === caster.squad); }
  return out;
}
function deadBuffCount(team) {
  let n = 0;
  for (const c of team) {
    for (const sk of c.skills || []) {
      let hit = false;
      for (const cl of String(sk.desc || '').split(/(?<=\.)\s+/)) {
        const sc = scopeOf(cl.trim()); if (sc === null) continue;
        const t = resolveAllyScope(sc, c, team); if (t === null) continue;
        if (t.filter((m) => m.id !== c.id).length === 0) { hit = true; break; }
      }
      if (hit) { n++; break; }
    }
  }
  return n;
}

async function loadEngine() {
  const LIB = path.join(ROOT, 'lib');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-dead-'));
  const fix = (src) => src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
  for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
  return import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
}

const E = await loadEngine();
// testJudgmentMatch가 D1으로 지목한 건들
const TARGETS = [
  { seed: 1, id: 'T02' }, { seed: 1, id: 'T11' }, { seed: 1, id: 'T14' }, { seed: 1, id: 'T20' },
  { seed: 2, id: 'T05' }, { seed: 2, id: 'T13' }, { seed: 2, id: 'T17' },
];
const line = '─'.repeat(84);
console.log(line);
console.log('D1을 동점 처리로 고칠 수 있는가 — 같은 티어 합에 더 나은 후보가 있는가');
console.log(line);
let fixable = 0, needsMore = 0;
for (const { seed, id } of TARGETS) {
  const cases = fs.readFileSync(path.join(ROOT, 'probe-data', `thin-cases-s${seed}.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
  const c = cases.find((x) => x.id === id);
  if (!c) { console.log(`  s${seed} ${id}: 표본 없음`); continue; }
  const roster = c.roster.map((t) => byTitle.get(t)).filter(Boolean);
  const rec = E.recommendTeams(roster, c.mode, { bossElement: c.boss || null, tower: c.tower || null, topN: 200 });
  if (!rec.teams?.length) { console.log(`  s${seed} ${id}: 후보 없음`); continue; }
  const top = rec.teams[0];
  const topDead = deadBuffCount(top.members.map((m) => byTitle.get(m.title)).filter(Boolean));
  // 티어 합이 같은 후보들 중 대상 없는 버프가 더 적은 것
  const ties = rec.teams.filter((t) => t.totalScore === top.totalScore);
  let best = null;
  for (const t of ties) {
    const d = deadBuffCount(t.members.map((m) => byTitle.get(m.title)).filter(Boolean));
    if (best === null || d < best.d) best = { d, t };
  }
  const canFix = best && best.d < topDead;
  if (canFix) fixable++; else needsMore++;
  console.log(`  s${seed} ${id} (${c.mode}) 티어합 ${top.totalScore} · 동점 후보 ${ties.length}개`);
  console.log(`     지금 1위: 대상없는버프 ${topDead}  ${top.members.map((m) => nm(m.title)).join(' · ')}`);
  console.log(`     동점 최선: 대상없는버프 ${best ? best.d : '-'}  ${best ? best.t.members.map((m) => nm(m.title)).join(' · ') : ''}`);
  console.log(`     → ${canFix ? '✅ 동점 처리로 바뀐다' : '❌ 동점 안에 더 나은 후보가 없다(동점 처리로는 안 바뀜)'}`);
}
console.log('');
console.log(`  동점 처리로 바뀌는 건 ${fixable}/${TARGETS.length} · 안 바뀌는 건 ${needsMore}`);
console.log(line);
