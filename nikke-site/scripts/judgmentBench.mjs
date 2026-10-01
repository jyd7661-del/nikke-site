#!/usr/bin/env node
/**
 * **엔진 추천 ↔ 내 조합 일치율 — 블라인드 기준 표본.** (2026-10-01, 유저 지시: "95% 이상 일치할 때까지")
 *
 *   node scripts/judgmentBench.mjs --gen --seed=11          # 로스터 20건(엔진 답 없이) → probe-data/bench-s11.jsonl
 *   node scripts/judgmentBench.mjs --sheet --seed=11        # 판정지(로스터 + 캐릭터 근거, 엔진 답 없음) → probe-data/bench-s11-sheet.md
 *   (probe-data/bench-picks-s11.txt 에 내 조합을 적는다: "B01 이름|이름|이름|이름|이름" — 같은 가치 대안은 " / "로 여럿)
 *   node scripts/judgmentBench.mjs --score --seeds=11,12,13 # 지금 엔진 답과 대조 → 일치율 + "판정 필요" 목록
 *   (엔진 답이 내 조합과 다르면 probe-data/bench-verdicts.txt 에 "<키> = 메모"(동급) 또는 "<키> - 메모"(엔진이 나쁨)를 적는다)
 *
 * ■ 왜 새로 만드나 — testJudgmentMatch와 다른 점
 *   testJudgmentMatch는 "엔진 답 vs AI 답 중 어느 쪽이 나은가"를 센다. 엔진이 AI보다 낫기만 하면 일치라서
 *   **엔진 답이 내가 고를 조합과 같다는 뜻이 아니다.** 유저 목표는 "엔진 목록 = 내 목록"이므로 내 조합을 **먼저**(엔진 답을 보기 전에) 정하고 댄다.
 *   표본도 38건뿐이라 95%(불일치 2건 이하)에 맞추면 그 표본에 과적합된다 → 개발 씨앗과 **검증 씨앗을 나눈다**(검증 씨앗은 수정 중에 안 본다).
 *
 * ■ 일치 = 엔진 5명이 내 조합(또는 내가 적은 대안) 중 하나와 같다 · 또는 다르지만 내가 "동급(=)"으로 판정했다.
 *   판정은 엔진 답 집합(정렬한 5명)에 붙으므로, 엔진이 바뀌어 답이 달라지면 그 판정은 자동으로 무효가 된다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PD = path.join(ROOT, 'probe-data');
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);
const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = j('characterDatabase.json');
const byT = new Map(cdb.map((c) => [c.title, c]));
const ms = j('metaStats.json');
const key5 = (ts) => [...ts].sort().join('|');

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function loadEngine() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-bench-'));
  const fix = (src) => src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
  for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets', 'pvpBurst']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8')));
  const E = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
  return { E, tmp };
}

const casesPath = (s) => path.join(PD, `bench-s${s}.jsonl`);
const readCases = (s) => fs.readFileSync(casesPath(s), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

// --- 표본 생성(엔진 답 없이) ---
if (has('gen')) {
  const seed = Number(arg('seed', 11));
  const rnd = mulberry32(seed * 7919);
  const ssr = cdb.filter((c) => c.rarity === 'SSR' && (c.skills || []).length);
  const plan = [
    ...['Iron', 'Wind', 'Water', 'Electronic', 'Fire'].map((b) => ({ mode: 'bossing', boss: b })),
    ...[null, 'elysion', 'missilis', 'tetra', 'pilgrim'].map((t) => ({ mode: 'tribe_tower', tower: t })),
    ...Array(5).fill({ mode: 'campaign' }),
    ...Array(5).fill({ mode: 'pvp' }),
  ];
  const SIZES = [12, 15, 18, 25];
  const { E, tmp } = await loadEngine();
  const out = plan.map((p, i) => {
    const size = SIZES[i % SIZES.length];
    let roster; let tries = 0;
    // 로스터만 뽑는다 — 엔진 답은 저장하지 않는다(블라인드). 다만 **조합 자체가 성립하지 않는 로스터**(타워 입장 인원 부족 등)는 다시 뽑는다.
    do {
      const pool = [...ssr]; roster = [];
      while (roster.length < size) roster.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      tries += 1;
    } while (E.pickSiteTeam(roster, p.mode, { bossElement: p.boss || null, tower: p.tower || null }).path === 'error' && tries < 50);
    return { id: `B${String(i + 1).padStart(2, '0')}`, seed, mode: p.mode, boss: p.boss || null, tower: p.tower || null, roster: roster.map((c) => c.title).sort() };
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(casesPath(seed), out.map((c) => JSON.stringify(c)).join('\n') + '\n');
  console.log(`${out.length}건 → ${path.relative(ROOT, casesPath(seed))}`);
}

// --- 판정지(엔진 답 없음) ---
const TREASURE_IDS = new Set(j('treasureEffects.json').characters.map((t) => t.characterId));
const SLICE = { pvp: 'arena', bossing: 'soloraid', campaign: 'campaign', tribe_tower: 'campaign' };
const TIERKEY = { pvp: 'pvp', bossing: 'bossing', campaign: 'story', tribe_tower: 'story' };
if (has('sheet')) {
  const seed = Number(arg('seed', 11));
  const EL = { iron: 'Iron', wind: 'Wind', water: 'Water', electric: 'Electronic', fire: 'Fire' };
  const share = {};
  for (const s of j('soloRaidTeams.json').seasons) {
    const k = EL[s.weakness]; const m = (share[k] ||= new Map()); const n = s.teams.length;
    for (const t of s.teams) for (const x of new Set(t.members)) m.set(x, (m.get(x) || 0) + 100 / n);
  }
  const md = [`# 판정지 — 씨앗 ${seed} (엔진 답 없음 · 블라인드)`, '',
    '각 줄: 이름 · B버스트 · 클래스 · 속성 · 무기 · prydwen 티어(그 모드) · enikk 채용(그 모드) · [레이드: 그 약점 시즌 등록 팀 등장 %]', ''];
  for (const c of readCases(seed)) {
    const ctx = c.mode === 'bossing' ? `약점 ${c.boss}` : c.mode === 'tribe_tower' ? `타워 ${c.tower || '트라이브(전체)'}` : '';
    md.push(`## ${c.id} — ${c.mode}${ctx ? ' · ' + ctx : ''} · ${c.roster.length}명`, '');
    for (const t of c.roster) {
      const x = byT.get(t); const u = ms.usageTier?.[SLICE[c.mode]]?.[t];
      const sh = c.mode === 'bossing' ? ` · 속성시즌 ${Math.round(share[c.boss]?.get(t) || 0)}%` : '';
      // 2026-10-01: 애장품·오버스펙 표시. 애장품 캐릭터의 채용률은 **애장품 보유 기준**이라(헬름 아레나 S99.9 등) 로스터만 보고
      // 판정하면 과대평가하게 된다(유저 결정: 애장품은 없다고 본다). 오버스펙은 필그림 타워에 들어간다(네온:VE 판정 실수).
      const flags = [TREASURE_IDS.has(x.id) ? '⚠️애장품 캐릭터(채용률은 보유 기준일 수 있음)' : '', x.overspec ? '오버스펙(필그림 타워 가능)' : ''].filter(Boolean).join(' · ');
      md.push(`- ${x.name_kr} (${t}) · B${x.burstFlex ? (x.burstStages || []).join('/') : x.burst} · ${x.class} · ${x.element} · ${x.weapon} · 티어 ${x.tiers?.[TIERKEY[c.mode]] || '-'} · 채용 ${u ? `${u.tier} ${u.usage}%` : '-'}${sh}${c.tower ? ` · 제조사 ${x.manufacturer || '-'}` : ''}${flags ? ' · ' + flags : ''}`);
    }
    md.push('');
  }
  const p = path.join(PD, `bench-s${seed}-sheet.md`);
  fs.writeFileSync(p, md.join('\n'));
  console.log(`판정지 → ${path.relative(ROOT, p)}`);
}

// --- 채점 ---
if (has('score')) {
  const seeds = String(arg('seeds', '11')).split(',').map(Number);
  const vPath = path.join(PD, 'bench-verdicts.txt');
  const verdicts = new Map();
  if (fs.existsSync(vPath)) for (const ln of fs.readFileSync(vPath, 'utf8').split('\n')) {
    // 키(s11-B03:이름|이름…)에 공백이 들어 있다 — 처음 나오는 " = " · " - "에서 자른다(이름에는 그 표기가 없다)
    const m = ln.match(/^(.*?)\s([=-])\s(.*)$/); if (m) verdicts.set(m[1], { v: m[2], memo: m[3] });
  }
  const { E, tmp } = await loadEngine();
  let total = 0, exact = 0, equal = 0, bad = 0, unjudged = 0, nopick = 0;
  const lines = [];
  for (const seed of seeds) {
    const pp = path.join(PD, `bench-picks-s${seed}.txt`);
    const picks = new Map();
    if (fs.existsSync(pp)) for (const ln of fs.readFileSync(pp, 'utf8').split('\n')) {
      const m = ln.match(/^(B\d\d)\s+(.+?)(\s+#.*)?$/); if (m) picks.set(m[1], m[2].split(' / ').map((alt) => key5(alt.split('|').map((x) => x.trim()))));
    }
    for (const c of readCases(seed)) {
      total += 1;
      const roster = c.roster.map((t) => byT.get(t));
      const r = E.pickSiteTeam(roster, c.mode, { bossElement: c.boss || null, tower: c.tower || null });
      const eng = r.team?.members.map((m) => m.title) || [];
      const ek = key5(eng);
      const mine = picks.get(c.id);
      const vkey = `s${seed}-${c.id}:${ek}`;
      let st;
      if (!mine) { st = '판정 전'; nopick += 1; }
      else if (mine.includes(ek)) { st = '일치'; exact += 1; }
      else if (verdicts.get(vkey)?.v === '=') { st = '동급'; equal += 1; }
      else if (verdicts.get(vkey)?.v === '-') { st = '불일치'; bad += 1; }
      else { st = '판정 필요'; unjudged += 1; }
      lines.push({ seed, id: c.id, mode: c.mode, ctx: c.boss || c.tower || '', st, path: r.path, eng, mine: mine?.[0]?.split('|') || null, vkey, memo: verdicts.get(vkey)?.memo || '' });
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const judged = exact + equal + bad;
  console.log(`씨앗 ${seeds.join('·')} — ${total}건 · 일치 ${exact} · 동급 ${equal} · 불일치 ${bad} · 판정 필요 ${unjudged} · 내 조합 없음 ${nopick}`);
  console.log(`  일치율 ${(judged ? (exact + equal) / judged * 100 : 0).toFixed(1)}% (판정된 ${judged}건 기준)`);
  const nm = (t) => byT.get(t)?.name_kr || t;
  for (const l of lines.filter((x) => x.st === '판정 필요' || (has('verbose') && x.st === '불일치'))) {
    console.log(`\n  [${l.st}] ${l.vkey}  (${l.mode}${l.ctx ? ' ' + l.ctx : ''}, ${l.path})`);
    console.log(`    엔진: ${l.eng.map(nm).join(' · ')}`);
    console.log(`    나  : ${(l.mine || []).map(nm).join(' · ')}${l.memo ? `   # ${l.memo}` : ''}`);
  }
}
