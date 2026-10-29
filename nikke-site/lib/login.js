'use client';

import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { safeReturnPath } from '@/lib/loginReturn';

// 구글 로그인 + 로그인 뒤 보던 페이지로 돌아오기 (2026-10-29, 유저 "개선점 진행해" — 현황 보고 "게시판으로 가는 길").
//
// 전에는 로그인하면 늘 첫 화면(/)에 떨어졌다. 게시판에서 "글쓰기"를 하려고 로그인한 사람이 홈에서 길을 다시 찾아야 했다.
// redirectTo 는 그대로 origin 이다 — 경로를 붙이면 Supabase Redirect URLs 허용 목록에 그 주소가 없을 때 로그인이 깨진다
// (docs/ops.md 8번). 대신 떠나기 전 경로를 sessionStorage 에 적고, 돌아와 SIGNED_IN 이 오면 AuthProvider 가 그리로 보낸다.
const RETURN_KEY = 'nikke-login-return';

export async function signInWithGoogle(t) {
  if (!isSupabaseConfigured) {
    alert(t('supabase_not_configured'));
    return;
  }
  try {
    const here = window.location.pathname + window.location.search;
    if (here !== '/') sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path: here, at: Date.now() }));
  } catch {
    // 저장이 막힌 브라우저는 예전처럼 첫 화면으로 돌아온다.
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
  });
  if (error) alert(error.message);
}

// 돌아갈 경로를 한 번만 꺼낸다. 판정은 lib/loginReturn.js(우리 사이트 안의 경로 · 10분 안).
export function takeLoginReturn() {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RETURN_KEY);
    return safeReturnPath(raw, Date.now());
  } catch {
    return null;
  }
}
