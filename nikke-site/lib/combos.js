import { supabase } from './supabaseClient';
import { detectLang } from './i18n';
import { requestTranslation } from './translate';

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
  // 번역하려면 방금 만든 조합의 id가 필요해서 select().single()을 붙였다(2026-08-09).
  const { data, error } = await supabase
    .from('user_combos')
    .insert({
      user_id: userId,
      name,
      purpose,
      description,
      members,
      source_lang: detectLang(`${name}\n${purpose || ''}\n${description || ''}`),
    })
    .select()
    .single();
  if (error) console.error('createCombo error', error);
  if (data?.id) requestTranslation('combo', data.id);
  return { data, error };
}

// ---------------------------------------------------------------------------
// 수정 / 삭제 (2026-08-09 추가)
//
// board.js와 같은 사정이다 — DB 정책(combos_update_own / combos_delete_own)은 있었고
// 함수와 버튼이 없었을 뿐이다.
// ---------------------------------------------------------------------------
export async function updateCombo(userId, comboId, { name, purpose, description, members }) {
  if (!supabase || !userId) return { error: 'not_configured' };
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (purpose !== undefined) patch.purpose = purpose;
  if (description !== undefined) patch.description = description;
  if (members !== undefined) patch.members = members;
  const textChanged = name !== undefined || purpose !== undefined || description !== undefined;
  if (textChanged) patch.source_lang = detectLang(`${name ?? ''}\n${purpose ?? ''}\n${description ?? ''}`);
  const { error } = await supabase.from('user_combos').update(patch).eq('id', comboId).eq('user_id', userId);
  if (error) console.error('updateCombo error', error);
  // 글이 바뀌었으면 번역을 다시 만든다. 안 바뀌었으면 서버가 src_hash로 걸러 AI를 부르지 않는다.
  if (!error && textChanged) requestTranslation('combo', comboId);
  return { error };
}

export async function deleteCombo(userId, comboId) {
  if (!supabase || !userId) return { error: 'not_configured' };
  // 투표는 지우지 않는다 — combo_votes_combo_id_fkey가 ON DELETE CASCADE라 조합을 지우면 DB가
  // 함께 지운다(2026-08-09 확인). 앱에서 먼저 지우려 하면 votes_delete_own 정책 때문에
  // **내 투표만** 지워지고 남의 투표는 남아 외래키 위반으로 조합 삭제가 실패한다.
  const { error } = await supabase.from('user_combos').delete().eq('id', comboId).eq('user_id', userId);
  if (error) console.error('deleteCombo error', error);
  return { error };
}
