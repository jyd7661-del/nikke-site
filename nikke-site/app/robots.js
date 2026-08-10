import { SITE_URL } from '@/lib/site';

// /robots.txt 를 만들어 준다 (Next.js App Router의 메타데이터 파일 규약).
//
// 2026-08-09 추가. 그전까지는 robots.txt 가 아예 없어서 검색엔진이 무엇을 긁어도 되는지
// 알 수 없는 상태였다. 애드센스 심사와 검색 노출 둘 다에 필요하다.
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // 개인 보유 니케 공유 링크. 본인이 친구에게 주라고 만든 주소라
          // 검색 결과에 뜰 이유가 없다.
          '/u/',
          // API 응답은 사람이 읽을 페이지가 아니다.
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
