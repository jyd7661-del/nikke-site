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
    // 저장된 선택이 없으면 **브라우저 언어**를 따라간다.
    //
    // 2026-09-16 수정: 예전에는 navigator.language(대표 언어) 하나만 봤다. 그래서 1순위가
    // 우리가 지원하지 않는 언어인 사람(예: zh-CN → en-US 순)이 전부 한국어를 받았다.
    // navigator.languages는 **선호 순서대로 늘어선 전체 목록**이라, 지원하는 언어가
    // 나올 때까지 훑으면 그 사람이 실제로 원하는 언어에 가장 가깝게 맞출 수 있다.
    //
    // ⚠️ 국가(IP)가 아니라 언어로 판단하는 게 맞다. 일본에 사는 한국인은 한국어 브라우저를
    //    쓰고 한국어 화면을 원한다 — 국가로 정하면 그 사람에게 일본어가 나간다.
    //    브라우저 언어는 사용자가 직접 정한 값이라 더 정확한 신호다.
    // 🔴 **검색봇에는 자동 선택을 하지 않는다** (2026-09-19).
    //
    // 구글봇은 자바스크립트를 실행한 뒤의 화면을 색인하는데, 그 브라우저의 언어가 영어(en-US)다.
    // 그래서 아래 자동 선택이 구글봇에게 **사이트 전체를 영어로 바꿔 보여주고 있었다.**
    // 구글 리치 결과 테스트로 확인(2026-09-19, /nikke/crown): 서버 HTML은 lang="ko"·한국어인데
    // 구글이 렌더링한 결과는 `<html lang="en">` + 제목(h1) "Crown". 구글 눈에 이 사이트가
    // 영어 사이트로 보이니 한국어 검색에서 밀린다. 유저가 "갑자기 검색이 안 된다"고 해서 찾았다.
    // 구글도 로케일 기반 자동 전환을 크롤러에 하지 말라고 권한다(구글봇은 언어 선호 없이 크롤링한다).
    //
    // 봇에게는 기본값(한국어) 그대로 둔다. 사람에게 보이는 기본 화면과 같은 내용이라 클로킹이 아니다.
    // 국내 검색도 챙긴다 — 네이버는 Yeti, 다음은 Daum.
    const BOT_UA = /bot|crawl|spider|slurp|yeti|daum|lighthouse|headlesschrome|google-inspectiontool|googleother|mediapartners|adsbot/i;
    if (typeof navigator !== 'undefined' && BOT_UA.test(navigator.userAgent || '')) return;
    if (typeof navigator !== 'undefined') {
      const prefs = Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages
        : [navigator.language || ''];
      for (const p of prefs) {
        const code = String(p).toLowerCase().split('-')[0];
        if (LOCALES.includes(code)) { setLangState(code); return; }
      }
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
