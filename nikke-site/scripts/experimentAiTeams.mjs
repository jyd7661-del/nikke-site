#!/usr/bin/env node
/**
 * **AI가 조합을 짜면 실제 랭커 조합에 얼마나 가까운가** — 클로드 플랫폼 검토 순서표 2단계. (2026-09-14)
 *
 *   node scripts/experimentAiTeams.mjs                       # 비용 추정만 (API 호출 없음)
 *   node scripts/experimentAiTeams.mjs --live --model=sonnet --limit=10   # 시험 삼아 10건만 직접 호출
 *   node scripts/experimentAiTeams.mjs --batch --model=opus               # 214건 배치 제출(50% 할인)
 *   node scripts/experimentAiTeams.mjs --resume=<batch_id> --model=opus   # 배치 결과 회수·채점
 *   node scripts/experimentAiTeams.mjs --export --limit=10                # 프롬프트만 내보내기(구독 서브에이전트용)
 *   node scripts/experimentAiTeams.mjs --import=<answers.jsonl> --label=haiku-sub   # 서브에이전트 답 채점
 *   node scripts/experimentAiTeams.mjs --variant=tier --export                    # 2차: 로스터에 enikk 채용률 등급을 붙인 변형
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
import Anthropic from '@anthropic-ai/sdk';
import { systemPrompt, userPrompt, MODE_SLICE, burstValid } from './aiTeamPrompt.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch { /* 키는 환경변수로도 받는다 */ }

const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);
const MODEL_KEY = arg('model', 'sonnet');
const LIMIT = Number(arg('limit', 0)) || 0;
// --variant=plain|tier : tier = 로스터 각 줄에 enikk 채용률 등급·%를 붙인다(2차 실험, 2026-09-14). 슬라이스 매핑은 엔진 MODE_TO_META_SLICE와 같다.
const VARIANT = arg('variant', 'plain');
if (!['plain', 'tier'].includes(VARIANT)) { console.error('--variant=plain|tier'); process.exit(1); }
const MODE = has('live') ? 'live' : has('batch') ? 'batch' : arg('resume', null) ? 'resume' : has('export') ? 'export' : arg('import', null) ? 'import' : 'dry';
// --export : 프롬프트를 probe-data/ai-teams-prompts.jsonl 로 내보낸다(API 호출 없음). 클로드 코드 서브에이전트(구독)에게 돌릴 때 쓴다.
// --import=<file> --label=<이름> : 서브에이전트가 답한 {id, members[5], reasoning} JSONL을 같은 잣대로 채점한다.
//   ⚠️ 서브에이전트 답은 usage가 없어 비용은 못 잰다 — 품질(겹침·백분위)만 API 결과와 같은 표에 놓인다.

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
const metaStats = j('metaStats.json');
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

// --- 질문 단위 = 프롬프트가 다른 경우 (2026-09-14 재설계) ---
// 처음엔 등록 조합 214건마다 1번씩 물었다. 그런데 솔로레이드는 "한 보스당 인기 조합 상위 25개 표"라서 같은 보스의
// 25건이 **글자 그대로 같은 프롬프트**였다 — 같은 질문 25번에 같은 답이 나오고, 1등 조합 하나만 맞출 수 있는 구조.
// 그래서 질문은 프롬프트별 1번(12개), 채점은 그 질문에 등록된 조합 **전체**와 견준다(가장 많이 겹치는 것, 완전일치면 그 순위).

// --- 프롬프트: 출처마다 바이트 단위로 동일해야 캐시가 걸린다(정렬 고정, 날짜·ID 금지). 빌더는 aiTeamPrompt.mjs(얇은 로스터 실험과 공유).
// 2차 변형(tier): enikk /meta 슬라이스의 등급·채용률을 그대로 붙인다(A등급 값). 출처→슬라이스는 엔진 MODE_TO_META_SLICE와 같다(타워는 campaign).
const SRC_MODE = { 솔로레이드: 'bossing', 타워: 'tribe_tower', 캠페인: 'campaign', PvP: 'pvp' };
const systemFor = (src) => systemPrompt([...pool[src]].sort().map((n) => byTitle.get(n)), { variant: VARIANT, metaStats, slice: MODE_SLICE[SRC_MODE[src]] });
const userFor = userPrompt;

