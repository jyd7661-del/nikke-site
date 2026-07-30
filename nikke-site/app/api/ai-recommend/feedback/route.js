import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// AI가 구성해준 조합에 대해 유저가 👍/👎로 평가한 결과를 저장하는 엔드포인트.
// 여기 쌓인 데이터는 app/api/ai-recommend/route.js에서 "유저 피드백이 좋았던 조합" 힌트로
// 다시 읽혀서 프롬프트에 참고 정보로 들어간다 — AI 모델 자체를 학습/파인튜닝하는 게 아니라,
// 매 요청마다 그때그때 프롬프트에 실어 보내는 방식(RAG)이라는 점은 기존 구조와 동일하다.

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
