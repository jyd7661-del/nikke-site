'use client';

import Link from 'next/link';
import { useLanguage } from './LanguageProvider';

export default function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-slate-800/80 mt-16">
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p>{t('footer_fan_site')}</p>
        <Link href="/privacy" className="hover:text-slate-300 underline underline-offset-2">
          {t('privacy_policy')}
        </Link>
      </div>
    </footer>
  );
}
