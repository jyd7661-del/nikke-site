'use client';

import { createContext, useContext, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { t as translate, LOCALES, DEFAULT_LOCALE } from '@/lib/i18n';
import { localePath, splitLocale, swapLocale } from '@/lib/locale';

const LanguageContext = createContext({
  lang: DEFAULT_LOCALE,
  setLang: () => {},
  t: (key) => key,
  lp: (path) => path,
});

// ■ 2026-09-19 — **언어는 주소가 정한다.**
//
// 예전에는 주소가 하나였고 localStorage 선택값·브라우저 언어로 **화면 문구만** 바꿨다. 그러자
// 구글봇(브라우저 언어 en-US)에게 사이트 전체가 영어로 렌더링돼 한국어 검색이 떨어졌다
// (docs/log/2026-09.md "구글에게 사이트가 영어로 보이고 있었다"). 이제 언어는 주소의 일부다:
//   /nikke/crown(한국어) · /en/nikke/crown(영어) · /ja/nikke/crown(일본어)
// 루트 레이아웃(app/[lang]/layout.js)이 주소의 언어를 `lang` prop으로 넘기고, 서버가 처음부터
// 그 언어로 렌더링한다. 여기서 화면 언어를 클라이언트가 몰래 바꾸는 일은 **없다.**
//
// 언어를 바꾸면 같은 페이지의 그 언어 주소로 **이동한다**(setLang).
export function LanguageProvider({ lang: urlLang, children }) {
  const lang = LOCALES.includes(urlLang) ? urlLang : DEFAULT_LOCALE;
  const pathname = usePathname();
  const router = useRouter();

  // ■ 처음 들어온 사람에게만, 한 번만 — 원하는 언어의 주소로 보내 준다.
  //
  // 조건을 좁게 둔다:
  //   · **한국어 주소(접두어 없음)로 들어왔을 때만.** /en·/ja 주소는 누가 그 언어를 골라 준 링크라 그대로 둔다.
  //   · 저장된 선택(언어 버튼을 누른 적)이 있으면 그것을, 없으면 브라우저 선호 언어 목록(navigator.languages)을
  //     순서대로 훑어 지원하는 언어를 찾는다. 1순위가 zh-CN이고 2순위가 en-US면 영어로 간다.
  //   · 한 세션에 한 번. 한국어로 돌아가려고 누른 사람을 다시 끌고 가지 않는다(버튼이 'ko'를 저장한다).
  //   · 🔴 **검색봇에게는 절대 안 한다.** 구글봇 브라우저 언어가 en-US라, 이걸 봇에게 하면 한국어 주소를
  //     영어로 보내 버린다. 국내 검색도 챙긴다 — 네이버 Yeti, 다음 Daum.
  // ⚠️ 국가(IP)가 아니라 언어로 판단한다. 일본에 사는 한국인은 한국어 브라우저를 쓴다.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const BOT_UA = /bot|crawl|spider|slurp|yeti|daum|lighthouse|headlesschrome|google-inspectiontool|googleother|mediapartners|adsbot/i;
    if (BOT_UA.test(navigator.userAgent || '')) return;
    if (lang !== DEFAULT_LOCALE) return;
    let saved = null;
    let done = false;
    try {
      saved = window.localStorage.getItem('nikke-lang');
      done = window.sessionStorage.getItem('nikke-lang-auto') === '1';
      window.sessionStorage.setItem('nikke-lang-auto', '1');
    } catch { /* 사생활 모드 등 — 자동 이동을 안 하면 그만이다 */ }
    if (done) return;
    let want = LOCALES.includes(saved) ? saved : null;
    if (!want) {
      const prefs = Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages : [navigator.language || ''];
      for (const p of prefs) {
        const code = String(p).toLowerCase().split('-')[0];
        if (LOCALES.includes(code)) { want = code; break; }
      }
    }
    if (want && want !== lang) router.replace(swapLocale(pathname || '/', want));
    // 첫 진입에만 판단한다 — 이후 페이지 이동마다 다시 보지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 클라이언트 이동으로 언어가 바뀌면 <html lang>도 맞춘다. 서버는 이미 주소 언어로 내보낸다.
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (next) => {
    if (!LOCALES.includes(next)) return;
    try { window.localStorage.setItem('nikke-lang', next); } catch { /* 무시 */ }
    if (next === lang) return;
    router.push(swapLocale(pathname || '/', next));
  };

  const t = (key) => translate(key, lang);
  // 내부 링크를 지금 언어의 주소로(lp = locale path). lp('/nikke') → 영어 페이지에선 '/en/nikke'
  const lp = (path) => localePath(lang, path);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, lp }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// 지금 주소에서 언어 접두어를 뗀 경로. 메뉴의 "지금 여기" 표시 등에 쓴다.
export function useBarePath() {
  return splitLocale(usePathname() || '/').path;
}
