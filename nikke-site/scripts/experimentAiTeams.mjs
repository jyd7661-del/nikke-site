#!/usr/bin/env node
/**
 * **AI가 조합을 짜면 실제 랭커 조합에 얼마나 가까운가** — 클로드 플랫폼 검토 순서표 2단계. (2026-09-14)
 *
 *   node scripts/experimentAiTeams.mjs                       # 비용 추정만 (API 호출 없음)
 *   node scripts/experimentAiTeams.mjs --live --model=sonnet --limit=10   # 시험 삼아 10건만 직접 호출
 *   node scripts/experimentAiTeams.mjs --batch --model=opus               # 214건 배치 제출(50% 할인)
 *   node scripts/experimentAiTeams.mjs --resume=<batch_id> --model=opus   # 배치 결과 회수·채점
 *
 * 유저 방향(2026-09-04): "조합은 고도화된 AI가 추천을 해주는 방식이 맞아." 그 전환의 근거를
 * 숫자로 만드는 실험이다. 판단 기준은 규모(2026-09-14): 지금 하루 2건이 아니라 **하루 수백~천 건일 때**
 * 어느 모델·어느 캐시 구조가 맞는지를 본다. 그래서 세 모델을 같은 잣대로 돌린다.
 *
 * ■ 설계
 *   입력  : 등록 조합 214건 각각에 대해, 그 출처(솔로레이드/타워/캠페인/PvP)의 **메타 풀**(그 출처의
 *           등록 조합에 한 번이라도 나온 캐릭터 전원)을 로스터로 준다. testRankerTeams의 ② 대조와 같다 —
 *           약한 캐릭터를 섞어 주면 "센 애를 고르는 능력"만 재게 된다.
 *   프롬프트: 시스템 = 규칙 + 그 풀의 캐릭터 원문(클래스·버스트·속성·무기·스킬 3개 원문). 출처마다
 *           **바이트 단위로 동일**하게 만들어 프롬프트 캐시가 걸리게 한다(1h TTL). 사용자 = 모드·보스 약점.
 *   출력  : 구조화 출력(json_schema)으로 5명 title + 이유. 자유 문장 파싱을 하지 않는다.
 *   채점  : ① 등록 조합과 완전 일치 ② 겹치는 인원(0~5) ③ 버스트 1·2·3 성립 ④ 시뮬레이터 점수 비 (AI ÷ 등록)
 *           ⑤ 메타 풀 안 무작위 조합 대비 백분위(testRankerTeams와 같은 방식, 표본 200)
 *   기록  : probe-data/ai-teams-<model>.jsonl (gitignore). 결론만 docs/open-items.md에 적는다.
 *
 * ⚠️ 이 실험은 "AI가 메타를 아는가"를 잰다. 유저의 진짜 목표(얇은 로스터에서 잘 짜는가)는 외부 정답지가
 *    없어 별도 표본(유저 판정)이 필요하다 — docs/open-items.md 2026-09-05.
 * ⚠️ 돈이 나가는 명령(--live/--batch)은 먼저 --limit으로 소량을 돌려 출력 형식·채점이 맞는지 본 뒤에 전량을 돌린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Anthropic from 'anthropic-sdk-next';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch { /* 키는 환경변수로도 받는다 */ }

const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);
const MODEL_KEY = arg('model', 'sonnet');
const LIMIT = Number(arg('limit', 0)) || 0;
const MODE = has('live') ? 'live' : has('batch') ? 'batch' : arg('resume', null) ? 'resume' : 'dry';

// 단가(USD / 1M 토큰, 2026-06 요금표) · 캐시 읽기 0.1배 · 1h 캐시 쓰기 2배 · 배치 0.5배
const MODELS = {
  opus:   { id: 'claude-opus-5',    in: 5, out: 25, thinking: true },
  sonnet: { id: 'claude-sonnet-5',  in: 2, out: 10, thinking: true },
  haiku:  { id: 'claude-haiku-4-5', in: 1, out: 5,  thinking: false },
};
const KRW = 1400;
const M = MODELS[MODEL_KEY];
if (!M) { console.error('--model=opus|sonnet|haiku'); process.exit(1); }

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = j('characterDatabase.json').filter((c) => (c.skills || []).length);
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const { scoreComposition } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'simulateTeams.mjs')).href);

