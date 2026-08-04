'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { t as translate, LOCALES, DEFAULT_LOCALE } from '@/lib/i18n';

const LanguageContext = createContext({
  lang: DEFAULT_LOCALE,
  setLang: () => {},
  t: (key) => key,
});

// URL 경로(/en, /ja 등)는 바꾸지 않고, localStorage에 저장된 선택값 또는 브라우저 언어를
// 기준으로 화면 문구만 바꿔치기하는 가벼운 다국어 프로바이더. AdSense 심사가 막 시작된
// 시점이라 URL 구조 자체를 바꾸는 건 리스크가 커서 일부러 피했다(lib/i18n.js 주석 참고).
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('nikke-lang') : null;
    if (saved && LOCALES.includes(saved)) {
      setLangState(saved);
      return;
    }
    if (typeof navigator !== 'undefined') {
      const nav = navigator.language || '';
      if (nav.startsWith('ja')) setLangState('ja');
      else if (nav.startsWith('en')) setLangState('en');
    }
  }, []);

  const setLang = (next) => {
    if (!LOCALES.includes(next)) return;
    setLangState(next);
    if (typeof window !== 'undefined') window.localStorage.setItem('nikke-lang', next);
  };

  const t = (key) => translate(key, lang);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
