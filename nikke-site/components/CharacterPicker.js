'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHARACTERS } from '@/data/characters';
import CharacterAvatar from '@/components/CharacterAvatar';
import { useLanguage } from '@/components/LanguageProvider';
import { characterName, characterSearchText, localizedCharacter } from '@/lib/characterNames';
import { cdbForRosterId } from '@/lib/rosterBridge';
import { effectiveTier } from '@/lib/synergyEngine';

// 카드 오른쪽 위 티어 배지.
//
// 예전에는 data/characters.js에 손으로 적어둔 단일 tier(T0~T3)를 그대로 찍었다. 그 값은
// "2026년 7월 메타 기준"이라 낡았고 **용도 구분이 없어서** 실제 데이터와 크게 어긋났다
// (2026-08-13 유저 지적으로 확인. 155명 대조):
//   배지 T0인데 캠페인·보스전 둘 다 B 이하  12명 (노이즈 D/B/SS, 루마니 D/D/SS, 라푼젤 C/B/SS …)
//   배지 T2·T3인데 어느 모드든 SS 이상       3명 (라플라스: 얼티밋 히어로는 SS/SS/SS인데 T3였다)
//   배지와 DB 티어의 상관계수 캠페인 0.46 / 보스전 0.48 / PvP 0.56 — 어느 모드도 설명하지 못한다
//
// 이제 **지금 고른 용도의 characterDatabase 티어**를 그대로 보여준다. prydwen 출처가 붙은
// A등급 값이고, 추천 점수를 매길 때 엔진이 쓰는 것과 같은 값이라 화면과 결과가 어긋나지 않는다.
const TIER_COLOR = {
  SSS: 'bg-amber-300 text-amber-950',
  SS: 'bg-amber-400 text-amber-950',
  S: 'bg-orange-400 text-orange-950',
  A: 'bg-sky-400 text-sky-950',
  B: 'bg-emerald-400 text-emerald-950',
  C: 'bg-slate-400 text-slate-950',
  D: 'bg-slate-600 text-slate-100',
  E: 'bg-slate-700 text-slate-300',
  F: 'bg-slate-700 text-slate-300',
};

// 티어 문자열 → 정렬용 숫자. characterDatabase.json에 실제로 들어 있는 값은
// SSS / SS / S / A / B / C / D / E / F 아홉 가지다(전수 확인).
// 여기 없는 값이나 빈 값은 0이 되어 맨 뒤로 간다 — 없는 데이터를 중간 어딘가로
// 추정해 끼워 넣지 않는다.
const TIER_RANK = { SSS: 9, SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };

// useLayoutEffect는 서버 렌더에서 경고를 낸다. 이 컴포넌트는 'use client'지만 SSR도 타므로
// 브라우저에서만 레이아웃 훅을 쓰고 서버에서는 아무것도 안 하는 쪽으로 맞춘다.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const BURST_ACCENT = {
  1: 'bg-sky-400',
  2: 'bg-violet-400',
  3: 'bg-rose-400',
};

