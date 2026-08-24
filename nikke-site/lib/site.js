// 사이트 기본 주소 한 곳에서 관리 (2026-08-09)
//
// robots.txt, sitemap.xml, 메타데이터가 각자 주소를 들고 있으면 나중에 도메인을 붙였을 때
// 한 곳만 고치고 나머지를 잊게 된다. 그러면 검색엔진에는 옛 주소가 남는데 에러는 안 난다.
//
// 2026-08-24: 자체 도메인(www.nikketeamguide.com)으로 전환하면서 **주소 자체를
// data/siteConfig.json으로 옮겼다.** 예전에는 이 파일과 next.config.js,
// scripts/checkCanonical.mjs가 각자 같은 문자열을 하드코딩하고 있어서, 한쪽만 고치면
// 조용히 어긋나는 구조였다. 이제 세 곳이 같은 파일을 읽는다.
//
// 환경변수 NEXT_PUBLIC_SITE_URL이 있으면 그쪽이 우선이다(미리보기 배포 등에서 쓸 수 있게).
// 끝의 슬래시는 붙이지 않는다(`${SITE_URL}/sitemap.xml` 형태로 쓰기 때문).
import siteConfig from '../data/siteConfig.json';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.productionUrl)
  .replace(/\/+$/, '');
