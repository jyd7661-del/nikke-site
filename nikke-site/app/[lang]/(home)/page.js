'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import CharacterPicker from '@/components/CharacterPicker';
import ResultPanel from '@/components/ResultPanel';
import AdSlot from '@/components/AdSlot';
import NicknamePrompt from '@/components/NicknamePrompt';
import { recommend } from '@/lib/recommend';
import { resolveRosterIdsToCdb, STANDARD_SR_IDS, rosterIdForCdbId, cdbForRosterId } from '@/lib/rosterBridge';
import { memberName } from '@/lib/memberName';
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
  const { lang, t, lp } = useLanguage();
  // 2026-10-08: 상시 모집 SR(lib/rosterBridge STANDARD_SR_IDS)은 처음부터 보유로 골라 둔다(유저 요청 — 사실상 누구나 가졌다). 해제 가능.
  const [ownedIds, setOwnedIds] = useState(() => new Set(STANDARD_SR_IDS));
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
  // 도감 "이 니케 포함 조합" 버튼으로 왔을 때(`?with=<도감 id>`, 2026-10-23) 반드시 넣을 니케의 UI id.
  // 보유 목록에 없어도 이번 추천에만 넣는다 — 뽑을지 고민하며 도감을 보는 사람도 있어서 보유 목록(저장)은 건드리지 않는다.
  // 애장품: 보유 목록에 있으면 그 💎 상태를 그대로 쓰고, 없으면 **없음이 기본**이다. 애장품 전제 조합(랭커 기록·prydwen requiresTreasure)은
  //   애장품이 있어야만 후보가 되므로, 있다고 가정하면 못 쓰는 조합을 추천하게 된다. 대신 배너에 토글을 바로 보인다.
  const [includeId, setIncludeId] = useState(null);
  const [includeTreasure, setIncludeTreasure] = useState(false);
  useEffect(() => {
    try {
      const w = new URLSearchParams(window.location.search).get('with');
      const id = w ? rosterIdForCdbId(w) : null;
      if (id) setIncludeId(id);
    } catch { /* 주소를 못 읽으면 포함 조건 없이 */ }
  }, []);
  const includeChar = includeId ? cdbForRosterId(includeId) : null;
  const includeOwned = includeId ? ownedIds.has(includeId) : false;
  const includeHasTreasure = includeOwned ? treasureIds.has(includeId) : includeTreasure;
  const clearInclude = () => {
    setIncludeId(null);
    setIncludeTreasure(false);
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* 주소만 못 고칠 뿐 */ }
  };

  // 로그인 상태면 저장된 보유 니케(+애장품 여부)를 불러옵니다.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    setRosterLoading(true);
    fetchRoster(user.id).then((rows) => {
      const ids = new Set(rows.map((r) => r.id));
      // 로그인 사용자는 저장된 보유 목록이 정본이다. 다만 상시 SR을 **하나도** 안 가진 목록(대개 SR이 화면에 없던 09-15 이전에 만든 것)이면
      // 한 번 채워 저장한다. 그 뒤 사용자가 해제한 것은 다시 채우지 않는다(SR이 하나라도 남아 있으면 건드리지 않음).
      if (!STANDARD_SR_IDS.some((id) => ids.has(id))) {
        STANDARD_SR_IDS.forEach((id) => { ids.add(id); addToRoster(user.id, id); });
      }
      setOwnedIds(ids);
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
    // 포함 니케가 보유 목록에 없으면 이번 계산에만 더한다(애장품은 배너 토글 값).
    const extra = includeId && !ownedIds.has(includeId);
    const ids = extra ? new Set([...ownedIds, includeId]) : ownedIds;
    const tIds = extra && includeTreasure && TREASURE_AVAILABLE_IDS.has(includeId) ? new Set([...treasureIds, includeId]) : treasureIds;
    const { resolved, unresolved, treasureCdbIds } = resolveRosterIdsToCdb(ids, tIds);
    return {
      resolved,
      unresolvedCount: unresolved.length,
      treasureIds: Array.from(treasureCdbIds),
      // 엔진이 이 니케가 든 후보만 고른다(app/api/ai-recommend requireTitles).
      requireTitle: includeId ? cdbForRosterId(includeId)?.title || null : null,
    };
  }, [showResult, ownedIds, treasureIds, includeId, includeTreasure]);

  const dataFreshness = useMemo(() => getDataFreshnessMeta(), []);

  // 추천 버튼은 카드 200장 아래(모바일 약 9,800px)에 있어 처음 온 사람은 버튼이 있는 줄도 모른다(2026-10-24 실측).
  // 버튼 줄이 화면 아래쪽에 가려져 있는 동안만 하단 고정 바를 띄운다 — 이미 지나 결과를 보는 중이면 숨긴다.
  const actionRowRef = useRef(null);
  const [actionRowBelow, setActionRowBelow] = useState(false);
  useEffect(() => {
    const el = actionRowRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      setActionRowBelow(!e.isIntersecting && e.boundingClientRect.top > 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const recommendFromBar = () => {
    setShowResult(true);
    // 상단 고정 헤더가 모바일에선 두 줄(약 165px)이라 그 높이만큼 비켜 세운다.
    const el = actionRowRef.current;
    if (!el) return;
    const head = document.querySelector('header.sticky')?.getBoundingClientRect().height || 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - head - 12, behavior: 'smooth' });
  };

  const shareUrl = user && typeof window !== 'undefined' ? `${window.location.origin}/u/${user.id}` : null;

  return (
    // 도감(/nikke)과 같은 폭. 캐릭터 카드가 200장 가까이라 좁으면 스크롤만 길어진다 (2026-08-13)
    <main className="max-w-7xl mx-auto px-4 py-8">
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

      {includeChar && (
        <div className="mb-4 rounded-lg border border-nikke-accent/40 bg-nikke-accent/10 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-slate-100 font-semibold">{t('include_banner')(memberName(includeChar, lang))}</span>
            {TREASURE_AVAILABLE_IDS.has(includeId) && (
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHasTreasure}
                  onChange={() => (includeOwned ? toggleTreasure(includeId) : setIncludeTreasure((v) => !v))}
                  className="accent-nikke-accent"
                />
                💎 {t('include_treasure')}
              </label>
            )}
            <button onClick={clearInclude} className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-200">
              {t('include_clear')}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {includeOwned ? t('include_hint') : t('include_not_owned')}
          </p>
        </div>
      )}

      <CharacterPicker
        ownedIds={ownedIds}
        treasureIds={treasureIds}
        onToggle={toggle}
        onToggleTreasure={toggleTreasure}
        onClear={clear}
        // 카드의 티어 배지를 지금 고른 용도 기준으로 그리기 위해 넘긴다.
        // 용도 선택 UI는 아래 ResultPanel에 있고 상태는 여기(page)가 들고 있다.
        aiMode={aiMode}
      />

      <div ref={actionRowRef} className="flex items-center justify-between mt-5 mb-6">
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

      {actionRowBelow && ownedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-700 bg-nikke-bg/95 backdrop-blur px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-slate-300">{t('selected_count')(ownedIds.size)}</p>
            <button
              onClick={recommendFromBar}
              className="bg-nikke-accent text-slate-900 font-bold px-5 py-2.5 rounded-lg hover:brightness-110 transition"
            >
              {t('get_recommendation')}
            </button>
          </div>
        </div>
      )}

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
            href={lp('/combos')}
            className="text-xs bg-nikke-accent text-slate-900 font-semibold px-4 py-2 rounded-lg hover:brightness-110 transition"
          >
            {t('view_combos')}
          </a>
          <a
            href={lp('/board')}
            className="text-xs border border-slate-700 px-4 py-2 rounded-lg text-slate-300 hover:border-slate-500 hover:bg-white/5 transition"
          >
            {t('go_board')}
          </a>
        </div>
      </section>

      {/* 원래 이 슬롯은 CharacterPicker 위(첫 화면)에 있었다. 2026-08-13 애드센스가
          "게시자 콘텐츠가 없는 화면에 Google 게재 광고"로 정책 위반 판정을 냈는데,
          미게재 상태에서 첫 화면이 빈 광고 영역으로 시작하는 것이 그 사유에 해당한다.
          맨 아래로 내려 콘텐츠 뒤에만 광고가 오게 했다. 추천받기 버튼 바로 옆·아래는
          오클릭 유발로 또 다른 정책 위험이라 일부러 피했다. */}
      <div className="my-8">
        <AdSlot label={t('footer_ad')} size="banner" />
      </div>

      <footer className="text-center text-xs text-slate-600 mt-10 pb-4">
        {t('footer_disclaimer_1')}
        <br />
        {t('footer_disclaimer_2')}
      </footer>
    </main>
  );
}
