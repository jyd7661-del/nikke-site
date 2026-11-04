'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/components/LanguageProvider';

// 쪽 오류 화면 (2026-11-04). 유저: 크라운 도감을 누르니 "Application error: a client-side exception".
// 원인은 배포 어긋남이었다. 배포 전에 열어 둔 탭의 옛 코드가 새 서버 자료를 받아서 멈췄다.
// 옛 DexRelations가 지운 prop(alternatives.length)을 읽었다. 새로고침하면 새 코드라 열린다.
// → 처음 난 오류는 한 번 자동으로 새로고침한다. 1분 안에 또 나면 진짜 오류이므로 버튼만 보여 준다.
const KEY = 'nikke-error-reload-at';

export default function Error({ error }) {
  const { t } = useLanguage();

  useEffect(() => {
    console.error(error);
    try {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {}
  }, [error]);

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-slate-300">{t('page_error_msg')}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-lg bg-nikke-accent px-4 py-2 text-sm font-semibold text-white"
      >
        {t('page_error_retry')}
      </button>
    </main>
  );
}
