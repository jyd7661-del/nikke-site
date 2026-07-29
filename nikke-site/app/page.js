'use client';

import { useEffect, useMemo, useState } from 'react';
import CharacterPicker from '@/components/CharacterPicker';
import ResultPanel from '@/components/ResultPanel';
import AdSlot from '@/components/AdSlot';
import NicknamePrompt from '@/components/NicknamePrompt';
import { recommend } from '@/lib/recommend';
import { recommendTeams } from '@/lib/synergyEngine';
import { resolveRosterIdsToCdb } from '@/lib/rosterBridge';
import { useAuth } from '@/components/AuthProvider';
import { fetchRoster, addToRoster, removeFromRoster, setTreasure } from '@/lib/roster';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [ownedIds, setOwnedIds] = useState(new Set());
  const [treasureIds, setTreasureIds] = useState(new Set());
  const [showResult, setShowResult] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [aiMode, setAiMode] = useState('campaign');
  // 보스전(솔로 레이드) 모드일 때 상대할 보스의 약점 속성. 지정 안 하면(null) 원소 보정 없이
  // 기존 방식대로만 추천한다. metaStats.soloRaidByElement 키(Iron/Wind/Water/Electronic/Fire)와 일치.
  const [bossElement, setBossElement] = useState(null);

  // 로그인 상태면 저장된 보유 니케(+애장품 여부)를 불러옵니다.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    setRosterLoading(true);
    fetchRoster(user.id).then((rows) => {
      setOwnedIds(new Set(rows.map((r) => r.id)));
      setTreasureIds(new Set(rows.filter((r) => r.hasTreasure).map((r) => r.id)));
      setRosterLoading(false);
    });
  }, [user, authLoading]);

  const toggle = (id) => {
    setOwnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (user) removeFromRoster(user.id, id);
      } else {
        next.add(id);
        if (user) addToRoster(user.id, id);
      }
      return next;
    });
    // 보유 해제 시 애장품 상태도 함께 초기화합니다.
    setTreasureIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleTreasure = (id) => {
    if (!ownedIds.has(id)) return; // 보유중인 캐릭터만 애장품 표시 가능
    setTreasureIds((prev) => {
      const next = new Set(prev);
      const has = next.has(id);
      if (has) next.delete(id);
      else next.add(id);
      if (user) setTreasure(user.id, id, !has);
      return next;
    });
  };

  const clear = () => {
    if (user && ownedIds.size > 0) {
      // 로그인 상태에서는 하나씩 지우는 게 안전하지만, 간단히 로컬만 초기화합니다.
      ownedIds.forEach((id) => removeFromRoster(user.id, id));
    }
    setOwnedIds(new Set());
    setTreasureIds(new Set());
    setShowResult(false);
  };

  const result = useMemo(() => (showResult ? recommend(ownedIds) : null), [showResult, ownedIds]);

  // 규칙 기반 스코어링 엔진(lib/synergyEngine.js) 결과.
  // characterDatabase.json 상세 데이터가 있는 캐릭터만 분석 대상에 포함되며,
  // 애장품(Treasure) 표시를 해둔 캐릭터는 data/treasureEffects.json의 효과가 함께 반영됩니다.
  // 보스전 모드에서 bossElement를 지정하면 metaStats.soloRaidByElement 실사용 데이터가
  // 추가로 반영됩니다(엔진 내부에서 mode !== 'bossing'/'raid'일 때는 무시됨).
  const aiResult = useMemo(() => {
    if (!showResult) return null;
    const { resolved, unresolved, treasureCdbIds } = resolveRosterIdsToCdb(ownedIds, treasureIds);
    const engineResult = recommendTeams(resolved, aiMode, { topN: 3, treasureIds: treasureCdbIds, bossElement });
    return { ...engineResult, unresolvedCount: unresolved.length };
  }, [showResult, ownedIds, treasureIds, aiMode, bossElement]);

  const shareUrl = user && typeof window !== 'undefined' ? `${window.location.origin}/u/${user.id}` : null;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-8 pt-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-nikke-accent to-teal-200 bg-clip-text text-transparent">
          내 니케로 최고의 조합 찾기
        </h1>
        <p className="text-slate-400 mt-2.5 text-sm sm:text-base">
          보유중인 니케를 선택하면 바로 조합을 추천해드려요. 로그인 없이도 바로 사용할 수 있어요.
        </p>
      </header>

      <NicknamePrompt />

      {user && (
        <div className="mb-6 text-xs text-slate-400 flex items-center gap-2 flex-wrap bg-nikke-panel/60 border border-slate-800 rounded-lg px-3 py-2 w-fit">
          <span className="text-emerald-400">●</span>
          <span>로그인 상태 — 보유 니케가 자동 저장됩니다.</span>
          {shareUrl && (
            <button
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="underline decoration-dotted hover:text-nikke-accent"
            >
              친구에게 공유 링크 복사
            </button>
          )}
        </div>
      )}
      {!user && !authLoading && isSupabaseConfigured && (
        <div className="mb-6 text-xs text-slate-500 bg-nikke-panel/40 border border-slate-800/70 rounded-lg px-3 py-2 w-fit">
          로그인하면 보유 니케가 자동 저장되고, 친구와 공유할 수 있어요. (로그인 안 해도 추천 기능은 바로 사용 가능)
        </div>
      )}

      <div className="mb-6">
        <AdSlot label="상단 배너 광고" size="banner" />
      </div>

      <CharacterPicker
        ownedIds={ownedIds}
        treasureIds={treasureIds}
        onToggle={toggle}
        onToggleTreasure={toggleTreasure}
        onClear={clear}
      />

      <div className="flex items-center justify-between mt-5 mb-6">
        <p className="text-sm text-slate-400">
          선택한 니케: {ownedIds.size}명{rosterLoading ? ' (불러오는 중...)' : ''}
        </p>
        <button
          onClick={() => setShowResult(true)}
          className="bg-nikke-accent text-slate-900 font-bold px-5 py-2.5 rounded-lg hover:brightness-110 transition disabled:opacity-40"
          disabled={ownedIds.size === 0}
        >
          조합 추천받기
        </button>
      </div>

      <ResultPanel
        result={result}
        aiResult={aiResult}
        aiMode={aiMode}
        onAiModeChange={setAiMode}
        bossElement={bossElement}
        onBossElementChange={setBossElement}
      />

      <div className="my-8">
        <AdSlot label="본문 하단 광고" size="rectangle" />
      </div>

      <section className="bg-gradient-to-br from-nikke-panel to-slate-900/60 rounded-xl p-6 border border-slate-800 text-center">
        <h2 className="font-semibold text-slate-100 mb-1.5">💬 유저들과 조합·정보 나누기</h2>
        <p className="text-sm text-slate-500">
          내가 쓰는 조합을 직접 등록하고 투표받거나, 게시판에서 다른 지휘관들과 이야기해보세요.
        </p>
        <div className="flex justify-center gap-3 mt-4">
          <a
            href="/combos"
            className="text-xs bg-nikke-accent text-slate-900 font-semibold px-4 py-2 rounded-lg hover:brightness-110 transition"
          >
            커뮤니티 조합 보기
          </a>
          <a
            href="/board"
            className="text-xs border border-slate-700 px-4 py-2 rounded-lg text-slate-300 hover:border-slate-500 hover:bg-white/5 transition"
          >
            게시판 가기
          </a>
        </div>
      </section>

      <footer className="text-center text-xs text-slate-600 mt-10 pb-4">
        본 사이트는 팬 제작 비공식 정보 사이트이며, 승리의 여신: 니케의 저작권은 시프트업(SHIFT UP)에 있습니다.
        <br />
        조합 정보는 커뮤니티 공략을 참고해 정리한 자료로 실제 게임 밸런스와 다를 수 있습니다.
      </footer>
    </main>
  );
}
