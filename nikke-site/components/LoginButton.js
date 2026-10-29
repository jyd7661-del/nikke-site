'use client';

import { useLanguage } from './LanguageProvider';
import { signInWithGoogle } from '@/lib/login';

// 로그인이 필요한 자리에 바로 두는 구글 로그인 버튼(2026-10-29). 전에는 "로그인 후 글쓰기 가능" 같은 회색 글자만 있어서
// 헤더의 로그인 버튼을 찾아야 했다. 로그인 뒤에는 이 페이지로 돌아온다(lib/login.js).
export default function LoginButton({ label, className = '' }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => signInWithGoogle(t)}
      className={`inline-flex items-center justify-center gap-1.5 bg-white text-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold hover:brightness-95 transition ${className}`}
    >
      <GoogleMark />
      {label || t('login_google')}
    </button>
  );
}

export function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.4 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.8" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.900l-.4.03-6.8 5.2-.1.4C7.8 40.9 15.3 46 24 46" />
      <path fill="#FBBC05" d="M11.5 27.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l0-.5-6.9-5.3-.2.1C2.8 15.6 2 19.2 2 23s.8 7.4 2.4 10.3z" />
      <path fill="#EA4335" d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.4 29.9 1 24 1 15.3 1 7.8 6.1 4.4 13.7l7.1 5.5C13.3 13.3 18.2 9.5 24 9.5" />
    </svg>
  );
}