// --- 등록 조합 (testRankerTeams와 같은 출처) ---
const teams = [];
const WEAK = { iron: 'Iron', wind: 'Wind', water: 'Water', electric: 'Electronic', fire: 'Fire' };
j('soloRaidTeams.json').seasons.forEach((s) => (s.teams || []).forEach((t) =>
  teams.push({ src: '솔로레이드', mode: 'bossing', boss: WEAK[String(s.weakness).toLowerCase()] || null, bossName: s.boss, m: t.members })));
j('towerCompositions.json').pools.forEach((p) => (p.teams || []).forEach((t) =>
  teams.push({ src: '타워', mode: 'tribe_tower', tower: p.tower || null, m: t.members })));
const ms = j('metaStats.json');
(ms.campaignCompositions?.list || []).forEach((t) => teams.push({ src: '캠페인', mode: 'campaign', m: t.members }));
(ms.pvp?.topTeams || []).forEach((t) => teams.push({ src: 'PvP', mode: 'pvp', m: t.members }));
teams.forEach((t, i) => { t.id = `${t.src}-${String(i).padStart(3, '0')}`; });

const pool = {};
for (const t of teams) for (const n of t.m) if (byTitle.has(n)) (pool[t.src] = pool[t.src] || new Set()).add(n);

// --- 프롬프트: 출처마다 바이트 단위로 동일해야 캐시가 걸린다(정렬 고정, 날짜·ID 금지) ---
const rosterBlock = (src) => [...pool[src]].sort().map((n) => {
  const c = byTitle.get(n);
  return JSON.stringify({
    title: c.title, class: c.class, burst: c.burst, element: c.element, weapon: c.weapon, squad: c.squad || null,
    skills: c.skills.map((s) => ({ name: s.name, type: s.type, cd: s.cd, desc: s.desc })),
  });
}).join('\n');
const MODE_LABEL = { bossing: 'Solo Raid boss fight (single boss, 3-minute sustained damage race)', tribe_tower: 'Tribe Tower (manufacturer-restricted stage clear)', campaign: 'Campaign stage clear (multiple enemies)', pvp: 'Champion Arena PvP (5v5, first to wipe the other side)' };
const systemFor = (src) => [
  'You are an expert team builder for the mobile game GODDESS OF VICTORY: NIKKE.',
  'You will be given a roster (JSON, one character per line) and a content mode. Pick exactly 5 distinct characters from the roster that form the strongest team for that mode.',
  'Hard rules of the game:',
  '- A team needs Burst I, Burst II and Burst III stages covered by different members so Full Burst can trigger (some characters list burstStages that cover several stages).',
  '- Skills quoted are level-10 values. "Affects all allies" buffs reach every member; buffs that name a weapon/element/squad reach only matching members.',
  '- Do not invent characters; use the exact title strings from the roster.',
  'Return only the structured output.',
  '',
  'ROSTER:',
  rosterBlock(src),
].join('\n');
const userFor = (t) => `Mode: ${MODE_LABEL[t.mode]}.` + (t.boss ? ` Boss weakness element: ${t.boss}.` : '') + (t.tower ? ` Tower: ${t.tower} (only that manufacturer may enter).` : '') + ' Choose the 5 members.';

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    members: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['members', 'reasoning'],
  additionalProperties: false,
};
const paramsFor = (t) => ({
  model: M.id,
  max_tokens: 2000,
  ...(M.thinking ? { output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } } }
                 : { output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } } }),
  system: [{ type: 'text', text: systemFor(t.src), cache_control: { type: 'ephemeral', ttl: '1h' } }],
  messages: [{ role: 'user', content: userFor(t) }],
});

