'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { memberName } from '@/lib/memberName';

// 도감 상세 맨 아래, 추천 도구로 보내는 퍼널. 이 페이지의 최종 목적이다.
// 문구에 캐릭터 이름이 들어가므로 이름도 언어를 따라가야 한다.
// 2026-10-23: 문구는 "○○ 포함 조합"인데 링크가 첫 화면뿐이라 일반 추천이 나왔다(유저: "직관적으로는 이 니케 포함 조합을 해야").
//   `?with=<도감 id>`를 넘기면 첫 화면이 그 니케를 포함 조건으로 걸고 엔진은 그 니케가 든 후보만 고른다(requireTitles).
export default function DexCta({ character }) {
  const { lang, t, lp } = useLanguage();
  return (
    <div className="rounded-xl bg-nikke-accent/10 border border-nikke-accent/30 p-5 text-center">
      <p className="text-slate-200 mb-3">{t('dex_cta_text')(memberName(character, lang))}</p>
      <Link
        href={`${lp('/')}?with=${encodeURIComponent(character.id)}`}
        className="inline-block rounded-lg bg-nikke-accent px-5 py-2.5 font-bold text-slate-900 hover:opacity-90"
      >
        {t('dex_cta_button')}
      </Link>
    </div>
  );
}
