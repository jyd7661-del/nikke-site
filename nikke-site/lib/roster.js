import { supabase } from './supabaseClient';

export async function fetchRoster(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('owned_nikke')
    .select('character_id')
    .eq('user_id', userId);
  if (error) {
    console.error('fetchRoster error', error);
    return [];
  }
  return data.map((r) => r.character_id);
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