// --- 채점 ---
const stagesOf = (c) => (Array.isArray(c.burstStages) && c.burstStages.length ? c.burstStages.map(String) : [String(c.burst)]);
function burstValid(team) {
  const used = Array(team.length).fill(false);
  const go = (i) => { if (i === 3) return true; for (let k = 0; k < team.length; k++) { if (used[k] || !stagesOf(team[k]).includes(String(i + 1))) continue; used[k] = true; if (go(i + 1)) return true; used[k] = false; } return false; };
  return go(0);
}
let seed = 0; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function percentile(team, src, score) {
  // 씨앗을 출처마다 고정 — 같은 팀의 AI 조합과 등록 조합이 **같은 무작위 표본**과 겨루어야 비교가 공정하다.
  // (처음엔 씨앗이 호출마다 이어져 같은 등록 조합의 백분위가 83 → 76.5로 흔들렸다)
  seed = 24681357 + [...src].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const p = cdb.filter((c) => pool[src].has(c.title)); let below = 0, n = 0, guard = 0;
  while (n < 200 && guard < 4000) { guard++; const q = [...p]; const pick = []; for (let i = 0; i < 5; i++) pick.push(...q.splice(Math.floor(rnd() * q.length), 1)); if (!burstValid(pick)) continue; n++; const v = scoreComposition(pick).total; if (v < score - 1e-9) below++; else if (Math.abs(v - score) <= 1e-9) below += 0.5; }
  return n ? below / n * 100 : null;
}
function grade(t, out) {
  const members = Array.isArray(out?.members) ? out.members : [];
  const resolved = members.map((n) => byTitle.get(n)).filter(Boolean);
  const unknown = members.filter((n) => !byTitle.has(n));
  const inPool = resolved.filter((c) => pool[t.src].has(c.title)).length;
  const real = t.m.map((n) => byTitle.get(n)).filter(Boolean);
  const overlap = resolved.filter((c) => t.m.includes(c.title)).length;
  const ok5 = resolved.length === 5 && new Set(resolved.map((c) => c.id)).size === 5;
  const aiScore = ok5 ? scoreComposition(resolved).total : null;
  const realScore = scoreComposition(real).total;
  return {
    exact: ok5 && overlap === 5, overlap, unknown, outOfPool: resolved.length - inPool, valid5: ok5,
    burstValid: ok5 ? burstValid(resolved) : false,
    simRatio: aiScore != null ? aiScore / realScore : null,
    aiPct: ok5 ? percentile(resolved, t.src, aiScore) : null,
    realPct: percentile(real, t.src, realScore),
  };
}

// --- 비용 ---
const est = (chars) => Math.round(chars / 3.6);
function costTable(rows, P = M) {
  // rows: [{src, n, sysTok, userTok}] — 출처별 시스템 프롬프트는 캐시 1회 쓰기 + (n-1)회 읽기
  // ⚠️ 모델 단가는 인자 P로 받는다. 처음엔 전역 M을 Object.assign으로 덮어썼는데 M이 MODELS[key]의
  //    **참조**라 표의 원본이 함께 바뀌어 opus·sonnet이 같은 값으로 나왔다.
  let usd = { nocache: 0, cache: 0 };
  const outTok = 400; // 구조화 출력 + 짧은 이유. 실측으로 갱신할 것
  for (const r of rows) {
    const inUncached = r.n * (r.sysTok + r.userTok);
    usd.nocache += inUncached * P.in / 1e6 + r.n * outTok * P.out / 1e6;
    usd.cache += (r.sysTok * 2 * P.in + (r.n - 1) * r.sysTok * 0.1 * P.in + r.n * r.userTok * P.in) / 1e6 + r.n * outTok * P.out / 1e6;
  }
  return { nocacheKRW: Math.round(usd.nocache * KRW), cacheKRW: Math.round(usd.cache * KRW), batchKRW: Math.round(usd.cache * KRW / 2) };
}

const target = LIMIT ? teams.slice(0, LIMIT) : teams;
const line = '─'.repeat(84);
console.log(line);
console.log(`AI 조합 실험 — 모델 ${M.id} · 방식 ${MODE} · 대상 ${target.length}/${teams.length}건`);
console.log(line);

if (MODE === 'dry') {
  const rows = Object.keys(pool).map((src) => ({ src, n: target.filter((t) => t.src === src).length, sysTok: est(systemFor(src).length), userTok: 60 }));
  rows.forEach((r) => console.log(`  ${r.src.padEnd(6)} ${String(r.n).padStart(3)}건 · 풀 ${pool[r.src].size}명 · 시스템 프롬프트 ≈ ${r.sysTok.toLocaleString()} 토큰(글자÷3.6 추정)`));
  for (const k of Object.keys(MODELS)) {
    const c = costTable(rows, MODELS[k]);
    console.log(`  ${k.padEnd(7)} 캐시 없음 ${String(c.nocacheKRW).padStart(7)}원 · 프롬프트 캐시 ${String(c.cacheKRW).padStart(6)}원 · 배치+캐시 ${String(c.batchKRW).padStart(6)}원`);
  }
  console.log('\n  API 호출은 하지 않았다. 실제로 돌리려면 --live 또는 --batch (먼저 --limit=10으로).');
  if (!process.env.ANTHROPIC_API_KEY) console.log('  ⚠️ ANTHROPIC_API_KEY가 없다 — .env.local 또는 환경변수로 넣어야 --live/--batch가 돈다.');
  console.log(line); process.exit(0);
}

