import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// AI가 구성해준 조합에 대해 유저가 👍/👎로 평가한 결과를 저장하는 엔드포인트.
//
// 2026-08-09 정정: 이 주석은 원래 "여기 쌓인 데이터가 ai-recommend/route.js에서 힌트로 다시
// 읽혀 프롬프트에 들어간다"고 적혀 있었으나, **사실이 아니다.** 전 코드를 grep한 결과 이
// 테이블을 읽는 곳은 한 곳도 없다(쓰기 전용). 지금은 나중에 분석하려고 쌓아두는 기록이다.
// 나중에 읽는 기능을 만든다면 아래 RLS 주의사항을 먼저 볼 것.
//
// ⚠️ RLS: 2026-08-09부터 이 테이블은 **insert 정책만** 열려 있다
// (supabase/ai_recommend_feedback_rls_migration.sql). anon 키로는 읽을 수 없고, 정책 없이
// 읽으려 하면 에러가 아니라 **빈 결과**가 돌아와 조용히 실패한다. 읽는 기능을 추가하려면
// service role 키를 쓰거나 select 정책을 따로 만들어야 한다.

export const runtime = 'nodejs';

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { members, mode, bossElement, formation, rating } = body || {};

  if (!Array.isArray(members) || members.length === 0) {
    return Response.json({ error: '조합 정보가 없습니다.' }, { status: 400 });
  }
  if (!mode) {
    return Response.json({ error: '모드 정보가 없습니다.' }, { status: 400 });
  }
  if (rating !== 'up' && rating !== 'down') {
    return Response.json({ error: 'rating은 up 또는 down이어야 합니다.' }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return Response.json({ error: '피드백 저장 기능이 아직 설정되지 않았습니다.' }, { status: 503 });
  }

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const ipHash = hashIp(getClientIp(req));

    // 같은 사람이 같은 조합에 중복으로 투표를 몰아넣는 걸 완전히 막지는 않지만(로그인 시스템이
    // 없으므로), 최소한의 스팸 억제를 위해 짧은 필드만 저장하고 member 배열은 title/name_kr/burst만 남긴다.
    const cleanMembers = members
      .slice(0, 5)
      .map((m) => ({ title: String(m.title || ''), name_kr: String(m.name_kr || ''), burst: m.burst }))
      .filter((m) => m.title);

    if (cleanMembers.length === 0) {
      return Response.json({ error: '조합 정보가 올바르지 않습니다.' }, { status: 400 });
    }

    const { error } = await supabase.from('ai_recommend_feedback').insert({
      ip_hash: ipHash,
      mode: String(mode),
      boss_element: bossElement || null,
      members: cleanMembers,
      formation: formation || null,
      rating,
    });

    if (error) {
      console.error('ai-recommend feedback insert error', error);
      return Response.json({ error: '피드백 저장 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('ai-recommend feedback error', err);
    return Response.json({ error: '피드백 저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
