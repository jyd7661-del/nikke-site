import { supabase } from './supabaseClient';


// =============================================================================
// 번역 요청 (클라이언트 쪽) — 2026-08-09
//
// 글을 쓰거나 고칠 때 /api/translate 를 불러 나머지 언어 번역본을 만들어 둔다.
// =============================================================================


/**
 * 번역을 요청한다. **결과를 기다리지 않는다.**
 *
 * 기다리게 만들면 한국어 사용자가 자기는 보지도 않을 번역 때문에 글 등록에서 몇 초를
 * 더 기다리게 된다. 대신 keepalive 를 켜서, 등록 직후 화면을 옮겨도 요청이 끊기지 않게 한다
 * (본문은 안 보내고 id 만 보내므로 keepalive 의 크기 제한에 걸리지 않는다).
 *
 * 실패해도 글 작성 자체는 성공이다. 번역본이 없으면 화면은 원문을 그대로 보여준다.
 * 다만 조용히 넘어가지는 않는다 — 콘솔에 남기고, 서버는 content_translations 에
 * status='failed' 로 흔적을 남긴다(HANDOFF §2-3).
 */
export async function requestTranslation(entityType, entityId) {
  if (!supabase || !entityId) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return; // 로그인 상태에서만 부를 수 있다 (API도 401로 막는다)
    const res = await fetch('/api/translate', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entityType, entityId }),
    });
    if (!res.ok) console.warn('[translate] 번역 요청 실패', res.status, await res.text().catch(() => ''));
  } catch (e) {
    console.warn('[translate] 번역 요청 중 오류', e);
  }
}

/**
 * 여러 글의 번역본을 한 번에 가져온다(목록 화면용).
 * 반환: { [entityId]: fields }
 *
 * 원본이 안 보이는 글의 번역본은 RLS가 알아서 걸러낸다
 * (supabase/content_translations_migration.sql 참고).
 */
export async function fetchTranslations(entityType, ids, lang) {
  if (!supabase || !ids?.length || !lang) return {};
  const { data, error } = await supabase
    .from('content_translations')
    .select('entity_id, fields, status')
    .eq('entity_type', entityType)
    .eq('lang', lang)
    .eq('status', 'done')
    .in('entity_id', ids);
  if (error) {
    console.error('fetchTranslations error', error);
    return {};
  }
  return Object.fromEntries((data || []).map((r) => [r.entity_id, r.fields || {}]));
}
