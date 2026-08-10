// 사이트 기본 주소 한 곳에서 관리 (2026-08-09)
//
// robots.txt, sitemap.xml, 메타데이터가 각자 주소를 들고 있으면 나중에 도메인을 붙였을 때
// 한 곳만 고치고 나머지를 잊게 된다. 그러면 검색엔진에는 옛 주소가 남는데 에러는 안 난다.
//
// 커스텀 도메인을 붙이면 Vercel 환경변수 NEXT_PUBLIC_SITE_URL 만 바꾸면 된다.
// 끝의 슬래시는 붙이지 않는다(`${SITE_URL}/sitemap.xml` 형태로 쓰기 때문).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://nikke-site.vercel.app')
  .replace(/\/+$/, '');
