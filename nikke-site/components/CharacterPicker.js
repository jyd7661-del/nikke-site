'use client';

import { useMemo, useState } from 'react';
import { CHARACTERS } from '@/data/characters';
import CharacterAvatar from '@/components/CharacterAvatar';
import { useLanguage } from '@/components/LanguageProvider';
import { characterName, characterSearchText, localizedCharacter } from '@/lib/characterNames';
import { cdbForRosterId } from '@/lib/rosterBridge';
import { MODE_TO_TIER_KEY } from '@/lib/synergyEngine';

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

const BURST_ACCENT = {
  1: 'bg-sky-400',
  2: 'bg-violet-400',
  3: 'bg-rose-400',
};

export default function CharacterPicker({ ownedIds, treasureIds, onToggle, onToggleTreasure, onClear, aiMode }) {
  const { lang, t } = useLanguage();
  // 지금 고른 용도에 해당하는 티어 키. 엔진과 같은 표를 쓰므로 둘이 어긋날 수 없다.
  const tierKey = MODE_TO_TIER_KEY[aiMode] || 'story';
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

  const grouped = useMemo(() => {
    const g = { 1: [], 2: [], 3: [] };
    for (const c of filtered) g[c.burst].push(c);
    return g;
  }, [filtered]);

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
                // 값이 없으면 배지를 아예 안 그린다 — 없는 데이터를 추정으로 메우지 않는다.
                const tier = cdbForRosterId(c.id)?.tiers?.[tierKey] || null;
                return (
                  <button
                    key={c.id}
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
                      {active && treasureAvailable && onToggleTreasure && (
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
                          className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs cursor-pointer transition ${
                            hasTreasure
                              ? 'bg-amber-400 text-amber-950'
                              : 'bg-slate-900/70 text-slate-400 hover:text-amber-300'
                          }`}
                        >
                          💎
                        </span>
                      )}
                    </div>
                    <span
                      // 이름은 font-display(Black Han Sans)에 tracking-wide 였는데, 초굵은 한글
                      // 디스플레이 폰트라 14px에서 획이 붙어 뭉개졌다(2026-08-13 지적).
                      // 기본 산세리프 semibold로 바꾸고 크기를 키웠다. 자간을 넓히면 한글이
                      // 더 읽기 나빠지고 폭도 먹어서 tracking-wide 는 뺐다.
                      // 한 줄 고정(truncate)이면 "솔린 : 프로스트 …"처럼 알트를 구분하는 부분이
                      // 잘린다(15px에서 168명 중 28명). 두 줄까지 허용한다.
                      className={`relative px-1.5 py-2 text-[15px] font-semibold text-center leading-tight line-clamp-2 break-keep transition-colors border-t ${
                        active
                          ? 'text-nikke-accent bg-gradient-to-b from-nikke-accent/10 to-slate-900/90 border-nikke-accent/50'
                          : 'text-slate-200 bg-gradient-to-b from-slate-800/50 to-slate-900/90 border-slate-700/60'
                      }`}
                    >
                      {characterName(c, lang)}
                    </span>
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
