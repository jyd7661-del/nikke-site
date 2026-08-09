'use client';

import { useEffect, useMemo, useState } from 'react';
import CharacterPicker from '@/components/CharacterPicker';
import ResultPanel from '@/components/ResultPanel';
import AdSlot from '@/components/AdSlot';
import NicknamePrompt from '@/components/NicknamePrompt';
import { recommend } from '@/lib/recommend';
import { resolveRosterIdsToCdb } from '@/lib/rosterBridge';
import { getDataFreshnessMeta } from '@/lib/synergyEngine';
import { useAuth } from '@/components/AuthProvider';
import { useLanguage } from '@/components/LanguageProvider';
import { fetchRoster, addToRoster, removeFromRoster, setTreasure } from '@/lib/roster';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { CHARACTERS } from '@/data/characters';

// 애장품(Treasure)이 실제로 출시된 캐릭터 목록.
// 출처: prydwen.gg 캐릭터 목록에서 "<이름> (Treasure)"로 별도 등재된 항목(2026-08-07 기준 21명).
// data/characters.js의 hasTreasure 플래그가 단일 출처이며, 여기서는 조회용 Set으로만 만든다.
const TREASURE_AVAILABLE_IDS = new Set(CHARACTERS.filter((c) => c.hasTreasure).map((c) => c.id));

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [ownedIds, setOwnedIds] = useState(new Set());
  const [treasureIds, setTreasureIds] = useState(new Set());
  const [showResult, setShowResult] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [aiMode, setAiMode] = useState('campaign');
  // 보스전(솔로 레이드) 모드일 때 상대할 보스의 약점 속성. 지정 안 하면(null) 원소 보정 없이
  // 기존 방식대로만 추천한다. metaStats.soloRaidByElement 키(Iron/Wind/Water/Electronic/Fire)와 일치.
  const [bossElement, setBossElement] = useState(null);
  // 기업 타워 모드에서 어느 타워를 도는지. null이면 일반 트라이브 타워(제조사 제한 없음).
  // lib/synergyEngine.js의 TOWER_CORPS 값('elysion'|'missilis'|'tetra'|'pilgrim')과 일치해야 한다.
  const [tower, setTower] = useState(null);

  // 로그인 상태면 저장된 보유 니케(+애장품 여부)를 불러옵니다.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    setRosterLoading(true);
    fetchRoster(user.id).then((rows) => {
      setOwnedIds(new Set(rows.map((r) => r.id)));
      // 애장품이 실제로 출시된 캐릭터만 인정합니다. 예전에는 모든 캐릭터에 💎 버튼이
      // 떠서, 애장품이 없는 캐릭터(예: 아니스: 스타)에도 보유 표시가 저장될 수 있었고
      // 그 상태가 결과 화면에 "(애장품)"으로 잘못 표시됐습니다. 이미 저장된 잘못된
      // 값은 여기서 걸러냅니다.
      setTreasureIds(
        new Set(rows.filter((r) => r.hasTreasure && TREASURE_AVAILABLE_IDS.has(r.id)).map((r) => r.id))
      );
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
    if (!TREASURE_AVAILABLE_IDS.has(id)) return; // 애장품이 출시되지 않은 캐릭터는 표시 불가
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

  // 보유 로스터를 characterDatabase.json 형태로 변환해 AI 추천 API에 그대로 전달할 원본 데이터로
  // 준비합니다. 예전처럼 규칙 엔진(recommendTeams)이 미리 top-N 조합을 골라두는 게 아니라, AI가
  // 이 로스터 데이터와 공략 근거자료를 직접 보고 조합을 구성합니다
  // (app/api/ai-recommend, components/ResultPanel.js 참고).
  const roster = useMemo(() => {
    if (!showResult) return null;
    const { resolved, unresolved, treasureCdbIds } = resolveRosterIdsToCdb(ownedIds, treasureIds);
    return { resolved, unresolvedCount: unresolved.length, treasureIds: Array.from(treasureCdbIds) };
  }, [showResult, ownedIds, treasureIds]);

  const dataFreshness = useMemo(() => getDataFreshnessMeta(), []);

  const shareUrl = user && typeof window !== 'undefined' ? `${window.location.origin}/u/${user.id}` : null;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-8 pt-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-nikke-accent to-teal-200 bg-clip-text text-transparent">
          {t('home_title')}
        </h1>
        <p className="text-slate-400 mt-2.5 text-sm sm:text-base">
          {t('home_subtitle')}
        </p>
      </header>

      <NicknamePrompt />

      {user && (
        <div className="mb-6 text-xs text-slate-400 flex items-center gap-2 flex-wrap bg-nikke-panel/60 border border-slate-800 rounded-lg px-3 py-2 w-fit">
          <span className="text-emerald-400">●</span>
          <span>{t('logged_in_status')}</span>
          {shareUrl && (
            <button
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="underline decoration-dotted hover:text-nikke-accent"
            >
              {t('share_link_copy')}
            </button>
          )}
        </div>
      )}
      {!user && !authLoading && isSupabaseConfigured && (
        <div className="mb-6 text-xs text-slate-500 bg-nikke-panel/40 border border-slate-800/70 rounded-lg px-3 py-2 w-fit">
          {t('login_hint')}
        </div>
      )}

      <div className="mb-6">
        <AdSlot label={t('top_banner_ad')} size="banner" />
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
          {t('selected_count')(ownedIds.size)}{rosterLoading ? t('loading_suffix') : ''}
        </p>
        <button
          onClick={() => setShowResult(true)}
          className="bg-nikke-accent text-slate-900 font-bold px-5 py-2.5 rounded-lg hover:brightness-110 transition disabled:opacity-40"
          disabled={ownedIds.size === 0}
        >
          {t('get_recommendation')}
        </button>
      </div>

      <ResultPanel
        result={result}
        roster={roster}
        aiMode={aiMode}
        onAiModeChange={setAiMode}
        bossElement={bossElement}
        onBossElementChange={setBossElement}
        tower={tower}
        onTowerChange={setTower}
        dataFreshness={dataFreshness}
      />

      <div className="my-8">
        <AdSlot label={t('bottom_ad')} size="rectangle" />
      </div>

      <section className="bg-gradient-to-br from-nikke-panel to-slate-900/60 rounded-xl p-6 border border-slate-800 text-center">
        <h2 className="font-semibold text-slate-100 mb-1.5">{t('community_title')}</h2>
        <p className="text-sm text-slate-500">
          {t('community_subtitle')}
        </p>
        <div className="flex justify-center gap-3 mt-4">
          <a
            href="/combos"
            className="text-xs bg-nikke-accent text-slate-900 font-semibold px-4 py-2 rounded-lg hover:brightness-110 transition"
          >
            {t('view_combos')}
          </a>
          <a
            href="/board"
            className="text-xs border border-slate-700 px-4 py-2 rounded-lg text-slate-300 hover:border-slate-500 hover:bg-white/5 transition"
          >
            {t('go_board')}
          </a>
        </div>
      </section>

      <footer className="text-center text-xs text-slate-600 mt-10 pb-4">
        {t('footer_disclaimer_1')}
        <br />
        {t('footer_disclaimer_2')}
      </footer>
    </main>
  );
}
