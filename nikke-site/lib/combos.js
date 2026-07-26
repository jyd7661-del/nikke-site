import { supabase } from './supabaseClient';

// 점수(추천-비추천)순으로 유저 등록 조합을 가져옵니다.
export async function fetchCombos() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('combo_scores')
    .select('*')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchCombos error', error);
    return [];
  }
  return data;
}

// 조합 등록자들의 닉네임을 한 번에 가져와서 매핑합니다.
export async function fetchProfilesByIds(ids) {
  if (!supabase || ids.length === 0) return {};
  const { data, error } = await supabase.from('profiles').select('id, nickname').in('id', ids);
  if (error) {
    console.error('fetchProfilesByIds error', error);
    return {};
  }
  return Object.fromEntries(data.map((p) => [p.id, p.nickname]));
}

export async function fetchMyVotes(userId, comboIds) {
  if (!supabase || !userId || comboIds.length === 0) return {};
  const { data, error } = await supabase
    .from('combo_votes')
    .select('combo_id, value')
    .eq('user_id', userId)
    .in('combo_id', comboIds);
  if (error) {
    console.error('fetchMyVotes error', error);
    return {};
  }
  return Object.fromEntries(data.map((v) => [v.combo_id, v.value]));
}

// 같은 값을 다시 누르면 투표 취소, 다른 값이면 값 변경
export async function voteCombo(userId, comboId, value, currentValue) {
  if (!supabase || !userId) return;
  if (currentValue === value) {
    const { error } = await supabase
      .from('combo_votes')
      .delete()
      .eq('user_id', userId)
      .eq('combo_id', comboId);
    if (error) console.error('voteCombo delete error', error);
    return;
  }
  const { error } = await supabase
    .from('combo_votes')
    .upsert({ user_id: userId, combo_id: comboId, value });
  if (error) console.error('voteCombo upsert error', error);
}

export async function createCombo(userId, { name, purpose, description, members }) {
  if (!supabase || !userId) return { error: 'not_configured' };
  const { error } = await supabase.from('user_combos').insert({
    user_id: userId,
    name,
    purpose,
    description,
    members,
  });
  if (error) console.error('createCombo error', error);
  return { error };
}
