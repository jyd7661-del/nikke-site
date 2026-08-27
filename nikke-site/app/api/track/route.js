import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { isBot, normalizePath } from '@/lib/traffic';

// 자체 방문 계측 수집기. (2026-08-26)
//
// 두 값을 따로 센다 — 인원수와 페이지 로딩 횟수. 왜 나누는지는
// supabase/traffic_migration.sql 주석 참고(비율이 품질 신호, 로딩 수가 수익 신호).
//
// ⚠️ 이 라우트는 **쓰기 전용**이다. 아무것도 돌려주지 않는다(204).
//    수치는 운영자만 봐야 하므로 조회 경로를 만들지 않는다.

export const runtime = 'nodejs'; // crypto 필요
export const dynamic = 'force-dynamic';

// 경로 판정·봇 판정은 lib/traffic.js에 있다 — DB 없이 검사할 수 있게 떼어냈다.
// (scripts/testTraffic.mjs 참고)

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

// 방문자 식별자. **날짜가 해시에 들어간다** — 하루가 지나면 값이 바뀌어 같은 사람인지
// 이어붙일 수 없다. 원본 IP·UA는 저장하지 않는다.
function visitorHash(ip, ua, date) {
  return crypto.createHash('sha256').update(`${ip}|${ua}|${date}`).digest('hex');
}

export async function POST(req) {
  try {
    const ua = req.headers.get('user-agent') || '';
    if (isBot(ua)) return new Response(null, { status: 204 });

    let body;
    try { body = await req.json(); } catch { return new Response(null, { status: 204 }); }
    const path = normalizePath(body?.path);
    if (!path) return new Response(null, { status: 204 });

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // 키가 없으면 계측만 꺼진다. 화면은 영향받지 않는다.
      return new Response(null, { status: 204 });
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const date = new Date().toISOString().slice(0, 10);
    // 로딩 수와 인원수는 서로 독립이다. 하나가 실패해도 다른 하나는 남긴다.
    const [pv, dv] = await Promise.allSettled([
      supabase.rpc('bump_page_view', { p_path: path, p_date: date }),
      supabase.rpc('record_visitor', { p_hash: visitorHash(clientIp(req), ua, date), p_date: date }),
    ]);
    if (pv.status === 'rejected' || pv.value?.error) console.error('[TRACK] page_views 실패', pv.value?.error || pv.reason);
    if (dv.status === 'rejected' || dv.value?.error) console.error('[TRACK] daily_visitors 실패', dv.value?.error || dv.reason);
  } catch (e) {
    // 계측 실패가 사용자 화면에 영향을 주면 안 된다. 삼키고 204.
    console.error('[TRACK] 예외', e);
  }
  return new Response(null, { status: 204 });
}
