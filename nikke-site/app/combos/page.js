'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { fetchCombos, fetchProfilesByIds, fetchMyVotes, voteCombo } from '@/lib/combos';
import { charMap } from '@/lib/recommend';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import AdSlot from '@/components/AdSlot';

export default function CombosPage() {
  const { user } = useAuth();
  const [combos, setCombos] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [myVotes, setMyVotes] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const list = await fetchCombos();
    setCombos(list);
    const [profiles, votes] = await Promise.all([
      fetchProfilesByIds([...new Set(list.map((c) => c.user_id))]),
      user ? fetchMyVotes(user.id, list.map((c) => c.id)) : {},
    ]);
    setNicknames(profiles);
    setMyVotes(votes);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleVote = async (comboId, value) => {
    if (!user) {
      alert('투표하려면 로그인이 필요해요. 우측 상단에서 로그인해주세요.');
      return;
    }
    const current = myVotes[comboId];
    await voteCombo(user.id, comboId, value, current);
    load();
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">커뮤니티 조합</h1>
        <Link
          href="/combos/new"
          className="text-xs bg-nikke-accent text-slate-900 font-semibold px-3 py-1.5 rounded"
        >
          + 내 조합 등록
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        유저들이 직접 등록한 조합을 보고 투표해보세요. 투표가 많을수록 위로 올라갑니다.
      </p>

      {!isSupabaseConfigured && (
        <p className="text-sm text-rose-300 mb-6">
          Supabase 연결이 아직 설정되지 않아 커뮤니티 조합 기능을 사용할 수 없습니다. README.md를 참고해주세요.
        </p>
      )}

      <div className="mb-6">
        <AdSlot label="커뮤니티 조합 페이지 광고" size="banner" />
      </div>

      {loading && <p className="text-sm text-slate-500">불러오는 중...</p>}
      {!loading && combos.length === 0 && isSupabaseConfigured && (
        <p className="text-sm text-slate-500">아직 등록된 조합이 없습니다. 첫 조합을 등록해보세요!</p>
      )}

      <div className="space-y-4">
        {combos.map((combo) => {
          const myVote = myVotes[combo.id];
          return (
            <div key={combo.id} className="bg-nikke-panel rounded-xl p-4 border border-slate-800">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-semibold">{combo.name}</h3>
                {combo.purpose && (
                  <span className="text-xs text-nikke-gold bg-nikke-gold/10 border border-nikke-gold/40 rounded-full px-2 py-0.5">
                    {combo.purpose}
                  </span>
                )}
              </div>
              {combo.description && <p className="text-sm text-slate-400 mt-1">{combo.description}</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                {combo.members.map((id) => (
                  <span key={id} className="text-xs bg-slate-800 border border-slate-700 rounded-full px-2.5 py-1">
                    {charMap[id]?.name || id}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-500">
                  by {nicknames[combo.user_id] || '익명 지휘관'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleVote(combo.id, 1)}
                    className={`text-xs px-2 py-1 rounded border ${
                      myVote === 1
                        ? 'bg-nikke-accent text-slate-900 border-nikke-accent'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    👍 추천
                  </button>
                  <span className="text-sm font-semibold w-6 text-center">{combo.score}</span>
                  <button
                    onClick={() => handleVote(combo.id, -1)}
                    className={`text-xs px-2 py-1 rounded border ${
                      myVote === -1
                        ? 'bg-rose-400 text-slate-900 border-rose-400'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    👎 비추천
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
