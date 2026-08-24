'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { memberName } from '@/lib/memberName';

// 도감 상세 맨 아래, 추천 도구로 보내는 퍼널. 이 페이지의 최종 목적이다.
// 문구에 캐릭터 이름이 들어가므로 이름도 언어를 따라가야 한다.
export default function DexCta({ character }) {
  const { lang, t } = useLanguage();
  return (
    <div className="rounded-xl bg-nikke-accent/10 border border-nikke-accent/30 p-5 text-center">
      <p className="text-slate-200 mb-3">{t('dex_cta_text')(memberName(character, lang))}</p>
      <Link
        href="/"
        className="inline-block rounded-lg bg-nikke-accent px-5 py-2.5 font-bold text-slate-900 hover:opacity-90"
      >
        {t('dex_cta_button')}
      </Link>
    </div>
  );
}
