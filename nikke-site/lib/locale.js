// 언어별 주소 — 한 사이트 안에서 한국어 / 영어 / 일본어를 **주소로** 나눈다 (2026-09-19).
//
// ■ 왜 주소를 나누는가
//   예전에는 주소가 하나이고, 브라우저에 저장된 선택값이나 브라우저 언어로 **화면 문구만** 바꿨다.
//   그러자 구글봇(브라우저 언어 en-US)에게 사이트 전체가 영어로 렌더링돼, 구글이 이 사이트를
//   영어 사이트로 기억했다 — 한국어 검색이 떨어졌다(docs/log/2026-09.md "구글에게 사이트가 영어로").
//   언어마다 주소가 따로 있으면 각 주소가 처음부터 자기 언어로 렌더링되고, hreflang으로 서로를
//   "같은 내용의 언어별 판"이라고 알려줄 수 있다. 위키·공략 사이트들이 쓰는 정석이다.
//
// ■ 규칙
//   한국어  = 접두어 없음   /nikke/crown        ← 기존 주소 그대로(검색 순위를 안 건드린다)
//   영어    = /en           /en/nikke/crown
//   일본어  = /ja           /ja/nikke/crown
//   내부적으로는 전부 app/[lang]/… 아래에 있고, 접두어 없는 주소는 next.config.js의 rewrites가
//   /ko/…로 넘긴다(함수 호출 없이 라우팅 계층에서 처리 — 방문당 비용 0). /ko/…로 직접 오면 308로 되돌린다.
//
// ⚠️ 이 파일은 아무것도 import하지 않는다(i18n.js의 LOCALES만) — 서버·클라이언트·node 스크립트 어디서나 쓴다.

import { LOCALES, DEFAULT_LOCALE } from './i18n';

export { LOCALES, DEFAULT_LOCALE };

export const isLocale = (v) => LOCALES.includes(v);

// 언어 + 언어 없는 경로 → 실제 주소. localePath('en', '/nikke') → '/en/nikke', localePath('ko', '/nikke') → '/nikke'
export function localePath(lang, path = '/') {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!isLocale(lang) || lang === DEFAULT_LOCALE) return p;
  return p === '/' ? `/${lang}` : `/${lang}${p}`;
}

// 실제 주소 → { lang, path }. 접두어가 없으면 한국어. '/en/nikke' → { lang:'en', path:'/nikke' }
// ⚠️ 내부 경로 '/ko/…'가 들어와도(서버 렌더 중 usePathname 등) 한국어로 푼다.
export function splitLocale(pathname = '/') {
  const m = String(pathname).match(/^\/(ko|en|ja)(?=\/|$)(.*)$/);
  if (!m) return { lang: DEFAULT_LOCALE, path: pathname || '/' };
  return { lang: m[1], path: m[2] || '/' };
}

// 지금 주소를 다른 언어의 같은 페이지로. '/en/nikke/crown' + 'ja' → '/ja/nikke/crown'
export const swapLocale = (pathname, next) => localePath(next, splitLocale(pathname).path);

// ■ 영어·일본어판을 검색에 내보내는(색인시키는) 페이지
//   번역이 끝난 곳만 넣는다. 본문이 한국어뿐인 페이지(가이드·개인정보처리방침·게시판 글)를
//   /en 주소로 색인시키면 "영어 주소에 한국어 본문"이 되어 오히려 해가 된다 — 이번 사고와 같은 종류다.
//   그 페이지들도 /en·/ja 주소로 **열리기는** 한다(화면 틀은 번역돼 있고 언어를 바꿔도 길을 잃지 않게).
//   다만 noindex + canonical을 한국어판으로 둔다.
export function isLocalizedForSearch(path) {
  return path === '/' || path === '/nikke' || /^\/nikke\/[a-z0-9-]+$/.test(path);
}

// 페이지 메타데이터의 alternates·robots를 만든다. path는 언어 없는 경로.
//   번역된 페이지: canonical = 자기 언어 주소, hreflang 세 언어 + x-default(한국어)
//   번역 안 된 페이지: 한국어는 평소대로, 영어·일본어는 canonical을 한국어판으로 + noindex
export function localeMeta(lang, path, { index = true } = {}) {
  if (isLocalizedForSearch(path)) {
    const languages = Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)]));
    languages['x-default'] = localePath(DEFAULT_LOCALE, path);
    return {
      alternates: { canonical: localePath(lang, path), languages },
      ...(index ? {} : { robots: { index: false, follow: true } }),
    };
  }
  if (lang === DEFAULT_LOCALE) {
    return {
      alternates: { canonical: path },
      ...(index ? {} : { robots: { index: false, follow: true } }),
    };
  }
  return {
    alternates: { canonical: localePath(DEFAULT_LOCALE, path) },
    robots: { index: false, follow: true },
  };
}
