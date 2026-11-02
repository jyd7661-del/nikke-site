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
import { candidateLines, buildRosterPhotoPrompt, rosterPhotoRequest, parseRosterPhoto, altNamesFromCdb, ROSTER_PHOTO_MODEL } from '../lib/rosterPhotoPrompt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch { /* 환경변수로도 받는다 */ }
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY 없음(.env.local)'); process.exit(1); }

const args = process.argv.slice(2);
const effort = (args.find((a) => a.startsWith('--effort=')) || '--effort=low').split('=')[1];
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) { console.error('캡처 파일을 주세요'); process.exit(1); }

const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/characterDatabase.json'), 'utf8'));
const cdbById = new Map(cdb.map((c) => [c.id, c]));
// --ko-only: 영어·일본어 이름 칸 없이(11-02 첫 시험 조건). 기본은 운영과 같이 칸을 넣는다
const altNames = args.includes('--ko-only') ? null : altNamesFromCdb(cdbById);
const prompt = buildRosterPhotoPrompt(candidateLines(CHARACTERS, cdbById, altNames), !!altNames);
const nameById = new Map(CHARACTERS.map((c) => [c.id, c.name]));
const client = new Anthropic();

// 하이쿠 5.5 단가(USD/1M) — app/api/ai-recommend/route.js PRICE_USD_PER_M과 같은 값. $1 = 1,400원
const krw = (u) => Math.round(((u.input_tokens || 0) * 0.1 + (u.output_tokens || 0) * 0.5) / 1e6 * 1400 * 100) / 100;

const t0 = Date.now();
const reads = await Promise.all(files.map(async (f) => {
  const ext = path.extname(f).toLowerCase();
  const image = { type: ext === '.png' ? 'image/png' : 'image/jpeg', data: fs.readFileSync(f).toString('base64') };
  const s = Date.now();
  const msg = await client.messages.create(rosterPhotoRequest(prompt, image, ROSTER_PHOTO_MODEL, effort));
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { file: path.basename(f), sec: (Date.now() - s) / 1000, usage: msg.usage, parsed: parseRosterPhoto(text), raw: text };
}));

let total = 0;
for (const r of reads) {
  total += krw(r.usage);
  console.log(`\n## ${r.file} · ${r.sec.toFixed(1)}초 · 입력 ${r.usage.input_tokens} · 출력 ${r.usage.output_tokens} · ${krw(r.usage)}원`);
  if (!r.parsed) { console.log('  (해석 실패)', r.raw.slice(0, 300)); continue; }
  for (const c of r.parsed.cards) {
    const bad = c.id !== 'none' && !nameById.has(c.id) ? ' ⚠️없는 id' : '';
    console.log(`  ${c.seen} → ${c.id === 'none' ? '(목록 밖)' : nameById.get(c.id) || c.id}${c.treasure ? ' 💎' : ''}${c.sure === false ? ' ?' : ''}${bad}`);
  }
}
console.log(`\n전체 ${((Date.now() - t0) / 1000).toFixed(1)}초 · ${total.toFixed(2)}원 · 효과 ${effort}`);
const out = path.join(ROOT, 'probe-data', `roster-photo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(out, JSON.stringify({ effort, reads }, null, 2));
console.log('저장:', out);