export default function CharacterPicker({ ownedIds, treasureIds, onToggle, onToggleTreasure, onClear, aiMode }) {
  const { lang, t } = useLanguage();

  // 애장품 표시는 화면 id(characters.js) 기준인데 엔진은 characterDatabase id로 판정한다.
  // 카드마다 Set을 새로 만들면 168번 돌므로 한 번만 변환해 재사용한다.
  const treasureCdbIds = useMemo(() => {
    const s = new Set();
    (treasureIds ? [...treasureIds] : []).forEach((uiId) => {
      const cdb = cdbForRosterId(uiId);
      if (cdb) s.add(cdb.id);
    });
    return s;
  }, [treasureIds]);

  // 이 캐릭터가 지금 용도에서 실제로 받는 등급. 애장품 표시가 반영된다.
  const tierOf = (uiChar) => effectiveTier(cdbForRosterId(uiChar.id), aiMode, treasureCdbIds);

  // 카드가 자리를 옮길 때 미끄러지듯 이동시킨다(FLIP).
  //
  // 애장품을 켜면 티어가 올라가면서 카드가 위로 재정렬되는데, 그냥 두면 "사라졌다가 위에서
  // 갑자기 나타나는" 것처럼 보인다(2026-08-13 유저 지적). 옮기기 직전 위치를 기억해 두고,
  // DOM이 새 위치로 바뀐 직후 이전 위치로 되돌리는 transform을 건 다음 원위치로 풀어 준다.
  // 실제 레이아웃은 이미 끝난 상태라 transform만 움직이므로 리플로우가 없다.
  const cardRefs = useRef(new Map());
  const prevRects = useRef(new Map());

  useIsomorphicLayoutEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const nextRects = new Map();
    cardRefs.current.forEach((el, id) => {
      if (!el || !el.isConnected) return;
      // ⚠️ 위치는 **자기 그리드 컨테이너 기준**으로 기억한다. 여기가 이 애니메이션의
      //    유일한 함정이라 이유를 적어 둔다. FLIP은 "옛 위치 − 새 위치"만큼 되돌렸다가
      //    푸는 방식이라, 기준점이 카드와 함께 움직이지 않으면 **재정렬과 무관한 이동까지
      //    이동량에 섞여** 카드 전체가 미끄러진다. 화면이 당겨지는 것처럼 보이는 정체가 이것이다.
      //
      //    뷰포트 기준(getBoundingClientRect 그대로)이면 → 두 측정 사이의 **스크롤**이 섞인다.
      //      증상: 페이지를 열고 아래로 스크롤해 캐릭터를 찾아 누르면 그 스크롤 거리만큼
      //      카드가 미끄러진다. 두 번째부터는 기억된 위치가 최신이라 멀쩡하다
      //      ("최초 한 번만 그렇다"던 증상의 정체).
      //    문서 기준(+ scrollX/scrollY)이면 스크롤은 빠지지만 → **그리드 위쪽 콘텐츠의
      //      높이 변화**가 섞인다. 💎를 누르면 추천이 다시 돌아 위쪽 결과 패널 높이가 바뀌는데,
      //      그러면 168장 전부가 같은 거리만큼 이동한 것으로 계산돼 그리드가 통째로 미끄러진다.
      //
      //    컨테이너 기준이면 둘 다 상쇄된다. 카드는 자기 그리드 안에서만 자리를 옮기므로
      //    (버스트가 바뀌는 캐릭터는 없다) 이게 정확한 기준계다. 그리드 자체가 어디로
      //    움직이든 카드끼리의 상대 위치가 그대로면 dx=dy=0이라 애니메이션이 아예 안 걸린다.
      const parent = el.parentElement;
      if (!parent) return;
      const r = el.getBoundingClientRect();
      const pr = parent.getBoundingClientRect();
      const rect = { left: r.left - pr.left, top: r.top - pr.top };
      nextRects.set(id, rect);
      const prev = prevRects.current.get(id);
      if (reduceMotion || !prev) return;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (!dx && !dy) return;
      // ⚠️ inline style + requestAnimationFrame 방식은 쓰지 말 것.
      //    "이전 위치로 되돌리는 transform"을 직접 걸고 다음 프레임에 푸는 구조라,
      //    rAF가 안 돌면(백그라운드 탭, 렌더가 멈춘 창) 카드가 되돌린 자리에 그대로 멈춘다.
      //    실제로 그 상태를 재현했다 — 72장 전부 옛 위치에 붙어 재정렬이 아예 안 보였다.
      //    Web Animations API는 인라인 스타일을 남기지 않고(fill 기본값 none) 애니메이션이
      //    실행되지 않아도 요소는 이미 올바른 최종 위치에 있으므로 그런 고장이 없다.
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        // 260ms는 눈으로 따라가기엔 빨라서 순간이동처럼 보인다는 지적이 있어 420ms로 늘렸다.
        // 카드가 화면 절반을 가로지르는 경우가 있어(헬름은 24번째→8번째) 이 정도가 필요하다.
        { duration: 420, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
      );
    });
    prevRects.current = nextRects;
  });
  const [query, setQuery] = useState('');
  const [burstFilter, setBurstFilter] = useState('all');

  const filtered = useMemo(() => {
    return CHARACTERS.filter((c) => {
      if (burstFilter !== 'all' && c.burst !== Number(burstFilter)) return false;
      // 검색은 한/영/일 어느 표기로 쳐도 걸린다(lib/characterNames.js).
      if (query && !characterSearchText(c).includes(query.trim().toLowerCase())) return false;
      return true;
    });
  }, [query, burstFilter]);

  // 카드 정렬은 **화면에서 계산한다.** data/characters.js의 배열 순서에 의존하지 않는다.
  //
  // 예전에는 배열이 손으로 T0~T3 순서로 정렬돼 있었고 배지도 그 값을 찍었다. 배지를 용도별
  // DB 티어로 바꾸자 순서와 배지가 따로 놀았다(SS 다음에 D가 오는 식). 배열을 다시 손으로
  // 정렬하는 건 답이 아니다 — 캐릭터가 계속 추가되고, 용도(캠페인/보스전/PvP)마다 순서가
  // 다르므로 손으로 유지할 수 있는 순서가 애초에 하나로 정해지지 않는다.
  // 그래서 지금 고른 용도의 티어로 매번 내림차순 정렬한다. 새 캐릭터는 데이터만 넣으면
  // 자동으로 제자리에 들어가고, 용도를 바꾸면 순서도 따라 바뀐다.
  const grouped = useMemo(() => {
    const g = { 1: [], 2: [], 3: [] };
    for (const c of filtered) g[c.burst].push(c);
    // 티어 값이 없는 캐릭터는 맨 뒤로. 같은 티어끼리는 원래 배열 순서를 유지한다
    // (Array.prototype.sort는 ES2019부터 안정 정렬이 보장된다).
    for (const b of [1, 2, 3]) {
      g[b].sort((x, y) => (TIER_RANK[tierOf(y)] || 0) - (TIER_RANK[tierOf(x)] || 0));
    }
    return g;
  }, [filtered, aiMode, treasureCdbIds]);

  return (
    <div className="bg-nikke-panel rounded-xl p-5 border border-slate-800/80 shadow-lg shadow-black/20">
      <div className="flex flex-col sm:flex-row gap-3 mb-5 sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-wrap">
          {['all', '1', '2', '3'].map((b) => (
            <button
              key={b}
              onClick={() => setBurstFilter(b)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                burstFilter === b
                  ? 'bg-nikke-accent text-slate-900 border-nikke-accent font-semibold'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-white/5'
              }`}
            >
              {b === 'all' ? t('filter_all') : `${t('burst_short')} ${b}`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('character_search_placeholder')}
            className="bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-nikke-accent transition-colors w-48"
          />
          <button
            onClick={onClear}
            className="px-3 py-1.5 rounded-lg text-sm border border-slate-700 text-slate-300 hover:border-rose-400 hover:text-rose-300 transition-colors"
          >
            {t('clear_selection')}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-1">
        {t('picker_hint')}
      </p>
      {/* 배지가 '지금 고른 용도' 기준이라는 걸 밝힌다. 용도 선택 UI가 이 목록 아래에 있어서
          말해주지 않으면 무슨 기준의 등급인지 알 수 없다. */}
      <p className="text-xs text-slate-600 mb-4">
        {t('tier_badge_hint')(t(`mode_${aiMode}`))}
      </p>

      {[1, 2, 3].map((b) =>
        grouped[b].length === 0 ? null : (
          <div key={b} className="mb-6 last:mb-0">
            <h3 className="text-sm font-semibold text-slate-400 mb-2.5 flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${BURST_ACCENT[b]}`} />
              {t(`burst_label_${b}`)}
            </h3>
            {/* 도감(/nikke)과 같은 열 수로 맞췄다 (2026-08-13). 6열 → 8열.
                10열도 해봤지만 "솔린 : 프로스트…"처럼 알트 이름이 잘려 구분이 안 돼 8열로 되돌렸다. */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {grouped[b].map((c) => {
                const active = ownedIds.has(c.id);
                const hasTreasure = treasureIds?.has(c.id);
                // 2026-08-07 추가: 애장품이 아직 출시되지 않은 캐릭터에도 💎 버튼이 떠서,
                // 실수로 누르면 실제로는 존재하지 않는 "애장품 보유" 상태가 저장되고
                // 결과 화면에 "(애장품)"이 잘못 표시되던 문제. 애장품이 실제로 출시된
                // 캐릭터(data/characters.js의 hasTreasure)에만 버튼을 노출한다.
                const treasureAvailable = !!c.hasTreasure;
                // 💎 버튼을 그릴지 — 이름줄 좌우 칸을 같이 결정하므로 한 곳에서 판단한다
                const treasureSlot = active && treasureAvailable && !!onToggleTreasure;
                // 값이 없으면 배지를 아예 안 그린다 — 없는 데이터를 추정으로 메우지 않는다.
                const tier = tierOf(c);
                return (
                  <button
                    key={c.id}
                    ref={(el) => {
                      // 사라진 카드(검색 필터 등)는 지워서 맵이 계속 커지지 않게 한다
                      if (el) cardRefs.current.set(c.id, el);
                      else cardRefs.current.delete(c.id);
                    }}
                    onClick={() => onToggle(c.id)}
                    className={`card-hover relative flex flex-col rounded-lg overflow-hidden border text-left bg-slate-900/40 ${
                      active
                        ? 'border-nikke-accent ring-2 ring-nikke-accent/50'
                        : 'border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <div className="relative">
                      <CharacterAvatar character={localizedCharacter(c, lang)} shape="portrait" />
                      {tier && (
                        <span
                          title={t(`mode_${aiMode}`)}
                          className={`absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            TIER_COLOR[tier] || 'bg-slate-600 text-slate-100'
                          }`}
                        >
                          {tier}
                        </span>
                      )}
                      {active && (
                        <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-nikke-accent text-slate-900 flex items-center justify-center text-xs font-bold">
                          ✓
                        </span>
                      )}
                      {/*
                        이름 — 아트워크 아래쪽에 **겹쳐서** 아래 정렬로 놓는다.

                        예전에는 이미지 밑에 별도의 칸으로 뒀는데, 그러면 이름이 한 줄이냐
                        두 줄이냐에 따라 카드 높이가 225px / 244px로 갈렸다. 그리드 행 높이는
                        그 행에서 가장 높은 카드를 따라가므로 정렬이 바뀔 때마다 행 높이가
                        들쭉날쭉했고, 세 줄짜리 이름이 생기면 그 행 전체가 길어졌다.
                        min-h로 두 줄을 고정해봤지만 그건 "카드가 세로로 길어지는" 문제를
                        남긴다(2026-08-13 유저 지적).

                        참고로 실측한 두 사이트가 정확히 갈렸다:
                          prydwen.gg — 이름을 카드 안에 position:absolute bottom으로 겹침.
                                       이름이 1·2·3줄이어도 카드 높이는 전부 196px로 균일.
                          nikke.gg   — 겹치지 않고 아래에 쌓음. 카드 높이가 123/126/144/165로 제각각.
                        prydwen 쪽을 택했다.

                        이제 카드 높이 = 이미지 높이(aspect-[3/4])뿐이라 이름 길이와 **구조적으로**
                        무관하다. 매직 넘버(min-h-[55px])도 필요 없어졌다. 긴 이름은 아트워크를
                        조금 더 가릴 뿐 레이아웃을 건드리지 않는다.

                        글자는 위쪽으로 자라므로 아래에서 위로 흐리는 그라데이션을 깔아
                        아트워크 위에서도 읽히게 한다. 세 줄을 넘으면 말줄임하고 title로 전체를 남긴다.
                      */}
                      <span className="absolute inset-x-0 bottom-0 flex items-end gap-1 px-1.5 pt-7 pb-1.5 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent">
                        {/* 💎를 이름줄 오른쪽 칸에 넣고 왼쪽에 같은 폭의 빈 칸을 둬서, 버튼이
                            떠도 이름이 가운데 정렬을 유지하고 서로 겹치지 않게 한다. */}
                        {treasureSlot && <span className="w-6 shrink-0" aria-hidden="true" />}
                        <span
                          // 이름은 font-display(Black Han Sans)에 tracking-wide 였는데, 초굵은 한글
                          // 디스플레이 폰트라 14px에서 획이 붙어 뭉개졌다(2026-08-13 지적).
                          // 기본 산세리프 semibold로 바꾸고 크기를 키웠다. 자간을 넓히면 한글이
                          // 더 읽기 나빠지고 폭도 먹어서 tracking-wide 는 뺐다.
                          title={characterName(c, lang)}
                          className={`flex-1 min-w-0 text-[15px] font-semibold text-center leading-tight line-clamp-3 break-keep drop-shadow-[0_1px_2px_rgba(2,6,23,0.95)] ${
                            active ? 'text-nikke-accent' : 'text-slate-100'
                          }`}
                        >
                          {characterName(c, lang)}
                        </span>
                        {treasureSlot && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTreasure(c.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.stopPropagation();
                                onToggleTreasure(c.id);
                              }
                            }}
                            title={t('treasure_toggle_title')}
                            className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs cursor-pointer transition ${
                              hasTreasure
                                ? 'bg-amber-400 text-amber-950'
                                : 'bg-slate-900/70 text-slate-400 hover:text-amber-300'
                            }`}
                          >
                            💎
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
