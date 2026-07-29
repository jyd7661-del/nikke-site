'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { fetchCombos, fetchProfilesByIds, fetchMyVotes, voteCombo } from '@/lib/combos';
import { charMap } from '@/lib/recommend';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import AdSlot from '@/components/AdSlot';
import CharacterAvatar from '@/components/CharacterAvatar';
import { scoreTeam } from '@/lib/synergyEngine';
import { resolveRosterIdsToCdb } from '@/lib/rosterBridge';

// 조합의 purpose 문구로 어떤 모드(캠페인/보스전/PvP) 기준으로 채점할지 대략 추정합니다.
function inferMode(purpose) {
  if (!purpose) return 'campaign';
  if (/pvp|아레나|경쟁/i.test(purpose)) return 'pvp';
  if (/보스|레이드|인터셉트/i.test(purpose)) return 'bossing';
  return 'campaign';
}

// 유저가 등록한 조합을 lib/synergyEngine.js의 scoreTeam으로 채점해 "AI 신뢰도 점수" 배지를 붙여줍니다.
// characterDatabase.json에 상세 데이터가 없는 캐릭터가 섞여 있으면 배지를 표시하지 않습니다.
function AiScoreBadge({ members, purpose }) {
  const { resolved, unresolved } = resolveRosterIdsToCdb(members);
  if (resolved.length === 0 || unresolved.length > 0) return null;
  const mode = inferMode(purpose);
  const result = scoreTeam(resolved, mode);
  return (
    <span
      title={result.reasons?.join(' / ')}
      className={`text-xs rounded-full px-2 py-0.5 border ${
        result.valid
          ? 'text-nikke-accent bg-nikke-accent/10 border-nikke-accent/40'
          : 'text-amber-300 bg-amber-400/10 border-amber-400/40'
      }`}
    >
      🤖 AI 점수 {result.totalScore}
      {!result.valid && ' · 버스트 구성 확인 필요'}
    </span>
  );
}

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
          className="text-xs bg-nikke-accent text-slate-900 font-semibold px-3 py-1.5 rounded-lg hover:brightness-110 transition"
        >
          + 내 조합 등록
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        유저들이 직접 등록한 조합을 보고 투표해보세요. 투표가 많을수록 위로 올라갑니다. 🤖 AI 점수는 캐릭터 성능
        데이터와 공략 근거자료를 기준으로 자동 채점한 참고용 점수입니다.
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
            <div key={combo.id} className="card-hover bg-nikke-panel rounded-xl p-4 border border-slate-800">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-semibold">{combo.name}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {combo.purpose && (
                    <span className="text-xs text-nikke-gold bg-nikke-gold/10 border border-nikke-gold/40 rounded-full px-2 py-0.5">
                      {combo.purpose}
                    </span>
                  )}
                  <AiScoreBadge members={combo.members} purpose={combo.purpose} />
                </div>
              </div>
              {combo.description && <p className="text-sm text-slate-400 mt-1">{combo.description}</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                {combo.members.map((id) => (
                  <span key={id} className="flex items-center gap-1.5 text-xs bg-slate-800 border border-slate-700 rounded-full pl-1 pr-2.5 py-1">
                    <CharacterAvatar character={charMap[id]} size="xs" />
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
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      myVote === 1
                        ? 'bg-nikke-accent text-slate-900 border-nikke-accent'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-white/5'
                    }`}
                  >
                    👍 추천
                  </button>
                  <span className="text-sm font-semibold w-6 text-center">{combo.score}</span>
                  <button
                    onClick={() => handleVote(combo.id, -1)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      myVote === -1
                        ? 'bg-rose-400 text-slate-900 border-rose-400'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-white/5'
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