const cases = [];
{
  const byKey = new Map();
  for (const t of teams) {
    const key = t.src + '|' + userFor(t);
    if (!byKey.has(key)) byKey.set(key, { src: t.src, mode: t.mode, boss: t.boss || null, tower: t.tower || null, bossNames: new Set(), regs: [] });
    const c = byKey.get(key); if (t.bossName) c.bossNames.add(t.bossName);
    c.regs.push({ rank: c.regs.length + 1, m: t.m });   // 등록 순서 = 출처 표의 순서(솔로레이드는 parses 내림차순)
  }
  let i = 0; for (const c of byKey.values()) { c.id = `Q${String(i++).padStart(2, '0')}-${c.src}${c.boss ? '-' + c.boss : ''}${c.tower ? '-' + c.tower : ''}`; c.bossNames = [...c.bossNames]; cases.push(c); }
}
const EFFORT = arg('effort', 'medium');   // none = 운영과 같은 설정(effort 미지정)
const SAMPLES = Number(arg('samples', 1)) || 1;   // 같은 질문을 몇 번 묻는가(모델 답의 흔들림을 보려면 3)

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    // ⚠️ minItems/maxItems를 넣지 말 것 — 구조화 출력은 배열 minItems를 0·1만 받아 요청이 통째로 400이 된다
    //    (운영 코드 lib/aiTeamPrompt.js와 같은 고장, 2026-09-21 첫 --live에서 드러남). 인원 수는 grade()의 valid5가 본다.
    members: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['members', 'reasoning'],
  additionalProperties: false,
};
const paramsFor = (t) => ({
  model: M.id,
  // ⚠️ 2000이면 effort=medium의 생각이 토큰을 다 써서 답이 안 나온다(2026-09-21 첫 --live: 2건 모두 stop=max_tokens,
  //    thinking 1,999/2,000). --effort=none 은 운영 호출(app/api/ai-recommend, effort 지정 없음)과 같은 설정이다.
  max_tokens: 8000,
  ...(M.thinking && EFFORT !== 'none' ? { output_config: { effort: EFFORT, format: { type: 'json_schema', schema: OUTPUT_SCHEMA } } }
                 : { output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } } }),
  system: [{ type: 'text', text: systemFor(t.src), cache_control: { type: 'ephemeral', ttl: '1h' } }],
  messages: [{ role: 'user', content: userFor(t) }],
});

