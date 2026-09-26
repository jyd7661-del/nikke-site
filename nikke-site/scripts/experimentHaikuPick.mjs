#!/usr/bin/env node
/**
 * **하이쿠 = 엔진 후보 고르기 + 한 자리 교체** — 싼 모델로 AI 조합을 할 수 있는가 (2026-09-26, 유저 결정)
 *
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
if (!['compact', 'skills'].includes(VARIANT)) { console.error('--variant=compact|skills'); process.exit(1); }
const MODEL = 'claude-haiku-4-5';
const PRICE = { in: 1, out: 5 };   // $/1M — lib 쪽 costKrw와 같은 환율로 원 환산
const KRW = 1400;
const K = 5;
const SEEDS = [1, 2];
const LABEL = 'sonnet-tier';
const OUT = path.join(ROOT, 'probe-data', `haiku-pick-${VARIANT}.jsonl`);

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = j('characterDatabase.json');
const metaStats = j('metaStats.json');
const synergyNotes = j('synergyNotes.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const nm = (t) => byTitle.get(t)?.name_kr || t;
const setKey = (ts) => [...ts].sort().join('|');

async function loadEngine() {
  const LIB = path.join(ROOT, 'lib');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-hp-'));
  const fix = (src) => src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
  for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
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

const compactLine = (c, slice, mode) => JSON.stringify({
  title: c.title, burst: (Array.isArray(c.burstStages) && c.burstStages.length ? c.burstStages.join('/') : String(c.burst)),
  class: c.class, element: c.element, weapon: c.weapon, manufacturer: c.manufacturer, squad: c.squad || null,
  tier: mode === 'pvp' ? c.tiers?.pvp : mode === 'bossing' ? c.tiers?.bossing : c.tiers?.story,
  usage: usageOf(metaStats, slice, c.title),
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
    '',
    'ROSTER:',
    ...(VARIANT === 'skills'
      ? roster.map((c) => rosterLine(c, { variant: 'tier', metaStats, slice }))
      : roster.map((c) => compactLine(c, slice, sample.mode))),
    ...(synergy.length ? ['', 'KNOWN SYNERGIES IN THIS ROSTER (published guides / real clears):', ...synergy.map((s) => JSON.stringify({ name: s.name, members: s.members, note: s.note }))] : []),
  ].join('\n');
  const user = [
    `Mode: ${MODE_LABEL[sample.mode] || MODE_LABEL.campaign}.` + (sample.boss ? ` The boss is weak to ${sample.boss}: ${sample.boss}-element characters deal bonus damage to it.` : '') + (sample.mode === 'tribe_tower' ? TOWER_RULE(sample.tower) : ''),
    '',
    'CANDIDATES (engine order, 1 = engine\'s choice):',
    ...cands.map((c, i) => `${i + 1}. ${c.titles.join(', ')}\n   engine reasons: ${c.reasons.slice(0, 4).map((r) => String(r).replace(/\s+/g, ' ').slice(0, 220)).join(' | ') || '(none)'}`),
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
      model: MODEL, max_tokens: 1000, system,
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
      if (v.ok && trial.includes(out.swap_in) && !pick.titles.includes(out.swap_in)) { final = trial; swapApplied = true; } else swapFlaws = v.flaws.length ? v.flaws : ['swap names not in candidate/roster'];
    }
    const u = msg.usage || {};
    const cost = ((u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out) / 1e6 * KRW;
    krw += cost; n++;
    fs.appendFileSync(OUT, JSON.stringify({ key: c.key, mode: c.sample.mode, cands: cands.map((x) => x.titles), out, final, swapApplied, swapFlaws, stop: msg.stop_reason, usage: u, krw: +cost.toFixed(2), ms: Date.now() - t0 }) + '\n');
    process.stdout.write(`${c.key} 후보${out?.candidate ?? '?'}${swapApplied ? ` 교체 ${out.swap_out}→${out.swap_in}` : ''} ${cost.toFixed(1)}원\n`);
  }
  console.log(`${line}\n${n}건 · 합계 ${krw.toFixed(0)}원 · 건당 ${(krw / Math.max(n, 1)).toFixed(1)}원 → ${path.relative(ROOT, OUT)}`);
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
