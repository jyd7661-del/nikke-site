#!/usr/bin/env node
/**
 * **사진으로 보유 니케 넣기 — 실호출 시험** (2026-11-02)
 *
 *   node scripts/experimentRosterPhoto.mjs <캡처.jpg> [...]             # 장마다 동시에 하이쿠 5.5(low) → 표 출력 + probe-data/roster-photo-<시각>.json
 *   node scripts/experimentRosterPhoto.mjs --effort=medium <캡처...>
 *   node scripts/experimentRosterPhoto.mjs --ko-only <캡처...>          # 영어·일본어 이름 칸 없이
 *
 * 프롬프트·요청 본문은 운영과 같은 것(lib/rosterPhotoPrompt.js). 정답 대조는 사람(또는 클로드)이 캡처를 보고 한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { CHARACTERS } from '../data/characters.js';
import { candidateLines, buildRosterPhotoPrompt, buildRosterObservePrompt, matchObserved, rosterPhotoRequest, parseRosterPhoto, rescueByFragment, altNamesFromCdb, ROSTER_PHOTO_MODEL } from '../lib/rosterPhotoPrompt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch { /* 환경변수로도 받는다 */ }
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY 없음(.env.local)'); process.exit(1); }

const args = process.argv.slice(2);
const effort = (args.find((a) => a.startsWith('--effort=')) || '--effort=low').split('=')[1];
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length && !args.some((a) => a.startsWith('--from='))) { console.error('캡처 파일을 주세요'); process.exit(1); }

const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/characterDatabase.json'), 'utf8'));
const cdbById = new Map(cdb.map((c) => [c.id, c]));
// --ko-only: 영어·일본어 이름 칸 없이(11-02 첫 시험 조건). 기본은 운영과 같이 칸을 넣는다
const altNames = args.includes('--ko-only') ? null : altNamesFromCdb(cdbById);
// --observe: 아이콘 먼저 방식(AI는 본 것만, 고르기는 matchObserved). 기본은 지금 운영 방식
const observe = args.includes('--observe');
// --legend: 운영과 같은 무기 견본(lib/rosterWeaponLegend.js) · --legend=<png>: 다른 견본 시험 · --no-legend: 견본 없이
const legendArg = args.find((a) => a.startsWith('--legend='));
const legend = legendArg ? { type: 'image/png', data: fs.readFileSync(legendArg.split('=')[1]).toString('base64') }
  : args.includes('--no-legend') ? null : (await import('../lib/rosterWeaponLegend.js')).ROSTER_WEAPON_LEGEND;
const prompt = (observe ? buildRosterObservePrompt : buildRosterPhotoPrompt)(candidateLines(CHARACTERS, cdbById, altNames), !!altNames, !!legend);
// --truth=<json>: 파일 이름 → { ids, treasure, unknownNikke } 정답표(probe-data/roster-photo-truth.json — 운영 확인 기록으로 만든 것)
const truthArg = args.find((a) => a.startsWith('--truth='));
const truth = truthArg ? JSON.parse(fs.readFileSync(truthArg.split('=')[1], 'utf8')) : null;
const nameById = new Map(CHARACTERS.map((c) => [c.id, c.name]));
const client = new Anthropic();

// 하이쿠 5.5 단가(USD/1M) — app/api/ai-recommend/route.js PRICE_USD_PER_M과 같은 값. $1 = 1,400원
const krw = (u) => Math.round(((u.input_tokens || 0) * 0.1 + (u.output_tokens || 0) * 0.5) / 1e6 * 1400 * 100) / 100;

const t0 = Date.now();
// --from=<저장된 결과 json>: AI를 다시 부르지 않고 저장된 답에 후처리(matchObserved 등)만 다시 돌린다 — 후처리를 고친 뒤 비용 0으로 비교
const fromArg = args.find((a) => a.startsWith('--from='));
const reads = fromArg ? JSON.parse(fs.readFileSync(fromArg.split('=')[1], 'utf8')).reads : await Promise.all(files.map(async (f) => {
  const ext = path.extname(f).toLowerCase();
  const image = { type: ext === '.png' ? 'image/png' : 'image/jpeg', data: fs.readFileSync(f).toString('base64') };
  const s = Date.now();
  const msg = await client.messages.create(rosterPhotoRequest(prompt, image, ROSTER_PHOTO_MODEL, effort, legend));
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { file: path.basename(f), sec: (Date.now() - s) / 1000, usage: msg.usage, parsed: parseRosterPhoto(text), raw: text };
}));

