/** @type {import('next').NextConfig} */

// 자체 도메인 전환용 301 리다이렉트 (2026-08-23 준비, 도메인 구매 전)
//
// 왜 필요한가: 도메인을 바꾸면 옛 주소(nikke-site.vercel.app)에 색인 201건이 그대로 남는다.
// 리다이렉트를 안 걸면 두 주소가 같은 내용을 서빙해 **중복 콘텐츠**가 되고, 쌓아둔 색인·순위가
// 새 주소로 넘어가지 않는다. 애드센스 재심사도 옛 주소를 계속 본다.
//
// ⚠️ **지금은 아무 일도 하지 않는다.** NEXT_PUBLIC_SITE_URL이 없거나 아직 vercel.app이면
//    규칙을 만들지 않는다. 도메인을 사서 그 환경변수를 새 주소로 바꾸고 재배포하는 순간
//    자동으로 켜진다. 그래서 도메인 없이 미리 넣어둬도 안전하다.
const LEGACY_HOST = 'nikke-site.vercel.app';

function newHost() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    const host = new URL(raw).host;
    return host && host !== LEGACY_HOST ? host : null;
  } catch {
    return null; // 환경변수가 주소 형태가 아니면 그냥 끈다(빌드를 깨뜨리지 않는다)
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
