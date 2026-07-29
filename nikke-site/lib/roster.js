import { supabase } from './supabaseClient';

// 보유 니케 목록을 { id, hasTreasure } 형태로 반환합니다.
// (owned_nikke 테이블에 has_treasure 컬럼이 없다면 supabase/schema.sql의 마이그레이션 SQL을 먼저 실행해주세요.)
export async function fetchRoster(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('owned_nikke')
    .select('character_id, has_treasure')
    .eq('user_id', userId);
  if (error) {
    console.error('fetchRoster error', error);
    return [];
  }
  return data.map((r) => ({ id: r.character_id, hasTreasure: Boolean(r.has_treasure) }));
}

export async function addToRoster(userId, characterId) {
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from('owned_nikke')
    .upsert({ user_id: userId, character_id: characterId });
  if (error) console.error('addToRoster error', error);
}

export async function removeFromRoster(userId, characterId) {
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from('owned_nikke')
    .delete()
    .eq('user_id', userId)
    .eq('character_id', characterId);
  if (error) console.error('removeFromRoster error', error);
}

// 보유중인 캐릭터의 애장품(Treasure) 장착 여부를 저장합니다.
export async function setTreasure(userId, characterId, hasTreasure) {
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from('owned_nikke')
    .upsert({ user_id: userId, character_id: characterId, has_treasure: hasTreasure });
  if (error) console.error('setTreasure error', error);
}

export async function fetchProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('fetchProfile error', error);
    return null;
  }
  return data;
}

export async function saveNickname(userId, nickname) {
  if (!supabase || !userId) return;
  const { error } = await supabase.from('profiles').upsert({ id: userId, nickname });
  if (error) console.error('saveNickname error', error);
}
