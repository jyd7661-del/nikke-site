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
    if (!host) return [];
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: LEGACY_HOST }],
        destination: `https://${host}/:path*`,
        permanent: true, // 308(=301 계열). 검색엔진이 주소 이전으로 인식한다
      },
    ];
  },
};

module.exports = nextConfig;
