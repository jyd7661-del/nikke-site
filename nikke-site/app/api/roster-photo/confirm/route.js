import { createClient } from '@supabase/supabase-js';
import { CHARACTERS } from '@/data/characters';

// 사진으로 보유 니케 넣기 — 사용자가 확인하고 「넣기」를 누른 목록을 그 사진 행에 남긴다(2026-11-02, 베타).
// AI가 읽은 것(ai_cards)과 이것의 차이가 오답이다 — scripts/reviewRosterPhotos.mjs가 비교한다.
// scanId는 추측할 수 없는 uuid이고, 한 번 채운 행은 다시 고치지 않는다(confirmed_at is null 조건).

export const runtime = 'nodejs';

const VALID_IDS = new Set(CHARACTERS.map((c) => c.id));
const json = (body, status = 200) => Response.json(body, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const scanId = String(body?.scanId || '');
  if (!UUID.test(scanId)) return json({ error: 'bad_request' }, 400);
  const clean = (a) => (Array.isArray(a) ? [...new Set(a.filter((id) => VALID_IDS.has(id)))].slice(0, 300) : []);
  const ids = clean(body?.ids);
  const treasure = clean(body?.treasure).filter((id) => ids.includes(id));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: 'unavailable' }, 503);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.from('roster_photo_scans')
    .update({ confirmed_ids: ids, confirmed_treasure: treasure, confirmed_at: new Date().toISOString() })
    .eq('id', scanId).is('confirmed_at', null);
  if (error) { console.error('[ROSTER_PHOTO] 확인 기록 실패', error); return json({ error: 'failed' }, 500); }
  return json({ ok: true });
}
