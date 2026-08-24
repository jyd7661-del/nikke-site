'use client';

import Link from 'next/link';
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
export default function DexGrid({ characters }) {
  const { lang, t } = useLanguage();

  return (
    <>
      <h1 className="text-3xl font-extrabold text-white mb-2">{t('dex_index_heading')}</h1>
      <p className="text-slate-400 mb-6">{t('dex_index_sub')(characters.length)}</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {characters.map((c) => {
          const name = memberName(c, lang);
          return (
            <Link
              key={c.id}
              href={`/nikke/${c.id}`}
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