let total = 0;
const score = { files: 0, truth: 0, sureOk: 0, sureBad: 0, unsureOk: 0, unsureBad: 0, missed: 0, tOk: 0, tMiss: 0, tBad: 0, icon: { el: [0, 0], wp: [0, 0], bu: [0, 0] } };
for (const r of reads) {
  if (r.parsed) {
    // 운영과 같은 후처리로 최종 카드를 만든다
    r.final = r.parsed.cards.map((c) => (observe
      ? matchObserved(c, CHARACTERS, cdbById, altNames)
      : rescueByFragment({ seen: c.seen, id: String(c.id || 'none'), treasure: !!c.treasure, sure: c.sure !== false }, CHARACTERS, altNames)));
  }
  const t = truth?.[r.file];
  if (t && r.final) {
    score.files++;
    const want = new Set(t.ids);
    score.truth += want.size;
    const got = new Map();
    r.final.forEach((c, i) => {
      if (!c.id || c.id === 'none') return;
      const p = got.get(c.id);
      got.set(c.id, { sure: (p?.sure || false) || c.sure, treasure: (p?.treasure || false) || c.treasure, raw: r.parsed.cards[i] });
    });
    for (const [id, g] of got) {
      if (want.has(id)) g.sure ? score.sureOk++ : score.unsureOk++;
      else g.sure ? score.sureBad++ : score.unsureBad++;
      if (want.has(id) && observe) {
        const d = cdbById.get((CHARACTERS.find((c) => c.id === id) || {}).cdbId || id) || {};
        const raw = g.raw;
        score.icon.el[0]++; if (raw.element === d.element) score.icon.el[1]++;
        score.icon.wp[0]++; if (String(raw.weapon).toLowerCase() === d.weapon) score.icon.wp[1]++;
        score.icon.bu[0]++; if (Number(raw.burst) === Number(d.burst)) score.icon.bu[1]++;
      }
    }
    for (const id of want) if (!got.has(id)) score.missed++;
    const wantT = new Set(t.treasure || []);
    for (const [id, g] of got) if (want.has(id)) { if (g.treasure && wantT.has(id)) score.tOk++; else if (g.treasure) score.tBad++; }
    for (const id of wantT) if (!got.get(id)?.treasure) score.tMiss++;
  }
}
for (const r of reads) {
  total += krw(r.usage);
  console.log(`\n## ${r.file} · ${r.sec.toFixed(1)}초 · 입력 ${r.usage.input_tokens} · 출력 ${r.usage.output_tokens} · ${krw(r.usage)}원`);
  if (!r.parsed) { console.log('  (해석 실패)', r.raw.slice(0, 300)); continue; }
  r.final.forEach((c, i) => {
    const raw = r.parsed.cards[i];
    const icons = observe ? ` [${raw.element}/${raw.weapon}/${raw.burst}] ${c.how}` : '';
    const bad = c.id !== 'none' && !nameById.has(c.id) ? ' ⚠️없는 id' : '';
    const wrong = truth?.[r.file] && c.id !== 'none' && !truth[r.file].ids.includes(c.id) ? ' ❌' : '';
    console.log(`  ${c.seen || '(이름 없음)'}${icons} → ${c.id === 'none' ? '(목록 밖)' : nameById.get(c.id) || c.id}${c.treasure ? ' 💎' : ''}${c.sure === false ? ' ?' : ''}${bad}${wrong}`);
  });
}
console.log(`\n전체 ${((Date.now() - t0) / 1000).toFixed(1)}초 · ${total.toFixed(2)}원 · 효과 ${effort} · ${observe ? '아이콘 먼저' : '지금 방식'}`);
if (score.files) {
  const s = score;
  console.log(`정답 대조(${s.files}장, 정답 니케 ${s.truth}): 확실·맞음 ${s.sureOk} · **확실·틀림 ${s.sureBad}** · 확인 필요·맞음 ${s.unsureOk} · 확인 필요·틀림 ${s.unsureBad} · 놓침 ${s.missed} · 💎 맞음 ${s.tOk} 놓침 ${s.tMiss} 잘못 ${s.tBad}`);
  if (observe) console.log(`아이콘 읽기(정답 니케 기준): 속성 ${s.icon.el[1]}/${s.icon.el[0]} · 무기 ${s.icon.wp[1]}/${s.icon.wp[0]} · 버스트 ${s.icon.bu[1]}/${s.icon.bu[0]}`);
}
if (fromArg) process.exit(0);
const out = path.join(ROOT, 'probe-data', `roster-photo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(out, JSON.stringify({ effort, reads }, null, 2));
console.log('저장:', out);
