#!/usr/bin/env node
/**
 * **AI 설명 문단 — 모델 나란히 비교** (2026-10-08, 하이쿠 5.5 출시 다음 날)
 *
 *   node scripts/experimentExplain.mjs --dry                 # 프롬프트 1건만 출력(돈 0)
 *   node scripts/experimentExplain.mjs --live                # 표본마다 하이쿠 4.5 · 5.5로 한 번씩 → probe-data/explain-compare.md
 *   node scripts/experimentExplain.mjs --live --n=12 --lang=en
 *
 * 프롬프트와 요청 본문은 운영과 **같은 것**(lib/aiExplainPrompt.js)이다. 조합은 사이트 경로(pickSiteTeam)가 고른 1위.
 * 표본 = 얇은 로스터 판정 표본(probe-data/thin-cases-s1.jsonl)에서 모드마다 고르게. 판정은 사람(또는 클로드)이 md를 읽고 한다 —
 * 지시 위반(미보유 포장·가정형 애장품·[조건 확인] 누락·구조 설명 누락·출처 언급)과 사실 오류를 본다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { buildExplainPrompt, explainRequest, extractJson } from '../lib/aiExplainPrompt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch { /* 환경변수로도 받는다 */ }
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-ex-'));
const fix = (src) => src
  .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
  .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets', 'pvpBurst']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8')));
const E = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
fs.rmSync(tmp, { recursive: true, force: true });

const MODELS = (arg('models', 'claude-haiku-4-5,claude-haiku-5-5')).split(',');
const PRICE = { 'claude-haiku-4-5': { in: 1, out: 5 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5 } };
const KRW = 1400;
const LANG = arg('lang', 'ko');
const LANG_NAMES = { ko: '한국어', en: '영어(English)', ja: '일본어(日本語)' };
const MODE_LABEL = { campaign: '캠페인', bossing: '보스전', pvp: 'PvP', tribe_tower: '타워' };
const N = Number(arg('n', 8));

const cdb = j('characterDatabase.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const noteByName = new Map(j('characterInvestmentNotes.json').characters.map((c) => [c.name, c]));
const TREASURE = new Set(j('treasureEffects.json').characters.map((t) => t.characterId));

// 모드마다 고르게 N건
const rows = fs.readFileSync(path.join(ROOT, 'probe-data', 'thin-cases-s1.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const byMode = {};
for (const r of rows) (byMode[r.mode] ||= []).push(r);
const picks = [];
for (let i = 0; picks.length < N; i++) {
  let added = false;
  for (const m of Object.keys(byMode)) if (byMode[m][i] && picks.length < N) { picks.push(byMode[m][i]); added = true; }
  if (!added) break;
}

const client = has('live') ? new Anthropic() : null;
if (has('live') && !process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY 없음(.env.local)'); process.exit(1); }
const out = [`# AI 설명 문단 — ${MODELS.join(' vs ')} (${LANG})`, '', `${new Date().toISOString().slice(0, 10)} · 표본 ${picks.length}건(probe-data/thin-cases-s1) · 프롬프트·요청 = lib/aiExplainPrompt.js(운영과 같음)`, ''];
const tot = Object.fromEntries(MODELS.map((m) => [m, { krw: 0, ms: 0, fail: 0, chars: 0 }]));
for (const c of picks) {
  const roster = c.roster.map((t) => byTitle.get(t)).filter(Boolean);
  // 표본에 애장품 정보가 없다 — 애장품 캐릭터는 절반만 보유로(설명의 애장품 지시를 시험하려고). 고정 규칙이라 재현된다.
  const treasureIdSet = new Set(roster.filter((x, i) => TREASURE.has(x.id) && i % 2 === 0).map((x) => x.id));
  const r = E.pickSiteTeam(roster, c.mode, { bossElement: c.boss || null, tower: c.tower || null, treasureIds: treasureIdSet, lang: LANG });
  if (!r.team) continue;
  const fullMembers = r.team.members.map((m) => byTitle.get(m.title));
  const { system, userContent } = buildExplainPrompt({
    fullMembers, reasons: r.team.reasons, archetypeNote: r.team.archetypeNote || null, mode: c.mode,
    modeLabel: MODE_LABEL[c.mode] || c.mode, treasureIdSet, langName: LANG_NAMES[LANG], noteByName,
  });
  if (has('dry')) { console.log(system + '\n\n=== USER ===\n' + userContent); process.exit(0); }
  out.push(`## ${c.id} · ${MODE_LABEL[c.mode]}${c.boss ? ` · ${c.boss}` : ''} · ${r.path}`, '', `조합: ${fullMembers.map((m) => `${m.name_kr}${treasureIdSet.has(m.id) ? '💎' : ''}`).join(' · ')}`, '');
  out.push('<details><summary>채점 근거(프롬프트에 들어간 것)</summary>', '', userContent.split('[채점 근거]')[1]?.split('위 조합이')[0]?.trim() || '', '', '</details>', '');
  for (const model of MODELS) {
    const t0 = Date.now();
    let text = '', usage = {}, err = null;
    try {
      const msg = await client.messages.create(explainRequest(model, system, userContent));
      const raw = msg.content?.find((b) => b.type === 'text')?.text || '';
      text = msg.stop_reason === 'stop_sequence' ? `${raw}}` : raw;
      usage = msg.usage || {};
    } catch (e) { err = String(e.message || e).slice(0, 300); }
    const ms = Date.now() - t0;
    const parsed = text ? extractJson(text) : null;
    const p = PRICE[model];
    const krw = ((usage.input_tokens || 0) * p.in + (usage.output_tokens || 0) * p.out) / 1e6 * KRW;
    const t = tot[model]; t.krw += krw; t.ms += ms; if (!parsed?.reasoning) t.fail++; else t.chars += parsed.reasoning.length;
    out.push(`**${model}** — ${krw.toFixed(2)}원 · ${(ms / 1000).toFixed(1)}초 · 입력 ${usage.input_tokens || 0} / 출력 ${usage.output_tokens || 0}${usage.output_tokens_details?.thinking_tokens ? ` (생각 ${usage.output_tokens_details.thinking_tokens})` : ''}`, '');
    out.push(parsed?.reasoning ? `> ${parsed.reasoning}` : `> ❌ 실패 ${err || text.slice(0, 200)}`, '');
  }
}
const n = picks.length;
out.splice(4, 0, '| 모델 | 건당 | 평균 시간 | 실패 | 평균 글자 |', '|---|---|---|---|---|',
  ...MODELS.map((m) => `| ${m} | ${(tot[m].krw / n).toFixed(2)}원 | ${(tot[m].ms / n / 1000).toFixed(1)}초 | ${tot[m].fail} | ${Math.round(tot[m].chars / Math.max(1, n - tot[m].fail))} |`), '');
const OUTF = path.join(ROOT, 'probe-data', `explain-compare-${LANG}.md`);
fs.writeFileSync(OUTF, out.join('\n'));
for (const m of MODELS) console.log(`${m}: 건당 ${(tot[m].krw / n).toFixed(2)}원 · ${(tot[m].ms / n / 1000).toFixed(1)}초 · 실패 ${tot[m].fail}/${n}`);
console.log(`→ ${path.relative(ROOT, OUTF)}`);
