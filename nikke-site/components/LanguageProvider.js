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

  // 선택한 언어를 <html lang="...">에 반영한다 (2026-08-10 추가).
  //
  // app/layout.js는 서버에서 `lang="ko"`로 고정 출력하는데, 이 사이트는 URL을 나누지 않고
  // 화면 문구만 바꾸는 방식이라 언어를 일본어로 바꿔도 그 속성이 그대로 'ko'로 남아 있었다.
  // 그러면:
  //   - 스크린리더가 일본어 본문을 한국어 발음 규칙으로 읽는다
  //   - 브라우저가 "이 한국어 페이지를 번역할까요?"를 일본어 사용자에게 띄운다
  //   - 검색엔진이 언어 신호를 잘못 받는다 (robots/sitemap을 붙인 의미가 줄어든다)
  // 에러가 나지 않아 눈에 안 띄는 종류라 여기서 확실히 맞춰둔다.
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

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
