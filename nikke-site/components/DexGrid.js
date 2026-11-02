'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/LanguageProvider';
import { classLabel, elementLabel, corpLabel } from '@/lib/dexLabels';
import { memberName } from '@/lib/memberName';
import { nikkeImageUrl } from '@/lib/nikkeImage';

// 도감 목록(/nikke)의 카드 그리드.
//
// 이름과 속성·클래스·제조사가 전부 한국어로 박혀 있어 언어를 바꿔도 안 바뀌던 자리다
// (2026-08-24 유저 지적: "도감메인창에서 니케 이름 및 정보도 다 한글 고정이야").
//
// 한 화면에 들어오는 인원을 늘리려고 4열 → 8열로 넓혔다(2026-08-13). 카드가 커서 스크롤만
// 길고 정보량이 적다는 지적이 있었다. 모바일에서 8열은 카드가 40px대라 못 쓴다 —
// 화면 폭에 따라 3→4→6→8로 올린다.
//
// 필터·위치 기억(2026-11-02 오전 보고: 11-01 하루 /nikke 로딩 125회 — 상세를 열고 목록으로 돌아오기를 되풀이했다).
// 204명을 매번 맨 위부터 스크롤해야 했다. 버스트·속성·클래스로 좁히고, 고른 값과 스크롤 위치를 이 탭(sessionStorage)에 기억해
// 상세의 "니케 도감" 링크로 돌아와도 보던 자리로 간다. 서버가 그리는 첫 화면은 필터 없이 전원이다(검색엔진이 보는 목록 그대로).
// 이름 검색은 넣지 않았다(검색 페이지는 다시 제안하지 않기로 함).
const FILTER_KEY = 'nikke-dex-filter';
const SCROLL_KEY = 'nikke-dex-scroll';
const BURSTS = ['1', '2', '3'];
const ELEMENTS = ['fire', 'water', 'wind', 'electric', 'iron'];
const CLASSES = ['attacker', 'supporter', 'defender'];
// 유연 버스트(레드 후드 등)는 단계 정보가 엔진 쪽에 있어 여기선 어느 버스트를 골라도 보인다.
const matches = (c, f) => (!f.burst || c.burst === f.burst || c.burstFlex)
  && (!f.element || c.element === f.element) && (!f.cls || c.class === f.cls);

export default function DexGrid({ characters }) {
  const { lang, t, lp } = useLanguage();
  const [f, setF] = useState({ burst: null, element: null, cls: null });

  // 돌아왔을 때: 기억한 필터를 먼저 되살리고, 그려진 뒤 스크롤 위치로 간다.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(FILTER_KEY) || 'null');
      if (saved) setF(saved);
      // 상세를 보고 곧 돌아온 경우만(10분). 한참 뒤 메뉴로 다시 들어오면 맨 위에서 시작한다.
      const [y, at] = (sessionStorage.getItem(SCROLL_KEY) || '0,0').split(',').map(Number);
      if (y > 0 && Date.now() - at < 10 * 60 * 1000) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
      sessionStorage.removeItem(SCROLL_KEY);
    } catch { /* 저장이 막힌 브라우저는 기억 없이 쓴다 */ }
  }, []);
  const pick = (key, v) => {
    const next = { ...f, [key]: f[key] === v ? null : v };
    setF(next);
    try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
  };
  const remember = () => { try { sessionStorage.setItem(SCROLL_KEY, `${window.scrollY},${Date.now()}`); } catch { /* 무시 */ } };

  const shown = characters.filter((c) => matches(c, f));
  const chip = (key, v, label) => (
    <button
      key={v}
      type="button"
      onClick={() => pick(key, v)}
      aria-pressed={f[key] === v}
      className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition ${
        f[key] === v
          ? 'bg-nikke-accent/20 border-nikke-accent text-nikke-accent font-semibold'
          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'
      }`}
    >
      {label}
    </button>
  );
  const filtered = f.burst || f.element || f.cls;

  return (
    <>
      <h1 className="text-3xl font-extrabold text-white mb-2">{t('dex_index_heading')}</h1>
      <p className="text-slate-400 mb-4">{t('dex_index_sub')(characters.length)}</p>
      <div className="space-y-1.5 mb-5" role="group" aria-label={t('dex_filter_label')}>
        <div className="flex flex-wrap gap-1.5">{BURSTS.map((b) => chip('burst', b, `B${b}`))}</div>
        <div className="flex flex-wrap gap-1.5">{ELEMENTS.map((e) => chip('element', e, elementLabel(e, lang)))}</div>
        <div className="flex flex-wrap gap-1.5">{CLASSES.map((c) => chip('cls', c, classLabel(c, lang)))}</div>
        {filtered && (
          <p className="text-xs text-slate-400">
            {t('dex_filter_count')(shown.length)}{' '}
            <button type="button" onClick={() => { setF({ burst: null, element: null, cls: null }); try { sessionStorage.removeItem(FILTER_KEY); } catch { /* 무시 */ } }} className="underline hover:text-slate-200">
              {t('dex_filter_clear')}
            </button>
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {shown.map((c) => {
          const name = memberName(c, lang);
          return (
            <Link
              key={c.id}
              href={lp(`/nikke/${c.id}`)}
              onClick={remember}
              className="rounded-lg bg-slate-800/40 hover:bg-slate-800 p-1.5 transition-colors"
            >
              {/* 신규 캐릭터는 위키에 상반신 초상화(_MI.png)가 올라오기까지 며칠~몇 주 걸린다.
                  img를 그냥 빼면 그 카드만 짧아지는 게 아니다 — 그리드 행 높이는 다른 카드가
                  정하므로 **큰 빈 상자**가 된다. 그래서 같은 비율의 자리표시자를 그린다. */}
              {c.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={nikkeImageUrl(c.img)}
                  alt={name}
                  loading="lazy"
                  className="w-full aspect-[3/4] object-cover rounded bg-slate-800 mb-1.5"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="w-full aspect-[3/4] rounded bg-slate-800 mb-1.5 flex items-center justify-center text-slate-500 text-2xl font-bold"
                >
                  {name?.[0] || '?'}
                </div>
              )}
              <div className="font-bold text-slate-100 text-xs leading-tight break-keep">{name}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                B{c.burst} · {elementLabel(c.element, lang)} · {classLabel(c.class, lang)}
              </div>
              <div className="text-[11px] text-slate-600 leading-tight">
                {corpLabel(c.manufacturer, lang)}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
