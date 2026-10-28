'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLanguage } from './LanguageProvider';
import { CONSENT_OPEN_EVENT, inConsentRegion, openConsentSettings, readConsent, saveConsent } from '@/lib/consent';

// 분석 쿠키 동의 배너(2026-10-28). 유럽 시간대에서 처음 왔고 아직 안 골랐을 때만 뜬다(lib/consent.js).
// enabled는 서버(layout)가 정한다 — GA4가 실리지 않는 배포(미리보기·측정 ID 전)에선 물어볼 쿠키가 없다.
// 홈 하단 추천 바(z-30) 위에 뜬다. 고르면 사라지고 다시 안 뜬다.
export default function ConsentBanner({ enabled }) {
  const { t, lp } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!readConsent() && inConsentRegion()) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, [enabled]);

  if (!open) return null;
  const choose = (v) => {
    saveConsent(v);
    setOpen(false);
  };
  return (
    <div role="dialog" aria-live="polite" aria-label={t('consent_title')} className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-nikke-bg/95 backdrop-blur px-4 py-3">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <p className="flex-1 min-w-[16rem]">
          {t('consent_body')}{' '}
          <Link href={lp('/privacy')} className="text-nikke-accent underline underline-offset-2">
            {t('privacy_policy')}
          </Link>
        </p>
        <div className="flex gap-2">
          {/* 거부를 동의만큼 쉽게 — 같은 크기·같은 줄. */}
          <button type="button" onClick={() => choose('denied')} className="rounded-md border border-slate-600 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-800">
            {t('consent_decline')}
          </button>
          <button type="button" onClick={() => choose('granted')} className="rounded-md border border-nikke-accent bg-nikke-accent/20 px-3 py-1.5 font-semibold text-white hover:bg-nikke-accent/30">
            {t('consent_accept')}
          </button>
        </div>
      </div>
    </div>
  );
}

// 개인정보처리방침의 "쿠키 설정" — 고른 값을 다시 고르게 배너를 연다(동의 철회도 동의만큼 쉽게).
export function ConsentSettingsButton() {
  const { t } = useLanguage();
  return (
    <button type="button" onClick={openConsentSettings} className="text-nikke-accent underline underline-offset-2">
      {t('consent_settings')}
    </button>
  );
}
