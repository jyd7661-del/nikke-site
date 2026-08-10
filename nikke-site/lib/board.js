import { supabase } from './supabaseClient';
import { detectLang } from './i18n';
import { requestTranslation } from './translate';

export const BOARD_CATEGORIES = [
  { key: 'free', label: '자유' },
  { key: 'bug', label: '버그 제보' },
  { key: 'suggestion', label: '건의사항' },
];

export async function fetchPosts(category) {
  if (!supabase) return [];
  let query = supabase.from('posts').select('*').order('created_at', { ascending: false });
  if (category && category !== 'all') {
    query = query.eq('category', category);
  }
  const { data, error } = await query;
  if (error) {
    console.error('fetchPosts error', error);
    return [];
  }
  return data;
}

export async function fetchPost(id) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('posts').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('fetchPost error', error);
    return null;
  }
  return data;
}

// 비밀글 기본값: 버그 제보만 true. (supabase/board_private_posts_migration.sql 참고)
// 버그 제보에는 계정 정보·스크린샷이 섞이기 쉬워 기본 보호하되, 작성자가 해제할 수 있다.
export function defaultPrivateFor(category) {
  return category === 'bug';
}

export async function createPost(userId, { title, content, category, isPrivate }) {
  if (!supabase || !userId) return { error: 'not_configured' };
  const cat = category || 'free';
  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      title,
      content,
      category: cat,
      is_private: typeof isPrivate === 'boolean' ? isPrivate : defaultPrivateFor(cat),
      // 글자를 보고 판별한다. 화면 언어 설정은 믿지 않는다(lib/i18n.js의 detectLang 주석 참고).
      source_lang: detectLang(`${title}\n${content}`),
    })
    .select()
    .single();
  if (error) console.error('createPost error', error);
  // 번역은 기다리지 않는다. 실패해도 글 등록은 성공이고, 번역본이 없으면 원문이 그대로 보인다.
  if (data?.id) requestTranslation('post', data.id);
  return { data, error };
}

// ---------------------------------------------------------------------------
// 수정 / 삭제 (2026-08-09 추가)
//
// 유저 제보: "게시판이랑 조합 올리는 곳이 수정·삭제가 안 된다."
// 원인은 권한이 아니었다 — DB 정책(posts_update_own / posts_delete_own)은 처음부터
// auth.uid() = user_id 조건으로 정상 설정돼 있었고, **함수와 화면 버튼이 없었을 뿐**이다.
//
// 아래 함수들은 user_id 조건을 명시적으로 한 번 더 건다. RLS가 이미 막아주지만,
// 조건을 빠뜨린 쿼리가 "0건 수정"으로 조용히 성공하는 것보다 코드에서 의도가 드러나는 편이 낫다.
// ---------------------------------------------------------------------------
export async function updatePost(userId, postId, { title, content, category, isPrivate }) {
  if (!supabase || !userId) return { error: 'not_configured' };
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (content !== undefined) patch.content = content;
  if (category !== undefined) patch.category = category;
  if (isPrivate !== undefined) patch.is_private = isPrivate;
  // 본문을 고쳤으면 언어도 다시 본다. 한국어 글을 영어로 새로 쓰는 경우가 있다.
  const textChanged = title !== undefined || content !== undefined;
  if (textChanged) patch.source_lang = detectLang(`${title ?? ''}\n${content ?? ''}`);
  const { error } = await supabase.from('posts').update(patch).eq('id', postId).eq('user_id', userId);
  if (error) console.error('updatePost error', error);
  // 본문이 바뀌었으면 번역을 다시 만든다. 안 바뀌었으면 서버가 src_hash로 걸러 AI를 부르지 않는다.
  if (!error && textChanged) requestTranslation('post', postId);
  return { error };
}

export async function deletePost(userId, postId) {
  if (!supabase || !userId) return { error: 'not_configured' };
  // 댓글은 지우지 않는다 — comments_post_id_fkey가 ON DELETE CASCADE라 글을 지우면 DB가 함께
  // 지운다(2026-08-09 확인). 오히려 앱에서 먼저 지우려 하면 comments_delete_own 정책 때문에
  // **내가 쓴 댓글만** 지워지고 남의 댓글은 조용히 남아, "지웠는데 왜 안 지워졌지"가 된다.
  // 캐스케이드는 RLS를 거치지 않으므로 남의 댓글까지 정상적으로 정리된다.
  const { error } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', userId);
  if (error) console.error('deletePost error', error);
  return { error };
}

export async function updateComment(userId, commentId, content) {
  if (!supabase || !userId) return { error: 'not_configured' };
  const { error } = await supabase
    .from('comments')
    .update({ content, source_lang: detectLang(content) })
    .eq('id', commentId).eq('user_id', userId);
  if (error) console.error('updateComment error', error);
  if (!error) requestTranslation('comment', commentId);
  return { error };
}

export async function deleteComment(userId, commentId) {
  if (!supabase || !userId) return { error: 'not_configured' };
  const { error } = await supabase.from('comments').delete().eq('id', commentId).eq('user_id', userId);
  if (error) console.error('deleteComment error', error);
  return { error };
}

export async function fetchComments(postId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchComments error', error);
    return [];
  }
  return data;
}

export async function createComment(userId, postId, content) {
  if (!supabase || !userId) return { error: 'not_configured' };
  // 번역하려면 방금 만든 댓글의 id가 필요해서 select().single()을 붙였다(2026-08-09).
  const { data, error } = await supabase
    .from('comments')
    .insert({ user_id: userId, post_id: postId, content, source_lang: detectLang(content) })
    .select()
    .single();
  if (error) console.error('createComment error', error);
  if (data?.id) requestTranslation('comment', data.id);
  return { data, error };
}

export async function fetchProfilesByIds(ids) {
  if (!supabase || ids.length === 0) return {};
  const { data, error } = await supabase.from('profiles').select('id, nickname').in('id', ids);
  if (error) {
    console.error('fetchProfilesByIds error', error);
    return {};
  }
  return Object.fromEntries(data.map((p) => [p.id, p.nickname]));
}
