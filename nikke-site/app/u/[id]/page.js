'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { CHARACTERS, BURST_LABEL } from '@/data/characters';
import CharacterAvatar from '@/components/CharacterAvatar';

// 친구가 공유한 링크(/u/유저ID)로 들어오면 그 유저의 보유 니케를 읽기 전용으로 보여줍니다.
export default function FriendRoster() {
  const { id } = useParams();
  const [ids, setIds] = useState(null);
  const [nickname, setNickname] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('Supabase 연결이 설정되지 않았습니다.');
      return;
    }
    (async () => {
      const [{ data: roster, error: rErr }, { data: profile }] = await Promise.all([
        supabase.from('owned_nikke').select('character_id').eq('user_id', id),
        supabase.from('profiles').select('nickname').eq('id', id).maybeSingle(),
      ]);
      if (rErr) {
        setError('보유 정보를 불러오지 못했습니다.');
        return;
      }
      setIds(new Set(roster.map((r) => r.character_id)));
      setNickname(profile?.nickname || null);
    })();
  }, [id]);

  const owned = ids ? CHARACTERS.filter((c) => ids.has(c.id)) : [];

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-1">{nickname ? `${nickname}님의` : '지휘관님의'} 보유 니케</h1>
      <p className="text-sm text-slate-500 mb-6">공유받은 보유 니케 목록입니다. (읽기 전용)</p>

      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {!error && ids === null && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {!error && ids && owned.length === 0 && (
        <p className="text-slate-500 text-sm">등록된 보유 니케가 없습니다.</p>
      )}

      {[1, 2, 3].map((b) => {
        const list = owned.filter((c) => c.burst === b);
        if (list.length === 0) return null;
        return (
          <div key={b} className="mb-5">
            <h3 className="text-sm font-semibold text-slate-400 mb-2">{BURST_LABEL[b]}</h3>
            <div className="flex flex-wrap gap-2">
              {list.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5 text-xs bg-slate-800 border border-slate-700 rounded-full pl-1 pr-2.5 py-1">
                  <CharacterAvatar character={c} size="xs" />
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      <a href="/" className="inline-block mt-4 text-xs text-nikke-accent underline">
        나도 내 보유 니케로 조합 추천받기 →
      </a>
    </main>
  );
}
