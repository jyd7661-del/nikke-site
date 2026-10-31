'use client';

import Link from 'next/link';
import { useLanguage } from './LanguageProvider';

export default function Footer() {
  const { t, lp } = useLanguage();
  return (
    <footer className="border-t border-slate-800/80 mt-16">
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p>{t('footer_fan_site')}</p>
        <div className="flex gap-4">
          {/* 업데이트 소식(2026-10-31)은 서버에서 그린 공개 쪽이다. 크롤러가 찾아 들어갈 길을 모든 쪽에 둔다. */}
          <Link href={lp('/updates')} className="hover:text-slate-300 underline underline-offset-2">
            {t('nav_updates')}
          </Link>
          <Link href={lp('/privacy')} className="hover:text-slate-300 underline underline-offset-2">
            {t('privacy_policy')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