const client = new Anthropic();
const OUT = path.join(ROOT, 'probe-data', `ai-teams-${MODEL_KEY}.jsonl`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const parseOut = (msg) => { const tb = msg.content.find((b) => b.type === 'text'); try { return JSON.parse(tb?.text || ''); } catch { return null; } };
const record = (t, msg, out) => {
  const g = grade(t, out);
  const rec = { id: t.id, src: t.src, mode: t.mode, boss: t.boss || null, real: t.m, ai: out?.members || null, reasoning: out?.reasoning || null, model: M.id, stop: msg?.stop_reason, usage: msg?.usage, ...g, at: new Date().toISOString() };
  fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
  return rec;
};
const summarize = (recs) => {
  const n = recs.length; const num = (f) => recs.filter(f).length;
  const avg = (k) => { const v = recs.map((r) => r[k]).filter((x) => typeof x === 'number'); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : null; };
  console.log(`\n  ${n}건 · 완전일치 ${num((r) => r.exact)} · 5명 유효 ${num((r) => r.valid5)} · 버스트 성립 ${num((r) => r.burstValid)} · 풀 밖 이름 ${num((r) => r.outOfPool > 0 || r.unknown.length > 0)}`);
  console.log(`  겹치는 인원 평균 ${avg('overlap')?.toFixed(2)} / 5 · 시뮬 점수비(AI÷등록) 평균 ${avg('simRatio')?.toFixed(3)}`);
  console.log(`  메타 풀 백분위 — AI 조합 평균 ${avg('aiPct')?.toFixed(1)}% · 등록 조합 평균 ${avg('realPct')?.toFixed(1)}%  (50% = 무작위)`);
  const u = recs.map((r) => r.usage).filter(Boolean);
  if (u.length) {
    const s = (k) => u.reduce((a, x) => a + (x[k] || 0), 0);
    const usd = (s('input_tokens') * M.in + s('cache_creation_input_tokens') * 2 * M.in + s('cache_read_input_tokens') * 0.1 * M.in + s('output_tokens') * M.out) / 1e6;
    console.log(`  실측 토큰 — 입력 ${s('input_tokens')} · 캐시 쓰기 ${s('cache_creation_input_tokens')} · 캐시 읽기 ${s('cache_read_input_tokens')} · 출력 ${s('output_tokens')} → 약 ${Math.round(usd * KRW * (MODE === 'resume' ? 0.5 : 1))}원`);
  }
};

if (MODE === 'live') {
  const recs = [];
  for (const t of target) {
    let msg;
    try { msg = await client.messages.create(paramsFor(t)); }
    catch (e) { console.error(`  ${t.id} 실패: ${e instanceof Anthropic.APIError ? e.status + ' ' + e.message : e.message}`); continue; }
    const rec = record(t, msg, parseOut(msg));
    console.log(`  ${t.id.padEnd(12)} 겹침 ${rec.overlap}/5${rec.exact ? ' ✅ 완전일치' : ''}${rec.burstValid ? '' : ' ⚠️ 버스트 불성립'}${rec.outOfPool || rec.unknown.length ? ' ⚠️ 풀 밖/미지 이름' : ''} · 캐시읽기 ${msg.usage.cache_read_input_tokens || 0}`);
    recs.push(rec);
  }
  summarize(recs);
} else if (MODE === 'batch') {
  const batch = await client.messages.batches.create({ requests: target.map((t) => ({ custom_id: t.id, params: paramsFor(t) })) });
  console.log(`  배치 제출: ${batch.id} · 상태 ${batch.processing_status}`);
  console.log(`  결과 회수: node scripts/experimentAiTeams.mjs --resume=${batch.id} --model=${MODEL_KEY}`);
} else if (MODE === 'resume') {
  const id = arg('resume');
  const b = await client.messages.batches.retrieve(id);
  if (b.processing_status !== 'ended') { console.log(`  아직 처리 중: ${b.processing_status} · 남은 ${b.request_counts.processing}`); process.exit(0); }
  const byId = new Map(teams.map((t) => [t.id, t]));
  const recs = [];
  for await (const r of await client.messages.batches.results(id)) {
    const t = byId.get(r.custom_id); if (!t) continue;
    if (r.result.type !== 'succeeded') { console.error(`  ${r.custom_id}: ${r.result.type}`); continue; }
    recs.push(record(t, r.result.message, parseOut(r.result.message)));
  }
  summarize(recs);
}
console.log(line);