// --- 채점 ---
let seed = 0; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function percentile(team, src, score) {
  // 씨앗을 출처마다 고정 — 같은 팀의 AI 조합과 등록 조합이 **같은 무작위 표본**과 겨루어야 비교가 공정하다.
  // (처음엔 씨앗이 호출마다 이어져 같은 등록 조합의 백분위가 83 → 76.5로 흔들렸다)
  seed = 24681357 + [...src].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const p = cdb.filter((c) => pool[src].has(c.title)); let below = 0, n = 0, guard = 0;
  while (n < 200 && guard < 4000) { guard++; const q = [...p]; const pick = []; for (let i = 0; i < 5; i++) pick.push(...q.splice(Math.floor(rnd() * q.length), 1)); if (!burstValid(pick)) continue; n++; const v = scoreComposition(pick).total; if (v < score - 1e-9) below++; else if (Math.abs(v - score) <= 1e-9) below += 0.5; }
  return n ? below / n * 100 : null;
}
function grade(c, out) {
  const members = Array.isArray(out?.members) ? out.members : [];
  const resolved = members.map((n) => byTitle.get(n)).filter(Boolean);
  const unknown = members.filter((n) => !byTitle.has(n));
  const inPool = resolved.filter((x) => pool[c.src].has(x.title)).length;
  const ok5 = resolved.length === 5 && new Set(resolved.map((x) => x.id)).size === 5;
  const titles = new Set(resolved.map((x) => x.title));
  // 등록 조합 전체와 견줘 가장 많이 겹치는 것. 완전일치면 그 조합의 등록 순위(1 = 표의 맨 위).
  let best = { overlap: -1, rank: null };
  for (const r of c.regs) { const o = r.m.filter((n) => titles.has(n)).length; if (o > best.overlap) best = { overlap: o, rank: r.rank }; }
  const exact = ok5 && best.overlap === 5;
  // 타워 입장 위반 인원 — 규칙은 TOWER_RULE과 같다(제조사 3종 = 그 제조사만, pilgrim = 필그림 또는 overspec, Tribe = 없음)
  const towerBad = c.mode !== 'tribe_tower' || c.tower == null ? 0
    : resolved.filter((x) => c.tower === 'pilgrim' ? !(x.manufacturer === 'pilgrim' || x.overspec) : x.manufacturer !== c.tower).length;
  const aiScore = ok5 ? scoreComposition(resolved).total : null;
  const top = c.regs[0].m.map((n) => byTitle.get(n)).filter(Boolean);
  const topScore = scoreComposition(top).total;
  return {
    exact, matchedRank: exact ? best.rank : null, overlap: Math.max(best.overlap, 0), unknown, outOfPool: resolved.length - inPool, towerBad, valid5: ok5,
    burstValid: ok5 ? burstValid(resolved) : false,
    simRatio: aiScore != null ? aiScore / topScore : null,          // AI 조합 ÷ 등록 1위 조합 (시뮬 점수)
    aiPct: ok5 ? percentile(resolved, c.src, aiScore) : null,
    topPct: percentile(top, c.src, topScore),
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

const target = LIMIT ? cases.slice(0, LIMIT) : cases;
const line = '─'.repeat(84);
console.log(line);
console.log(`AI 조합 실험 — 모델 ${M.id} · 변형 ${VARIANT} · 방식 ${MODE} · 질문 ${target.length}/${cases.length}개 × ${SAMPLES}회 (등록 조합 ${teams.length}건이 정답지)`);
console.log(line);

if (MODE === 'dry') {
  target.forEach((c) => console.log(`  ${c.id.padEnd(28)} 등록 ${String(c.regs.length).padStart(2)}건${c.bossNames.length ? ' · ' + c.bossNames.join(', ') : ''}`));
  const rows = Object.keys(pool).map((src) => ({ src, n: target.filter((c) => c.src === src).length * SAMPLES, sysTok: est(systemFor(src).length), userTok: 60 })).filter((r) => r.n);
  rows.forEach((r) => console.log(`  ${r.src.padEnd(6)} ${String(r.n).padStart(3)}건 · 풀 ${pool[r.src].size}명 · 시스템 프롬프트 ≈ ${r.sysTok.toLocaleString()} 토큰(글자÷3.6 추정)`));
  for (const k of Object.keys(MODELS)) {
    const c = costTable(rows, MODELS[k]);
    console.log(`  ${k.padEnd(7)} 캐시 없음 ${String(c.nocacheKRW).padStart(7)}원 · 프롬프트 캐시 ${String(c.cacheKRW).padStart(6)}원 · 배치+캐시 ${String(c.batchKRW).padStart(6)}원`);
  }
  console.log('\n  API 호출은 하지 않았다. 실제로 돌리려면 --live 또는 --batch (먼저 --limit=10으로).');
  if (!process.env.ANTHROPIC_API_KEY) console.log('  ⚠️ ANTHROPIC_API_KEY가 없다 — .env.local 또는 환경변수로 넣어야 --live/--batch가 돈다.');
  console.log(line); process.exit(0);
}

const LABEL = arg('label', MODEL_KEY + (VARIANT === 'plain' ? '' : '-' + VARIANT));
const OUT = path.join(ROOT, 'probe-data', `ai-teams-${LABEL}.jsonl`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const parseOut = (msg) => { const tb = msg.content.find((b) => b.type === 'text'); try { return JSON.parse(tb?.text || ''); } catch { return null; } };
const record = (c, msg, out) => {
  const g = grade(c, out);
  const rec = { id: c.id, src: c.src, mode: c.mode, boss: c.boss, tower: c.tower, top: c.regs[0].m, ai: out?.members || null, reasoning: out?.reasoning || null, model: MODE === 'import' ? LABEL : M.id, variant: VARIANT, stop: msg?.stop_reason, usage: msg?.usage, ...g, at: new Date().toISOString() };
  fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
  return rec;
};
const show = (rec) => console.log(`  ${rec.id.padEnd(28)} 겹침 ${rec.overlap}/5${rec.exact ? ` ✅ 등록 ${rec.matchedRank}위와 일치` : ''}${rec.burstValid ? '' : ' ⚠️ 버스트 불성립'}${rec.outOfPool || rec.unknown.length ? ' ⚠️ 풀 밖/미지 이름' : ''}${rec.towerBad ? ` ⚠️ 타워 입장 불가 ${rec.towerBad}명` : ''}${rec.usage ? ` · 캐시읽기 ${rec.usage.cache_read_input_tokens || 0}` : ''}`);
const summarize = (recs) => {
  const n = recs.length; const num = (f) => recs.filter(f).length;
  const avg = (k) => { const v = recs.map((r) => r[k]).filter((x) => typeof x === 'number'); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : null; };
  console.log(`\n  답 ${n}개 · 등록 조합과 완전일치 ${num((r) => r.exact)} · 5명 유효 ${num((r) => r.valid5)} · 버스트 성립 ${num((r) => r.burstValid)} · 풀 밖 이름 ${num((r) => r.outOfPool > 0 || r.unknown.length > 0)} · 타워 입장 위반 ${num((r) => r.towerBad > 0)}`);
  console.log(`  등록 조합 중 최대 겹침 평균 ${avg('overlap')?.toFixed(2)} / 5 · 시뮬 점수비(AI÷등록 1위) 평균 ${avg('simRatio')?.toFixed(3)}`);
  console.log(`  메타 풀 백분위 — AI 조합 평균 ${avg('aiPct')?.toFixed(1)}% · 등록 1위 조합 평균 ${avg('topPct')?.toFixed(1)}%  (50% = 무작위)`);
  const u = recs.map((r) => r.usage).filter(Boolean);
  if (u.length) {
    const s = (k) => u.reduce((a, x) => a + (x[k] || 0), 0);
    const usd = (s('input_tokens') * M.in + s('cache_creation_input_tokens') * 2 * M.in + s('cache_read_input_tokens') * 0.1 * M.in + s('output_tokens') * M.out) / 1e6;
    console.log(`  실측 토큰 — 입력 ${s('input_tokens')} · 캐시 쓰기 ${s('cache_creation_input_tokens')} · 캐시 읽기 ${s('cache_read_input_tokens')} · 출력 ${s('output_tokens')} → 약 ${Math.round(usd * KRW * (MODE === 'resume' ? 0.5 : 1))}원`);
  }
};

if (MODE === 'export') {
  const P = path.join(ROOT, 'probe-data', `ai-teams-prompts${VARIANT === 'plain' ? '' : '-' + VARIANT}.jsonl`);
  fs.writeFileSync(P, target.map((c) => JSON.stringify({ id: c.id, src: c.src, system: systemFor(c.src), user: userFor(c) })).join('\n') + '\n');
  console.log(`  ${target.length}개 질문 → ${path.relative(ROOT, P)} (시스템 프롬프트는 출처별로 동일 — 서브에이전트에는 파일로 건넨다)`);
  console.log(line); process.exit(0);
}
const byId = new Map(cases.map((c) => [c.id, c]));
if (MODE === 'import') {
  const recs = []; let bad = 0;
  for (const ln of fs.readFileSync(arg('import'), 'utf8').split('\n').filter((s) => s.trim())) {
    let a; try { a = JSON.parse(ln); } catch { bad++; continue; }
    const c = byId.get(a.id); if (!c) { bad++; continue; }
    const rec = record(c, null, a); show(rec); recs.push(rec);
  }
  if (bad) console.log(`  ⚠️ 읽지 못한 줄 ${bad}`);
  summarize(recs);
  console.log(line); process.exit(0);
}
const client = new Anthropic();
const reqs = target.flatMap((c) => Array.from({ length: SAMPLES }, (_, k) => ({ c, custom_id: `${c.id}#${k}` })));
if (MODE === 'live') {
  const recs = [];
  for (const { c } of reqs) {
    let msg;
    try { msg = await client.messages.create(paramsFor(c)); }
    catch (e) { console.error(`  ${c.id} 실패: ${e instanceof Anthropic.APIError ? e.status + ' ' + e.message : e.message}`); continue; }
    const rec = record(c, msg, parseOut(msg)); show(rec); recs.push(rec);
  }
  summarize(recs);
} else if (MODE === 'batch') {
  const batch = await client.messages.batches.create({ requests: reqs.map(({ c, custom_id }) => ({ custom_id, params: paramsFor(c) })) });
  console.log(`  배치 제출: ${batch.id} · 상태 ${batch.processing_status}`);
  console.log(`  결과 회수: node scripts/experimentAiTeams.mjs --resume=${batch.id} --model=${MODEL_KEY}`);
} else if (MODE === 'resume') {
  const id = arg('resume');
  const b = await client.messages.batches.retrieve(id);
  if (b.processing_status !== 'ended') { console.log(`  아직 처리 중: ${b.processing_status} · 남은 ${b.request_counts.processing}`); process.exit(0); }
  const recs = [];
  for await (const r of await client.messages.batches.results(id)) {
    const c = byId.get(r.custom_id.split('#')[0]); if (!c) continue;
    if (r.result.type !== 'succeeded') { console.error(`  ${r.custom_id}: ${r.result.type}`); continue; }
    const rec = record(c, r.result.message, parseOut(r.result.message)); show(rec); recs.push(rec);
  }
  summarize(recs);
}
console.log(line);
