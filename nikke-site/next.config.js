/** @type {import('next').NextConfig} */

// 옛 주소 → 새 주소 301(308) 리다이렉트 (2026-08-23 준비 → 2026-08-24 도메인 붙이며 가동)
//
// 왜 필요한가: 도메인을 바꿔도 옛 주소(nikke-site.vercel.app)에 색인 201건이 그대로 남는다.
// 리다이렉트가 없으면 두 주소가 같은 내용을 서빙해 **중복 콘텐츠**가 되고, 쌓아둔 색인·순위가
// 새 주소로 넘어가지 않는다. 애드센스 재심사도 옛 주소를 계속 보게 된다.
//
// 주소는 data/siteConfig.json 하나에서 읽는다 — lib/site.js·scripts/checkCanonical.mjs와
// 같은 출처다. 세 파일이 각자 하드코딩하던 때는 한쪽만 고치면 조용히 어긋났다.
const siteConfig = require('./data/siteConfig.json');

const LEGACY_HOST = siteConfig.legacyHost;

// 환경변수가 있으면 그쪽이 우선(미리보기 배포 등). 값이 주소 형태가 아니거나 옛 주소 그대로면
// 규칙을 만들지 않는다 — 무한 리다이렉트와 빌드 실패를 둘 다 막는다.
function newHost() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || siteConfig.productionUrl;
  if (!raw) return null;
  try {
    const host = new URL(raw).host;
    return host && host !== LEGACY_HOST ? host : null;
  } catch {
    return null;
  }
}

const nextConfig = {
  reactStrictMode: true,

  async redirects() {
    const host = newHost();
    // 언어별 주소(2026-09-19): 한국어는 접두어 없는 주소가 정본이다. /ko/…로 들어오면 되돌린다 —
    // 안 그러면 같은 한국어 페이지가 /nikke와 /ko/nikke 두 주소로 색인돼 중복 콘텐츠가 된다.
    const localeRedirects = [
      { source: '/ko', destination: '/', permanent: true },
      { source: '/ko/:path*', destination: '/:path*', permanent: true },
    ];
    if (!host) return localeRedirects;
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: LEGACY_HOST }],
        destination: `https://${host}/:path*`,
        permanent: true, // 308(=301 계열). 검색엔진이 주소 이전으로 인식한다
      },
      ...localeRedirects,
    ];
  },

  // 언어별 주소(2026-09-19) — 페이지는 전부 app/[lang]/… 아래에 있다(한국어 = ko).
  // 한국어는 기존 주소(/nikke/crown)를 그대로 쓰도록, 접두어 없는 주소를 **안에서만** /ko/…로 넘긴다.
  // 주소창은 그대로다. /en/…·/ja/…는 그대로 [lang]에 걸린다.
  //
  // ■ 왜 미들웨어가 아니라 rewrites인가 — 비용.
  //   미들웨어는 요청마다 함수가 돈다(규모가 커지면 과금 대상). rewrites는 Vercel 라우팅 계층이
  //   처리해 방문당 비용이 0이다(유저 지시 2026-09-14 "규모 기준으로 설계").
  // ■ afterFiles(배열로 반환 = afterFiles)라 /api/…·/robots.txt·/sitemap.xml·public 파일·/_next는
  //   먼저 파일 시스템에서 걸려 여기까지 오지 않는다. 동적 경로([lang])보다는 먼저 검사된다 —
  //   그래서 /nikke가 [lang]=nikke로 잘못 잡히지 않고 /ko/nikke로 간다.
  async rewrites() {
    return [
      { source: '/', destination: '/ko' },
      { source: '/:path((?!en(?:/|$)|ja(?:/|$)|ko(?:/|$)|api/|_next/).*)', destination: '/ko/:path' },
    ];
  },
};

module.exports = nextConfig;
