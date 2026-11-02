#!/usr/bin/env node
/**
 * **사진으로 보유 니케 넣기(베타) — 올라온 사진과 결과 비교** (2026-11-02)
 *
 *   node scripts/reviewRosterPhotos.mjs                 # 최근 20장
 *   node scripts/reviewRosterPhotos.mjs --since=2026-11-03 --limit=50
 *
 * 유저 지시(11-02): "사람들이 올린 사진과 실제 결과를 비교해서 점점 기능을 개선해 나가는 방향".
 * roster_photo_scans 한 행 = 사진 한 장. 사진은 probe-data/roster-photos/<id>.jpg로 받아 둔다(probe-data는 git 밖) —
 * 표와 사진을 나란히 보고 오답 유형을 찾아 lib/rosterPhotoPrompt.js를 고친다. 고친 뒤에는 그 사진들로
 * scripts/experimentRosterPhoto.mjs를 돌려 전후를 비교한다.
 *
 * 표에서 보는 것
 *   뺌      AI가 넣자고 했는데(체크) 사용자가 뺀 것 → 오인식 후보
 *   확인됨  AI가 확신 없다고 했는데 사용자가 넣은 것 → 맞혔지만 자신 없음
 *   💎±     애장품 판정과 사용자가 넣은 💎의 차이
 *   못 읽음 목록 밖(none) 카드 수 — 사진을 보고 R 등급인지, 놓친 니케인지 가린다
 * 사용자가 「넣기」를 안 누른 사진(확인 없음)은 비교할 정답이 없다 — 사진만 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { CHARACTERS } from '../data/characters.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch { /* 환경변수로도 받는다 */ }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 없음(.env.local)'); process.exit(1); }

const args = process.argv.slice(2);
const arg = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const since = arg('since', '');
const limit = Number(arg('limit', 20));

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const nameById = new Map(CHARACTERS.map((c) => [c.id, c.name]));
const nm = (id) => nameById.get(id) || id;

let q = sb.from('roster_photo_scans').select('*').order('created_at', { ascending: false }).limit(limit);
if (since) q = q.gte('created_at', since);
const { data: rows, error } = await q;
if (error) { console.error(error); process.exit(1); }

const dir = path.join(ROOT, 'probe-data', 'roster-photos');
fs.mkdirSync(dir, { recursive: true });

const tot = { scans: 0, confirmed: 0, cards: 0, removed: 0, unsureKept: 0, unknown: 0, krw: 0 };
for (const r of rows) {
  tot.scans++;
  tot.krw += Number(r.krw || 0);
  let photo = '(사진 없음)';
  if (r.photo_path) {
    const file = path.join(dir, `${r.id}.jpg`);
    if (!fs.existsSync(file)) {
      const { data, error: e } = await sb.storage.from('roster-photos').download(r.photo_path);
      if (!e && data) fs.writeFileSync(file, Buffer.from(await data.arrayBuffer()));
    }
    photo = fs.existsSync(file) ? path.relative(ROOT, file) : '(받기 실패)';
  }
  const cards = r.ai_cards || [];
  const known = cards.filter((c) => c.id && c.id !== 'none' && nameById.has(c.id));
  const unknown = cards.length - known.length;
  tot.cards += cards.length;
  tot.unknown += unknown;
  // 화면과 같은 기준으로 합친다: 어느 조각에서든 확신(구조 다시 찾기 제외)이면 미리 체크됐다
  const sureIds = new Set(known.filter((c) => c.sure !== false && !c.rescued).map((c) => c.id));
  const allIds = new Set(known.map((c) => c.id));
  const aiTreasure = new Set(known.filter((c) => c.treasure).map((c) => c.id));

  console.log(`\n## ${r.created_at.slice(0, 16)} · ${r.lang} · ${r.orientation}(${r.parts}) · ${r.krw}원 · ${Math.round((r.ms || 0) / 100) / 10}초 · ${photo}`);
  console.log(`  AI: 카드 ${cards.length} · 니케 ${allIds.size}(확신 ${sureIds.size}) · 못 읽음 ${unknown}`);
  const unsure = known.filter((c) => c.sure === false || c.rescued);
  if (unsure.length) console.log(`  확신 없음: ${unsure.map((c) => `"${c.seen}"→${nm(c.id)}${c.rescued ? '(조각)' : ''}`).join(' · ')}`);
  const none = cards.filter((c) => !known.includes(c));
  if (none.length) console.log(`  못 읽음: ${none.map((c) => `"${c.seen}"`).join(' · ')}`);
  if (!r.confirmed_at) { console.log('  (사용자 확인 없음)'); continue; }
  tot.confirmed++;
  const conf = new Set(r.confirmed_ids || []);
  const confT = new Set(r.confirmed_treasure || []);
  const removed = [...sureIds].filter((id) => !conf.has(id));
  const unsureKept = [...allIds].filter((id) => !sureIds.has(id) && conf.has(id));
  tot.removed += removed.length;
  tot.unsureKept += unsureKept.length;
  const tPlus = [...confT].filter((id) => !aiTreasure.has(id));
  const tMinus = [...aiTreasure].filter((id) => conf.has(id) && !confT.has(id));
  console.log(`  확인: 넣음 ${conf.size}${removed.length ? ` · 뺌 ${removed.map(nm).join(', ')}` : ''}${unsureKept.length ? ` · 확인됨 ${unsureKept.map(nm).join(', ')}` : ''}`
    + `${tPlus.length ? ` · 💎+ ${tPlus.map(nm).join(', ')}` : ''}${tMinus.length ? ` · 💎- ${tMinus.map(nm).join(', ')}` : ''}`);
}
console.log(`\n합계: 사진 ${tot.scans}장(확인 ${tot.confirmed}) · 카드 ${tot.cards} · 못 읽음 ${tot.unknown} · 뺌 ${tot.removed} · 확신 없음이었는데 넣음 ${tot.unsureKept} · ${Math.round(tot.krw * 100) / 100}원`);
