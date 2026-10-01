#!/usr/bin/env node
/**
 * **엔진을 고치기 전후의 답을 나란히 놓고 "이전 엔진 대비"를 판정한다.** (2026-09-27)
 *
 *   node scripts/probeEngineChange.mjs --snap=before --mode=pvp         # 고치기 전: 답 스냅숏
 *   (엔진 수정)
 *   node scripts/probeEngineChange.mjs --snap=after  --mode=pvp         # 고친 뒤
 *   node scripts/probeEngineChange.mjs --diff=before,after --label=pvp-waste
 *        → probe-data/engine-change-<label>.md      바뀐 답을 멤버 정보·외부 지표와 함께 나란히
 *        → probe-data/engine-change-<label>-judg.txt 판정 틀(건마다 "키 +|=|- 메모")
 *   node scripts/probeEngineChange.mjs --tally=pvp-waste                # 판정 집계 → probe-data/rejudge-<label>.json
 *
 *   --mode = pvp | bossing | campaign | tribe_tower | all (기본 all)
 *   --variant=noflexcompete  2026-09-30 이전 경로(빈 자리 아키타입도 폴백보다 무조건 먼저) — 비교용
 *
 * ■ 왜 필요한가
 *   CLAUDE.md·testJudgmentMatch 머리 주석의 규칙: **엔진을 고쳐 답이 바뀐 건은 이전 엔진 대비로 판정하고,
 *   나아짐 > 나빠짐일 때만 채택한다**(지표만 보고 채택했다가 퇴행한 기록이 있다 — 버퍼 0명 관문, D1 1판).
 *   2026-09-26에 이걸 /tmp 임시 스크립트로 네 번 반복했다(PvP·레이드 낭비 판정, 속성 신호 실험). 도구로 굳힌다.
 *
 * ■ 표본 = 사이트와 같은 선정 경로(실사용 완전일치 → 아키타입 → 폴백)의 1위
 *   · 얇은 로스터 판정 표본 probe-data/thin-cases-s1·s2.jsonl(있으면)
 *   · 무작위 SSR 로스터 15·30·50명 × 20건(씨앗 고정) — 모드마다
 *
 * ■ 외부 지표(판정 보조 — 판정 자체가 아니다)
 *   채용합   = 그 모드 enikk 채용률(usageTier) 합. ⚠️ 바꾼 규칙이 채용률을 쓰는 규칙이면 순환이다 — 그땐 보지 말 것
 *   등록겹침 = 같은 모드(레이드는 같은 약점 속성) 등록 실사용 조합과의 최대 겹침 인원
 *   속성팀   = (레이드) 그 약점 속성 시즌 등록 25팀 중 등장 %. 전체 채용률보다 이 보스에 직접적인 근거다
 *   ⚠️ 2026-09-26 교훈: 레이드 "나빠짐"을 전체 채용률로 판정했다가 3건을 정정했다 — 속성팀을 먼저 볼 것
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PD = path.join(ROOT, 'probe-data');
fs.mkdirSync(PD, { recursive: true });
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const MODE = arg('mode', 'all');
const MODES = MODE === 'all' ? ['pvp', 'bossing', 'campaign', 'tribe_tower'] : [MODE];
const snapPath = (n) => path.join(PD, `engine-snap-${n}.json`);

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = j('characterDatabase.json');
const byT = new Map(cdb.map((c) => [c.title, c]));
const nm = (t) => byT.get(t)?.name_kr || t;
const key5 = (ts) => [...(ts || [])].sort().join('|');

async function loadEngine() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-ec-'));
  const fix = (src) => src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
  for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets', 'pvpBurst']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8')));
  const mod = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
  fs.rmSync(tmp, { recursive: true, force: true });
  return mod;
}
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const BOSSES = ['Iron', 'Wind', 'Water', 'Electronic', 'Fire'];

// ── 스냅숏 ──────────────────────────────────────────────────────────────
const SNAP = arg('snap', null);
const VARIANT = arg('variant', null);
if (SNAP) {
  const E = await loadEngine();
  // 사이트 경로는 엔진의 pickSiteTeam 하나로 잰다(2026-09-30). --variant=noflexcompete 로 그 전 경로.
  const site = (roster, mode, o) => {
    const r = E.pickSiteTeam(roster, mode, { ...o, noFlexCompete: VARIANT === 'noflexcompete' });
    return { path: r.path, team: r.team?.members.map((m) => m.title) || [] };
  };
  const out = {};
  for (const s of [1, 2]) {
    const p = path.join(PD, `thin-cases-s${s}.jsonl`);
    if (!fs.existsSync(p)) continue;
    for (const l of fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)) {
      const c = JSON.parse(l); if (!MODES.includes(c.mode)) continue;
      const a = site(c.roster.map((t) => byT.get(t)).filter(Boolean), c.mode, { bossElement: c.boss || null, tower: c.tower || null });
      out[`thin-s${s}-${c.id}`] = { mode: c.mode, boss: c.boss || null, tower: c.tower || null, roster: c.roster, ...a };
    }
  }
  const ssr = cdb.filter((c) => String(c.rarity).toUpperCase() === 'SSR');
  const rnd = mulberry32(20260926);   // 씨앗 고정 — before/after가 같은 로스터를 본다
  for (const mode of MODES) for (const size of [15, 30, 50]) for (let i = 0; i < 20; i++) {
    const pool = [...ssr]; const roster = [];
    while (roster.length < size) roster.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const boss = mode === 'bossing' ? BOSSES[i % 5] : null;
    out[`rnd-${mode}-${size}-${i}`] = { mode, boss, tower: null, roster: roster.map((c) => c.title), ...site(roster, mode, { bossElement: boss }) };
  }
  fs.writeFileSync(snapPath(SNAP), JSON.stringify({ mode: MODE, at: new Date().toISOString(), answers: out }));
  console.log(`${Object.keys(out).length}건 → ${path.relative(ROOT, snapPath(SNAP))}`);
}

// ── 비교 ────────────────────────────────────────────────────────────────
const DIFF = arg('diff', null);
if (DIFF) {
  const [bn, an] = DIFF.split(',');
  const LABEL = arg('label', `${bn}-${an}`);
  const B0 = JSON.parse(fs.readFileSync(snapPath(bn), 'utf8'));
  const A0 = JSON.parse(fs.readFileSync(snapPath(an), 'utf8'));
  // ⚠️ 2026-10-01: 무작위 로스터는 모드 순서대로 씨앗을 소비한다 — `--mode=all`과 `--mode=bossing` 스냅숏은 **같은 키라도 로스터가 다르다.**
  //    실제로 그렇게 대 놓고 "63건이 바뀌었다"를 판정할 뻔했다. 모드가 다르면 멈춘다.
  if (B0.mode !== A0.mode) { console.error(`스냅숏 모드가 다르다(${bn}: ${B0.mode} · ${an}: ${A0.mode}) — 무작위 로스터가 달라 비교가 무의미하다. 같은 --mode로 다시 찍을 것`); process.exit(1); }
  const b = B0.answers;
  const a = A0.answers;
  const ms = j('metaStats.json');
  const SLICE = { pvp: 'arena', bossing: 'soloraid', campaign: 'campaign', tribe_tower: 'campaign' };
  const EL = { iron: 'Iron', wind: 'Wind', water: 'Water', electric: 'Electronic', fire: 'Fire' };
  const reg = { pvp: (ms.pvp?.topTeams || []).map((t) => new Set(t.members)), campaign: (ms.campaignCompositions?.list || []).map((t) => new Set(t.members)), tribe_tower: [] };
  for (const p of j('towerCompositions.json').pools || []) for (const t of p.teams || []) reg.tribe_tower.push(new Set(t.members));
  const regBoss = {}; const share = {};
  for (const s of j('soloRaidTeams.json').seasons || []) {
    const k = EL[String(s.weakness || '').toLowerCase()]; if (!k) continue;
    (regBoss[k] ||= []); const m = (share[k] ||= new Map()); const n = (s.teams || []).length || 1;
    for (const t of s.teams || []) { regBoss[k].push(new Set(t.members)); for (const x of new Set(t.members)) m.set(x, (m.get(x) || 0) + 100 / n); }
  }
  const usage = (t, mode) => ms.usageTier?.[SLICE[mode]]?.[t];
  const ind = (team, r) => {
    const us = team.reduce((s, t) => s + (usage(t, r.mode)?.usage || 0), 0);
    const pool = r.mode === 'bossing' ? (regBoss[r.boss] || []) : (reg[r.mode] || []);
    const ov = Math.max(0, ...pool.map((st) => team.filter((x) => st.has(x)).length));
    const el = r.mode === 'bossing' && r.boss ? Math.round(team.reduce((s, t) => s + (share[r.boss]?.get(t) || 0), 0)) : null;
    const bursts = team.map((t) => String(byT.get(t)?.burst)).sort().join('');
    const att = team.filter((t) => byT.get(t)?.class === 'attacker').length;
    return { us: Math.round(us), ov, el, bursts, att };
  };
  const tierKey = (mode) => (mode === 'pvp' ? 'pvp' : mode === 'bossing' ? 'bossing' : 'story');
  const d = (t, r) => {
    const c = byT.get(t); if (!c) return t; const u = usage(t, r.mode);
    const sh = r.mode === 'bossing' && r.boss ? ` 속성팀${Math.round(share[r.boss]?.get(t) || 0)}%` : '';
    return `${c.name_kr}(B${c.burst} ${c.class.slice(0, 3)} ${c.element.slice(0, 4)} ${c.tiers?.[tierKey(r.mode)]} ${u ? u.tier + Math.round(u.usage) : '-'}${sh})`;
  };
  const changed = Object.keys(b).filter((k) => a[k] && key5(b[k].team) !== key5(a[k].team));
  const md = [`# 엔진 변경 비교 — ${LABEL}`, '', `스냅숏 ${bn} → ${an} · 표본 ${Object.keys(b).length}건 중 **바뀐 답 ${changed.length}건**`, '',
    '지표: 채용합(그 모드 enikk 채용률 합) · 등록겹침(등록 실사용 조합과 최대 겹침) · 속성팀(레이드, 그 약점 시즌 등록 25팀 등장 % 합) · 버스트 · 공격형 수', ''];
  const up = { us: [0, 0], ov: [0, 0], el: [0, 0] };
  for (const k of changed) {
    const r = b[k]; const ib = ind(b[k].team, r), ia = ind(a[k].team, r);
    for (const f of ['us', 'ov', 'el']) { if (ib[f] == null) continue; if (ia[f] > ib[f]) up[f][0]++; else if (ia[f] < ib[f]) up[f][1]++; }
    const fmt = (i) => `채용합${i.us} 등록겹침${i.ov}${i.el != null ? ` 속성팀${i.el}` : ''} 버스트${i.bursts} 공격형${i.att}`;
    md.push(`## ${k} [${r.mode}${r.boss ? ' 약점 ' + r.boss : ''}] 로스터 ${r.roster.length}명 · ${b[k].path}→${a[k].path}`,
      `- 이전: ${fmt(ib)} | ${b[k].team.map((t) => d(t, r)).join(', ')}`,
      `- 이후: ${fmt(ia)} | ${a[k].team.map((t) => d(t, r)).join(', ')}`, '');
  }
  md.splice(5, 0, `외부 지표(오름/내림): 채용합 ${up.us.join('/')} · 등록겹침 ${up.ov.join('/')} · 속성팀 ${up.el.join('/')}`, '');
  fs.writeFileSync(path.join(PD, `engine-change-${LABEL}.md`), md.join('\n'));
  const jp = path.join(PD, `engine-change-${LABEL}-judg.txt`);
  if (!fs.existsSync(jp)) fs.writeFileSync(jp, changed.map((k) => `${k} ? `).join('\n') + '\n');
  console.log(`바뀐 답 ${changed.length}/${Object.keys(b).length} · 채용합 오름/내림 ${up.us.join('/')} · 등록겹침 ${up.ov.join('/')} · 속성팀 ${up.el.join('/')}`);
  console.log(`→ probe-data/engine-change-${LABEL}.md · 판정 틀 probe-data/engine-change-${LABEL}-judg.txt ("? "를 + = - 로 바꾸고 메모)`);
}

// ── 판정 집계 ────────────────────────────────────────────────────────────
const TALLY = arg('tally', null);
if (TALLY) {
  const lines = fs.readFileSync(path.join(PD, `engine-change-${TALLY}-judg.txt`), 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const cases = {}; const t = { better: 0, same: 0, worse: 0, pending: 0 };
  for (const l of lines) {
    const m = l.match(/^(\S+)\s+([+=\-?])\s*(.*)$/); if (!m) continue;
    const v = { '+': 'better', '=': 'same', '-': 'worse', '?': 'pending' }[m[2]]; t[v]++;
    cases[m[1]] = { verdict: v, note: m[3] || '' };
  }
  fs.writeFileSync(path.join(PD, `rejudge-${TALLY}.json`), JSON.stringify({ label: TALLY, judge: 'claude', at: new Date().toISOString().slice(0, 10), tally: t, cases }, null, 1));
  console.log(`나아짐 ${t.better} · 같음 ${t.same} · 나빠짐 ${t.worse}${t.pending ? ` · 판정 대기 ${t.pending}` : ''} → probe-data/rejudge-${TALLY}.json`);
  console.log(t.pending ? '⏳ 판정을 마저 할 것' : (t.better > t.worse ? '✅ 채택 기준 충족(나아짐 > 나빠짐) — 가드(verify·랭커 백분위·일치율)도 함께 볼 것' : '⛔ 채택 기준 미달 — 되돌린다'));
}

if (!SNAP && !DIFF && !TALLY) {
  console.log('사용법: --snap=<이름> [--mode=…] | --diff=<전>,<후> [--label=…] | --tally=<label>   (머리 주석 참고)');
}
