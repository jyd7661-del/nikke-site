'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { fetchCombos, fetchProfilesByIds, fetchMyVotes, voteCombo, updateCombo, deleteCombo } from '@/lib/combos';
import { charMap } from '@/lib/recommend';
import { characterName, localizedCharacter } from '@/lib/characterNames';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import AdSlot from '@/components/AdSlot';
import CharacterAvatar from '@/components/CharacterAvatar';
import { scoreTeam } from '@/lib/synergyEngine';
import { resolveRosterIdsToCdb } from '@/lib/rosterBridge';
import { fetchTranslations } from '@/lib/translate';
import { useLanguage } from '@/components/LanguageProvider';
import TranslationToggle from '@/components/TranslationToggle';

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
  // 조합 수정/삭제. 2026-08-09 추가 — DB 정책(combos_update_own / combos_delete_own)은
  // 처음부터 있었고 화면 버튼과 함수가 없었을 뿐이다.
  const [editingCombo, setEditingCombo] = useState(null);
  const [draft, setDraft] = useState({ name: '', purpose: '', description: '' });
  const [combos, setCombos] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [myVotes, setMyVotes] = useState({});
  const [loading, setLoading] = useState(true);
  const { lang } = useLanguage();
  const [tr, setTr] = useState({});
  const [showOriginal, setShowOriginal] = useState(false);

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
    setTr(await fetchTranslations('combo', list.map((c) => c.id), lang));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, lang]);

  // 번역본이 있고 원문 보기를 누르지 않았을 때만 번역문을 쓴다.
  const shown = (combo, field) => {
    const v = !showOriginal ? tr[combo.id]?.[field] : null;
    return v || combo[field];
  };
  const anyTranslated = combos.some((c) => tr[c.id]);

  const startEditCombo = (combo) => {
    setEditingCombo(combo.id);
    setDraft({ name: combo.name, purpose: combo.purpose || '', description: combo.description || '' });
  };

  const saveCombo = async (comboId) => {
    if (!draft.name.trim()) return;
    const { error } = await updateCombo(user.id, comboId, {
      name: draft.name.trim(),
      purpose: draft.purpose.trim() || null,
      description: draft.description.trim() || null,
    });
    if (error) { alert('수정에 실패했습니다.'); return; }
    setEditingCombo(null);
    load();
  };

  const removeCombo = async (comboId) => {
    // 투표는 DB의 ON DELETE CASCADE가 함께 지운다(lib/combos.js 주석 참고).
    if (!confirm('이 조합을 삭제할까요? 받은 추천/비추천도 함께 사라지며 되돌릴 수 없습니다.')) return;
    const { error } = await deleteCombo(user.id, comboId);
    if (error) { alert('삭제에 실패했습니다.'); return; }
    load();
  };

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
      {anyTranslated && (
        <div className="mb-4 -mt-3">
          <TranslationToggle
            available
            showingOriginal={showOriginal}
            onToggle={() => setShowOriginal((v) => !v)}
          />
        </div>
      )}

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
                {editingCombo === combo.id ? (
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-nikke-accent"
                  />
                ) : (
                  <h3 className="font-semibold">{shown(combo, 'name')}</h3>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {combo.purpose && (
                    <span className="text-xs text-nikke-gold bg-nikke-gold/10 border border-nikke-gold/40 rounded-full px-2 py-0.5">
                      {shown(combo, 'purpose')}
                    </span>
                  )}
                  {/* ⚠️ AiScoreBadge에는 반드시 **원문** purpose를 넘긴다.
                      inferMode()가 '보스'·'아레나' 같은 한국어로 모드를 고르는데, 번역문을
                      넘기면 모드가 조용히 캠페인으로 바뀌어 점수가 달라진다. */}
                  <AiScoreBadge members={combo.members} purpose={combo.purpose} />
                </div>
              </div>
              {editingCombo === combo.id ? (
                <div className="mt-2 space-y-2">
                  <input
                    value={draft.purpose}
                    onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
                    placeholder="용도 (예: 캠페인, 보스전)"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-nikke-accent"
                  />
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="설명"
                    rows={3}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-nikke-accent"
                  />
                  <p className="text-xs text-slate-600">
                    니케 구성은 여기서 바꿀 수 없어요. 멤버를 바꾸려면 새로 등록해주세요.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveCombo(combo.id)}
                      className="text-xs bg-nikke-accent text-slate-900 font-semibold px-3 py-1.5 rounded"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setEditingCombo(null)}
                      className="text-xs border border-slate-700 text-slate-300 px-3 py-1.5 rounded hover:border-slate-500"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                combo.description && <p className="text-sm text-slate-400 mt-1">{shown(combo, 'description')}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {combo.members.map((id) => (
                  <span key={id} className="flex items-center gap-1.5 text-xs bg-slate-800 border border-slate-700 rounded-full pl-1 pr-2.5 py-1">
                    <CharacterAvatar character={localizedCharacter(charMap[id], lang)} size="xs" />
                    {characterName(id, lang)}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  by {nicknames[combo.user_id] || '익명 지휘관'}
                  {user && user.id === combo.user_id && editingCombo !== combo.id && (
                    <>
                      <button
                        onClick={() => startEditCombo(combo)}
                        className="text-[11px] text-slate-500 hover:text-slate-300 underline decoration-dotted"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => removeCombo(combo.id)}
                        className="text-[11px] text-slate-500 hover:text-rose-300 underline decoration-dotted"
                      >
                        삭제
                      </button>
                    </>
                  )}
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
