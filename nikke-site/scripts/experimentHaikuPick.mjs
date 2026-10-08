#!/usr/bin/env node
/**
 * **하이쿠 = 엔진 후보 고르기 + 한 자리 교체** — 싼 모델로 AI 조합을 할 수 있는가 (2026-09-26, 유저 결정)
 *
 *   node scripts/experimentHaikuPick.mjs --ranker --live --model=claude-haiku-5-5   # 모델 바꿔 재시험(결과 파일에 모델 꼬리표)
 *   node scripts/experimentHaikuPick.mjs --dry                      # 프롬프트 1건과 토큰 추정만(돈 0)
 *   node scripts/experimentHaikuPick.mjs --live --variant=compact   # 40건 호출(하이쿠 4.5) → probe-data/haiku-pick-<variant>.jsonl
 *   node scripts/experimentHaikuPick.mjs --score --variant=compact  # 채점: 내 판정 정답지와 대조
 *
 * 유저: *"소넷말고 하이쿠로도 높은 정확성을 가질 수 있게끔 계속 엔진을 수정해나가는게 좋겠는데? 저정도 비용이면 광고로 커버가 안돼"*
 * (소넷 실호출 66.75원·25초, 2026-09-25)
 *
 * ■ 설계
 *   하이쿠에게 자유 구성을 맡기면 규칙을 놓친다(실험 2차: 버스트 불성립 2/12, 속성 무시 5/5). 그래서
 *   **후보는 엔진이 만든다**(사이트 경로 답 + 폴백 상위, 최대 5개 — 규칙은 엔진이 보장). 하이쿠는 그중 하나를 고르고
 *   필요하면 **로스터에서 한 자리만** 바꾼다. 교체 결과는 운영과 같은 검산기(lib/aiTeamVerify.js)로 보고, 어기면 교체 없이 고른 후보로.
 *   한 자리 교체를 여는 이유: probeCandidateRecall — 더 나은 답 11건 중 상위 20개 밖 6건이 전부 가장 가까운 후보와 4/5(1건 3/5).
 *
 * ■ 변형
 *   compact : 로스터 줄에 스킬 원문 없음(등급·채용률·무기·속성·제조사·스쿼드) + 알려진 시너지 + 후보의 엔진 근거(영문). 입력 약 2천 토큰
 *   skills  : compact + 로스터 스킬 원문(운영 소넷 프롬프트와 같은 rosterLine). 입력이 로스터 크기에 비례
 *
 * ■ 채점 — 정답지는 testJudgmentMatch와 같은 판정 파일(씨앗 1·2)
 *   최종 답이 엔진 1위와 같다      → 그 건의 판정을 그대로(엔진이 이긴 건이면 맞음, AI가 이긴 건이면 틀림)
 *   최종 답이 판정한 AI 답과 같다  → 판정을 그대로(AI가 이긴 건이면 맞음)
 *   둘 다 아니다(새 답)            → probe-data/haiku-pick-<variant>-new.md 에 모아 **따로 판정**한다(판정자 클로드, 유저 위임)
 *   판정이 "비슷/둘 다 나쁨"이거나 두 답이 같았던 건은 참고로만.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { rosterLine, usageOf, MODE_SLICE, MODE_LABEL, TOWER_RULE, selectSynergyForRoster } from '../lib/aiTeamPrompt.js';
import { verifyAiTeam } from '../lib/aiTeamVerify.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch { /* 환경변수로도 받는다 */ }
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);
const VARIANT = arg('variant', 'compact');
if (!['compact', 'skills', 'v2'].includes(VARIANT)) { console.error('--variant=compact|skills|v2'); process.exit(1); }
// --model(2026-10-08): 하이쿠 5.5(10-07 출시, 프롬프트 10만 토큰 이하 $0.10/$0.50 — 4.5의 1/10) 재시험용. 기본은 옛 결과와 같은 4.5.
//   하이쿠 5.5는 적응형 생각이 기본으로 켜져(effort medium) 출력 토큰에 생각이 들어간다 → 상한 8000(소넷 셰도우 사고의 교훈: 1500이 생각에 다 쓰여 답 없이 끝남).
const MODEL = arg('model', 'claude-haiku-4-5');
const PRICE = { 'claude-haiku-4-5': { in: 1, out: 5 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5 } }[MODEL];   // $/1M — lib 쪽 costKrw와 같은 환율로 원 환산
if (!PRICE) { console.error(`--model=${MODEL}: 단가 표에 없음`); process.exit(1); }
const MAX_TOKENS = MODEL === 'claude-haiku-4-5' ? 1000 : 8000;
const MSUF = MODEL === 'claude-haiku-4-5' ? '' : `-${MODEL.replace('claude-', '')}`;
const KRW = 1400;
const K = 5;
const SEEDS = [1, 2];
const LABEL = 'sonnet-tier';
const OUT = path.join(ROOT, 'probe-data', `haiku-pick-${VARIANT}${MSUF}.jsonl`);

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = j('characterDatabase.json');
const metaStats = j('metaStats.json');
const synergyNotes = j('synergyNotes.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));
// v2: 보스 약점 속성 시즌의 등록 상위 25팀 중 등장 비율(%) — soloRaidTeams(A등급)를 세기만 한다. 엔진은 이 신호를 순위에 못 쓴다(새 가중치가 필요) → 모델에게 근거로 준다
const EL_KEY = { iron: 'Iron', wind: 'Wind', water: 'Water', electric: 'Electronic', fire: 'Fire' };
const ELEMENT_SHARE = new Map();
for (const s of j('soloRaidTeams.json').seasons || []) {
  const k = EL_KEY[String(s.weakness || '').toLowerCase()]; if (!k) continue;
  const m = ELEMENT_SHARE.get(k) || new Map(); const n = (s.teams || []).length || 1;
  for (const t of s.teams || []) for (const x of new Set(t.members)) m.set(x, Math.round((m.get(x) || 0) + 100 / n));
  ELEMENT_SHARE.set(k, m);
}
const burstSummary = (titles) => { const c = { 1: 0, 2: 0, 3: 0 }; for (const t of titles) { const ch = byTitle.get(t); const st = Array.isArray(ch?.burstStages) && ch.burstStages.length ? ch.burstStages.join('/') : String(ch?.burst); if (c[st] !== undefined) c[st]++; else c[st] = (c[st] || 0) + 1; } return Object.entries(c).filter(([, v]) => v).map(([k, v]) => `B${k}x${v}`).join(' '); };
const nm = (t) => byTitle.get(t)?.name_kr || t;
const setKey = (ts) => [...ts].sort().join('|');

async function loadEngine() {
  const LIB = path.join(ROOT, 'lib');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-hp-'));
  const fix = (src) => src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
  for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets', 'pvpBurst']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
  const mod = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
  fs.rmSync(tmp, { recursive: true, force: true });
  return mod;
}
const E = await loadEngine();

// 사이트와 같은 경로의 1위 + 폴백 상위로 후보 K개(중복 제거). 사이트 1위가 항상 1번이다.
function candidatesFor(roster, mode, o) {
  const out = [];
  const push = (t) => { if (t && !out.some((x) => setKey(x.titles) === setKey(t.members.map((m) => m.title)))) out.push({ titles: t.members.map((m) => m.title), reasons: t.reasons || [], score: t.totalScore }); };
  const oEn = { ...o, lang: 'en' };
  let real = null, exact = null;
  try { real = E.findRealUsageTeamMatch(roster, mode, oEn); } catch { /* 무시 */ }
  try { exact = E.findExactTeamMatch(roster, mode, oEn); } catch { /* 무시 */ }
  if (real || exact) push(real && (real.totalScore ?? -1) >= (exact?.totalScore ?? -1) ? real : exact);
  const r = E.recommendTeams(roster, mode, { ...oEn, topN: K + 3 });
  for (const t of r.teams || []) { if (out.length >= K) break; push(t); }
  return out;
}

const compactLine = (c, slice, mode, boss) => JSON.stringify({
  title: c.title, burst: (Array.isArray(c.burstStages) && c.burstStages.length ? c.burstStages.join('/') : String(c.burst)),
  class: c.class, element: c.element, weapon: c.weapon, manufacturer: c.manufacturer, squad: c.squad || null,
  tier: mode === 'pvp' ? c.tiers?.pvp : mode === 'bossing' ? c.tiers?.bossing : c.tiers?.story,
  usage: usageOf(metaStats, slice, c.title),
  ...(VARIANT === 'v2' && mode === 'bossing' && boss ? { bossSeasonTopTeamShare: ELEMENT_SHARE.get(boss)?.get(c.title) ?? 0 } : {}),
});

function buildPrompt(sample, cands) {
  const roster = sample.roster.map((t) => byTitle.get(t)).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
  const slice = MODE_SLICE[sample.mode] || 'campaign';
  const synergy = selectSynergyForRoster(synergyNotes, roster.map((c) => c.title), sample.mode, 15);
  const system = [
    'You refine team recommendations for the mobile game GODDESS OF VICTORY: NIKKE.',
    'A rule-based engine already built candidate teams that satisfy the hard rules (Burst I, II and III covered). Your job: pick the best candidate for the mode, and optionally replace at most ONE member with another roster character when that clearly improves the team.',
    'Rules for a replacement: the team must still cover Burst I, II and III; use exact roster titles; replace only if you can name the concrete reason (a buff that reaches no one, a missing buffer/healer, a clearly stronger same-stage unit by usage/tier, a known synergy pair). Otherwise leave swap fields empty.',
    '- "tier" is the prydwen rating for this mode (SSS > SS > S > A > B > C > D). "usage" is real adoption among top players from enikk.app for this mode (tier S > A > B > C, pct = share of tracked top teams); null = rarely used. Usage is strong evidence of real strength.',
    '- Engine reasons are rule outputs; they can miss things (e.g. conditional buffs whose target is absent, PvP speed).',
    ...(VARIANT === 'v2' ? [
      '- "bursts" line per candidate gives the exact burst-stage counts — trust it instead of recounting. In PvE a team needs at least 2 Burst III users (a single Burst III is almost never used by top players); a swap that leaves only one Burst III will be rejected.',
      '- For boss fights, "bossSeasonTopTeamShare" = % of the 25 top recorded teams against a boss with this same weakness that included the character (any element). It is direct evidence for THIS boss; prefer it over general tier when they disagree.',
    ] : []),
    '',
    'ROSTER:',
    ...(VARIANT === 'skills'
      ? roster.map((c) => rosterLine(c, { variant: 'tier', metaStats, slice }))
      : roster.map((c) => compactLine(c, slice, sample.mode, sample.boss))),
    ...(synergy.length ? ['', 'KNOWN SYNERGIES IN THIS ROSTER (published guides / real clears):', ...synergy.map((s) => JSON.stringify({ name: s.name, members: s.members, note: s.note }))] : []),
  ].join('\n');
  const user = [
    `Mode: ${MODE_LABEL[sample.mode] || MODE_LABEL.campaign}.` + (sample.boss ? ` The boss is weak to ${sample.boss}: ${sample.boss}-element characters deal bonus damage to it.` : '') + (sample.mode === 'tribe_tower' ? TOWER_RULE(sample.tower) : ''),
    '',
    'CANDIDATES (engine order, 1 = engine\'s choice):',
    ...cands.map((c, i) => `${i + 1}. ${c.titles.join(', ')}` + (VARIANT === 'v2' ? `\n   bursts: ${burstSummary(c.titles)}` : '') + `\n   engine reasons: ${c.reasons.slice(0, 4).map((r) => String(r).replace(/\s+/g, ' ').slice(0, 220)).join(' | ') || '(none)'}`),
    '',
    'Return the candidate number, an optional single swap (swap_out = a member of that candidate, swap_in = a roster character not in it; both empty strings for no swap), and a 1-2 sentence reasoning.',
  ].join('\n');
  return { system, user };
}

const SCHEMA = {
  type: 'object',
  properties: {
    candidate: { type: 'integer' },
    swap_out: { type: 'string' },
    swap_in: { type: 'string' },
    reasoning: { type: 'string' },
  },
  required: ['candidate', 'swap_out', 'swap_in', 'reasoning'],
  additionalProperties: false,
};

// --- 표본 + 판정 ---
const cases = [];
for (const seed of SEEDS) {
  const rosters = new Map(fs.readFileSync(path.join(ROOT, 'probe-data', `thin-cases-s${seed}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).map((c) => [c.id, c]));
  const key = JSON.parse(fs.readFileSync(path.join(ROOT, 'probe-data', `thin-key-${LABEL}-s${seed}.json`), 'utf8'));
  const judged = new Map();
  for (const ln of fs.readFileSync(path.join(ROOT, 'probe-data', `thin-judgments-${LABEL}-s${seed}.txt`), 'utf8').split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)) {
    const m = ln.match(/^(T\d\d)\s*[:\-]?\s*([ABab=xX])/);
    if (m) judged.set(m[1], m[2].toUpperCase());
  }
  for (const k of key) {
    const v = judged.get(k.id) || null;
    const winner = k.identical ? 'same' : (!v || ['=', 'X'].includes(v)) ? 'none' : ((v === 'A') === k.engineIsA ? 'engine' : 'ai');
    cases.push({ key: `s${seed}-${k.id}`, sample: rosters.get(k.id), engine: k.engine, ai: k.ai, winner });
  }
}

const line = '─'.repeat(84);

// ── 랭커 복원 모드(2026-10-04) — 정답지를 내 판정이 아니라 **랭커 조합**으로(scripts/benchRankerRecall.mjs와 같은 로스터·씨앗) ──
//   node scripts/experimentHaikuPick.mjs --ranker --dry | --ranker --live | --ranker --score   (변형은 compact만 — v2의 시즌 등장 비율엔 정답 팀이 섞인다)
//   로스터 = 등록 5명 + 무작위 SSR 15명, 애장품 전원 보유. 1번 후보 = 사이트 답(pickSiteTeam, 자기 팀은 실사용 표에서 뺌), 나머지는 폴백 상위.
//   지표: 하이쿠 최종 답과 정답의 겹침 vs 엔진 1번 후보와 정답의 겹침(완전 복원·4명+·평균).
if (has('ranker')) {
  if (VARIANT !== 'compact') { console.error('--ranker는 --variant=compact만'); process.exit(1); }
  const ROUT = path.join(ROOT, 'probe-data', `haiku-ranker-compact${MSUF}.jsonl`);
  const ssr = cdb.filter((c) => String(c.rarity).toUpperCase() === 'SSR');
  const TREASURE = new Set(j('treasureEffects.json').characters.map((t) => t.characterId));
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rc = [];
  (metaStats.campaignCompositions?.list || []).forEach((t, i) => rc.push({ key: `camp-${i}`, mode: 'campaign', members: t.members, ctx: {} }));
  j('towerCompositions.json').pools.forEach((p) => (p.teams || []).forEach((t, i) => rc.push({ key: `tower-${p.tower || p.pool}-${i}`, mode: 'tribe_tower', members: t.members, ctx: { tower: p.tower || null } })));
  j('soloRaidTeams.json').seasons.filter((x) => !x.archive).forEach((x) => (x.teams || []).forEach((t, i) => rc.push({ key: `raid-${x.raid}-${i}`, mode: 'bossing', members: t.members, ctx: { bossElement: EL_KEY[String(x.weakness || '').toLowerCase()] } })));
  (metaStats.pvp?.topTeams || []).forEach((t, i) => rc.push({ key: `pvp-${i}`, mode: 'pvp', members: t.members, ctx: {} }));
  const rnd = mulberry32(20261001);
  const samples = [];
  for (const c of rc) {
    const team = c.members.map((n) => byTitle.get(n)); if (team.length !== 5 || team.some((x) => !x)) continue;
    const pool = ssr.filter((x) => !c.members.includes(x.title)); const roster = [...team];
    while (roster.length < 20 && pool.length) roster.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const treasureIds = new Set(roster.filter((x) => TREASURE.has(x.id)).map((x) => x.id));
    const o = { ...c.ctx, treasureIds, excludeRealSig: setKey(c.members) };
    samples.push({ ...c, roster, o, sample: { roster: roster.map((x) => x.title), mode: c.mode, boss: c.ctx.bossElement || null, tower: c.ctx.tower || null } });
  }
  const candsOf = (sm) => {
    const site = E.pickSiteTeam(sm.roster, sm.mode, { ...sm.o, lang: 'en' }).team;
    const out = [];
    const push = (t) => { if (t && !out.some((x) => setKey(x.titles) === setKey(t.members.map((m) => m.title)))) out.push({ titles: t.members.map((m) => m.title), reasons: t.reasons || [], score: t.totalScore }); };
    push(site);
    for (const t of E.recommendTeams(sm.roster, sm.mode, { ...sm.o, lang: 'en', topN: K + 3 }).teams || []) { if (out.length >= K) break; push(t); }
    return out;
  };
  const ov = (a, b) => a.filter((t) => b.includes(t)).length;
  if (has('dry') || has('live')) {
    const client = has('live') ? new Anthropic() : null;
    if (has('live') && !process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY 없음(.env.local)'); process.exit(1); }
    const done = new Set(fs.existsSync(ROUT) ? fs.readFileSync(ROUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
    let krw = 0, n = 0;
    for (const sm of samples) {
      if (done.has(sm.key)) continue;
      const cands = candsOf(sm);
      const { system, user } = buildPrompt(sm.sample, cands);
      if (has('dry')) { console.log(system + '\n\n=== USER ===\n' + user); console.log(`\n추정 입력 ≈ ${Math.round((system.length + user.length) / 3.2)} 토큰 · 표본 ${samples.length}건`); process.exit(0); }
      const t0 = Date.now();
      const msg = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, system, messages: [{ role: 'user', content: user }], output_config: { format: { type: 'json_schema', schema: SCHEMA } } });
      const text = msg.content.find((b) => b.type === 'text')?.text || '';
      let out = null; try { out = JSON.parse(text); } catch { /* 아래 */ }
      const pick = cands[(out?.candidate || 1) - 1] || cands[0];
      let final = pick.titles, swapApplied = false, swapFlaws = [];
      if (out && out.swap_out && out.swap_in) {
        const trial = pick.titles.map((t) => (t === out.swap_out ? out.swap_in : t));
        const v = verifyAiTeam(trial, sm.roster, { tower: sm.sample.tower || null });
        if (v.ok && trial.includes(out.swap_in) && !pick.titles.includes(out.swap_in)) { final = trial; swapApplied = true; } else swapFlaws = v.flaws.length ? v.flaws : ['swap names not in candidate/roster'];
      }
      const u = msg.usage || {};
      const cost = ((u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out) / 1e6 * KRW;
      krw += cost; n++;
      fs.appendFileSync(ROUT, JSON.stringify({ key: sm.key, mode: sm.mode, want: sm.members, cands: cands.map((x) => x.titles), out, final, swapApplied, swapFlaws, usage: u, krw: +cost.toFixed(2), ms: Date.now() - t0 }) + '\n');
      if (n % 20 === 0) process.stdout.write(`${n}건 · ${krw.toFixed(0)}원\n`);
    }
    console.log(`${n}건 · 합계 ${krw.toFixed(0)}원 · 건당 ${(krw / Math.max(n, 1)).toFixed(1)}원 → ${path.relative(ROOT, ROUT)}`);
  }
  if (has('score')) {
    const rows = fs.readFileSync(ROUT, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const agg = {};
    let krw = 0, ms = 0, changed = 0, better = 0, worse = 0;
    for (const r of rows) {
      krw += r.krw; ms += r.ms;
      const e = ov(r.cands[0], r.want), h = ov(r.final, r.want);
      if (setKey(r.final) !== setKey(r.cands[0])) { changed++; if (h > e) better++; else if (h < e) worse++; }
      for (const [k, v] of [['엔진', e], ['하이쿠', h]]) { const a = ((agg[r.mode] ||= {})[k] ||= { n: 0, ex: 0, f4: 0, ov: 0 }); a.n++; a.ov += v; if (v === 5) a.ex++; if (v >= 4) a.f4++; }
    }
    console.log(line);
    console.log(`하이쿠 고르기(랭커 복원) — ${rows.length}건 · 건당 ${(krw / rows.length).toFixed(1)}원 · 평균 ${(ms / rows.length / 1000).toFixed(1)}초 · 답을 바꾼 ${changed}건: 정답에 가까워짐 ${better} · 멀어짐 ${worse}`);
    for (const [m, x] of Object.entries(agg)) for (const k of ['엔진', '하이쿠']) { const a = x[k]; console.log(`  ${m.padEnd(12)} ${k.padEnd(4)} 완전 ${(a.ex / a.n * 100).toFixed(1)}% · 4명+ ${(a.f4 / a.n * 100).toFixed(1)}% · 겹침 ${(a.ov / a.n).toFixed(2)} (${a.n})`); }
    console.log(line);
  }
  process.exit(0);
}

if (has('dry') || has('live')) {
  const client = has('live') ? new Anthropic() : null;
  if (has('live') && !process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY 없음(.env.local)'); process.exit(1); }
  const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  let krw = 0, n = 0;
  for (const c of cases) {
    if (done.has(c.key)) continue;
    const roster = c.sample.roster.map((t) => byTitle.get(t)).filter(Boolean);
    const cands = candidatesFor(roster, c.sample.mode, { bossElement: c.sample.boss || null, tower: c.sample.tower || null });
    const { system, user } = buildPrompt(c.sample, cands);
    if (has('dry')) {
      console.log(system + '\n\n=== USER ===\n' + user);
      console.log(`\n${line}\n추정 입력 ≈ ${Math.round((system.length + user.length) / 3.2)} 토큰(문자/3.2) · 후보 ${cands.length}개`);
      process.exit(0);
    }
    const t0 = Date.now();
    const msg = await client.messages.create({
      model: MODEL, max_tokens: MAX_TOKENS, system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });
    const text = msg.content.find((b) => b.type === 'text')?.text || '';
    let out = null; try { out = JSON.parse(text); } catch { /* 아래 */ }
    const pick = cands[(out?.candidate || 1) - 1] || cands[0];
    let final = pick.titles, swapApplied = false, swapFlaws = [];
    if (out && out.swap_out && out.swap_in) {
      const trial = pick.titles.map((t) => (t === out.swap_out ? out.swap_in : t));
      const v = verifyAiTeam(trial, roster, { tower: c.sample.tower || null });
      // v2: 엔진이 이미 막는 구성(PvE 버스트 3 단독)을 교체로 되살리지 못하게 한다(1차에서 하이쿠가 실제로 만들었다)
      const soloB3 = VARIANT === 'v2' && c.sample.mode !== 'pvp' && v.ok && !!E.scoreTeam(trial.map((t) => byTitle.get(t)), c.sample.mode, { bossElement: c.sample.boss || null }).soloBurst3;
      if (v.ok && !soloB3 && trial.includes(out.swap_in) && !pick.titles.includes(out.swap_in)) { final = trial; swapApplied = true; } else swapFlaws = soloB3 ? ['solo Burst III in PvE'] : (v.flaws.length ? v.flaws : ['swap names not in candidate/roster']);
    }
    const u = msg.usage || {};
    const cost = ((u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out) / 1e6 * KRW;
    krw += cost; n++;
    fs.appendFileSync(OUT, JSON.stringify({ key: c.key, mode: c.sample.mode, cands: cands.map((x) => x.titles), out, final, swapApplied, swapFlaws, stop: msg.stop_reason, usage: u, krw: +cost.toFixed(2), ms: Date.now() - t0 }) + '\n');
    process.stdout.write(`${c.key} 후보${out?.candidate ?? '?'}${swapApplied ? ` 교체 ${out.swap_out}→${out.swap_in}` : ''} ${cost.toFixed(1)}원\n`);
  }
  console.log(`${line}\n${n}건 · 합계 ${krw.toFixed(0)}원 · 건당 ${(krw / Math.max(n, 1)).toFixed(1)}원 → ${path.relative(ROOT, OUT)}`);
}

if (has('score2')) {
  // 지금 엔진(사이트 1위 = cands[0])과 비교한다. 하이쿠가 답을 바꾼 건만 판정 대상(판정 파일: haiku-pick-<variant>-judg2.txt, "s1-T01 H|E|=")
  const rows = fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const jp = path.join(ROOT, 'probe-data', `haiku-pick-${VARIANT}-judg2.txt`);
  const J = new Map(fs.existsSync(jp) ? fs.readFileSync(jp, 'utf8').split(/\r?\n/).map((l) => l.match(/^(s\d-T\d\d)\s+([HE=])/)).filter(Boolean).map((m) => [m[1], m[2]]) : []);
  const byKey = new Map(cases.map((c) => [c.key, c]));
  let kept = 0, H = 0, Ev = 0, same = 0, pend = 0, krw = 0, ms = 0, rej = 0; const md = [];
  for (const r of rows) {
    krw += r.krw; ms += r.ms; if (r.swapFlaws?.length) rej++;
    if (setKey(r.final) === setKey(r.cands[0])) { kept++; continue; }
    const v = J.get(r.key); if (v === 'H') H++; else if (v === 'E') Ev++; else if (v === '=') same++; else pend++;
    const c = byKey.get(r.key);
    md.push(`## ${r.key} [${c.sample.mode}${c.sample.boss ? ' ' + c.sample.boss : ''}${c.sample.tower ? ' ' + c.sample.tower : ''}] ${v ? '판정 ' + v : '⏳'}\n- 엔진 1위: ${r.cands[0].map(nm).join(', ')}\n- 하이쿠: ${r.final.map(nm).join(', ')}${r.swapApplied ? ` (후보${r.out.candidate} + ${nm(r.out.swap_out)}→${nm(r.out.swap_in)})` : ` (후보${r.out?.candidate})`}\n- 이유: ${r.out?.reasoning || ''}\n`);
  }
  fs.writeFileSync(path.join(ROOT, 'probe-data', `haiku-pick-${VARIANT}-diff.md`), md.join('\n'));
  console.log(line);
  console.log(`하이쿠 ${VARIANT} vs 지금 엔진 — ${rows.length}건 · 건당 ${(krw / rows.length).toFixed(1)}원 · 평균 ${(ms / rows.length / 1000).toFixed(1)}초 · 교체 거부 ${rej}`);
  console.log(`  엔진 1위 그대로 ${kept} · 바꿈 ${rows.length - kept} → 나아짐 ${H} · 나빠짐 ${Ev} · 같음 ${same}${pend ? ` · 판정 대기 ${pend}` : ''}`);
  console.log(`  목록 → probe-data/haiku-pick-${VARIANT}-diff.md`);
  console.log(line);
}

if (has('score')) {
  const rows = fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const newJudgePath = path.join(ROOT, 'probe-data', `haiku-pick-${VARIANT}-newjudg.txt`);
  const newJudg = new Map(fs.existsSync(newJudgePath) ? fs.readFileSync(newJudgePath, 'utf8').split(/\r?\n/).map((l) => l.match(/^(s\d-T\d\d)\s+([HE=])/)).filter(Boolean).map((m) => [m[1], m[2]]) : []);
  let right = 0, wrong = 0, pending = 0, ref = 0; const news = []; const tally = { engineKept: 0, toAi: 0, fresh: 0 };
  let krw = 0, ms = 0, inTok = 0;
  for (const c of cases) {
    const r = byKey.get(c.key); if (!r) continue;
    krw += r.krw; ms += r.ms; inTok += r.usage?.input_tokens || 0;
    const f = setKey(r.final);
    const isEngine = f === setKey(c.engine), isAi = c.ai && f === setKey(c.ai);
    if (isEngine) tally.engineKept++; else if (isAi) tally.toAi++; else tally.fresh++;
    if (c.winner === 'same' || c.winner === 'none') { ref++; if (!isEngine && !isAi) news.push({ c, r, refOnly: true }); continue; }
    if (isEngine || isAi) { ((isEngine && c.winner === 'engine') || (isAi && c.winner === 'ai')) ? right++ : wrong++; continue; }
    const nj = newJudg.get(c.key);   // H = 하이쿠 새 답이 더 낫다, E = 엔진 1위가 낫다, = 비슷
    if (nj === 'H') right++; else if (nj === 'E') wrong++; else if (nj === '=') ref++; else { pending++; news.push({ c, r }); }
  }
  const n = rows.length;
  console.log(line);
  console.log(`하이쿠 고르기+한 자리 교체 — 변형 ${VARIANT} · ${n}건 · 건당 ${(krw / n).toFixed(1)}원 · 평균 입력 ${Math.round(inTok / n)}토큰 · 평균 ${(ms / n / 1000).toFixed(1)}초`);
  console.log(line);
  console.log(`  판정 가능 ${right + wrong}건 중 내 판정과 일치 ${right} = ${((right / Math.max(right + wrong, 1)) * 100).toFixed(1)}%   (엔진 단독 기준선: 같은 건들에서 엔진 쪽 승 비율)`);
  const judgedCases = cases.filter((c) => c.winner === 'engine' || c.winner === 'ai');
  console.log(`  참고 — 엔진 단독: ${judgedCases.filter((c) => c.winner === 'engine').length}/${judgedCases.length} · 소넷 자유 구성: ${judgedCases.filter((c) => c.winner === 'ai').length}/${judgedCases.length}`);
  console.log(`  답의 출처: 엔진 1위 유지 ${tally.engineKept} · 소넷 답과 같아짐 ${tally.toAi} · 새 답 ${tally.fresh}`);
  if (pending) console.log(`  ⏳ 새 답 판정 대기 ${pending}건 → ${path.relative(ROOT, newJudgePath)} 에 "s1-T01 H|E|=" 로 적는다`);
  if (news.length) {
    const md = news.map(({ c, r, refOnly }) => `## ${c.key} [${c.sample.mode}${c.sample.boss ? ' ' + c.sample.boss : ''}${c.sample.tower ? ' ' + c.sample.tower : ''}]${refOnly ? ' (참고 — 원 판정이 동일/비슷)' : ''}\n- 로스터: ${c.sample.roster.map(nm).join(', ')}\n- 엔진 1위: ${c.engine.map(nm).join(', ')}\n- 하이쿠: ${r.final.map(nm).join(', ')}${r.swapApplied ? ` (후보${r.out.candidate} + ${nm(r.out.swap_out)}→${nm(r.out.swap_in)})` : ` (후보${r.out?.candidate})`}\n- 하이쿠 이유: ${r.out?.reasoning || ''}\n`).join('\n');
    fs.writeFileSync(path.join(ROOT, 'probe-data', `haiku-pick-${VARIANT}-new.md`), md);
    console.log(`  새 답 목록 → probe-data/haiku-pick-${VARIANT}-new.md`);
  }
  console.log(line);
}
