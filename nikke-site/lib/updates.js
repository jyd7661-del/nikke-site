// 업데이트 소식 — 서버에서 읽는 쪽 (2026-10-31, 유저: "업데이트 내용을 착실하게 쌓아보자")
//
// 왜 따로 두나: 게시판(/board/[id])은 브라우저에서 글을 불러와 그린다. 크롤러가 주소를 열면 본문이 0줄이고,
// 비밀글 때문에 사이트맵에서도 뺐다(app/sitemap.js). 그래서 매주 올리는 업데이트 글이 사이트 콘텐츠로 쌓이지 않았다.
// 업데이트 분류는 운영자만 쓸 수 있으니(supabase/board_update_category_migration.sql) 이 분류만 서버에서 그려 공개한다.
//
// ⚠️ anon 키로 읽는다 — RLS(posts_select_visible)가 그대로 걸려 비밀글은 여기로 올 수 없다. is_private=false도 한 번 더 건다.
//    service role 키를 쓰면 RLS를 건너뛰어 비밀글이 새는 길이 생긴다. 쓰지 말 것.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = url && anon ? createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
// 키가 없으면 목록이 조용히 비어 보인다(이 PC의 .env.local에는 anon 키가 없다 — Vercel에는 있다). 빌드 로그에 한 줄 남긴다.
if (!db) console.warn('[updates] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 없음 — 업데이트 소식이 빈 목록으로 그려진다');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUpdateId = (id) => UUID.test(String(id || ''));

const COLS = 'id, title, content, created_at';

export async function fetchUpdates() {
  if (!db) return [];
  const { data, error } = await db.from('posts').select(COLS)
    .eq('category', 'update').eq('is_private', false)
    .order('created_at', { ascending: false });
  if (error) { console.error('[updates] 목록 실패', error); return []; }
  return data || [];
}

export async function fetchUpdate(id) {
  if (!db || !isUpdateId(id)) return null;
  const { data, error } = await db.from('posts').select(COLS)
    .eq('id', id).eq('category', 'update').eq('is_private', false).maybeSingle();
  if (error) { console.error('[updates] 글 실패', error); return null; }
  return data;
}

// 번역본 { [id]: { title, content } }. 한국어는 원문이라 부르지 않는다. 번역이 없거나 안 끝난 글은 빠진다.
export async function fetchUpdateTranslations(ids, lang) {
  if (!db || !ids.length || lang === 'ko') return {};
  const { data, error } = await db.from('content_translations').select('entity_id, fields')
    .eq('entity_type', 'post').eq('lang', lang).eq('status', 'done').in('entity_id', ids);
  if (error) { console.error('[updates] 번역 실패', error); return {}; }
  return Object.fromEntries((data || []).map((r) => [r.entity_id, r.fields || {}]));
}

// 화면에 쓸 글: 번역이 있으면 번역, 없으면 원문(한국어). translated로 검색 노출 여부를 정한다.
export function localizeUpdate(post, tr) {
  if (tr?.title && tr?.content) return { ...post, title: tr.title, content: tr.content, translated: true };
  return { ...post, translated: false };
}

// 화면 라벨 — 서버 컴포넌트라 클라이언트 i18n(lib/i18n.js t)을 못 써 여기 둔다. page.js는 Next 규칙상 임의 export를 두지 않는다.
const L = {
  ko: { title: '업데이트 소식', desc: '니케 조합 추천 사이트에 바뀐 것을 매주 모아 둔 기록입니다. 추천 엔진, 데이터 갱신, 화면 변경을 날짜순으로 정리합니다.', empty: '아직 올라온 소식이 없습니다.', more: '자세히 보기', board: '게시판에서 댓글 달기' },
  en: { title: 'Site Updates', desc: 'A weekly log of what changed on the NIKKE team recommendation site — engine changes, data refreshes and screen updates, newest first.', empty: 'No updates yet.', more: 'Read more', board: 'Comment on the board' },
  ja: { title: 'アップデート情報', desc: 'NIKKE編成おすすめサイトの変更点を毎週まとめた記録です。推薦エンジン、データ更新、画面の変更を新しい順に並べています。', empty: 'まだお知らせはありません。', more: '続きを読む', board: '掲示板でコメントする' },
};
export const lab = (lang) => L[lang] || L.ko;
