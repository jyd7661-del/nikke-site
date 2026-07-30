import { supabase } from './supabaseClient';

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

export async function createPost(userId, { title, content, category }) {
  if (!supabase || !userId) return { error: 'not_configured' };
  const { data, error } = await supabase
    .from('posts')
    .insert({ user_id: userId, title, content, category: category || 'free' })
    .select()
    .single();
  if (error) console.error('createPost error', error);
  return { data, error };
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
  const { error } = await supabase.from('comments').insert({ user_id: userId, post_id: postId, content });
  if (error) console.error('createComment error', error);
  return { error };
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
