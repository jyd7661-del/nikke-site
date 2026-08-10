import { SITE_URL } from '@/lib/site';

// /sitemap.xml 을 만들어 준다 (Next.js App Router의 메타데이터 파일 규약).
//
// 고정 페이지만 싣는다. 게시글(/board/[id])과 조합은 일부러 뺐다:
//   - 비밀글이 섞여 있다. 목록을 만들려면 서버에서 posts 를 읽어야 하는데, 여기서
//     실수로 비밀글 주소를 흘리면 되돌릴 수 없다.
//   - 게시판은 클라이언트에서 그리므로 크롤러가 주소만 알아도 볼 내용이 없다.
// 글이 쌓이고 서버 렌더링을 붙인 뒤에 다시 판단하는 게 맞다.
//
// 언어별 주소(hreflang)도 넣지 않는다 — 이 사이트는 URL 을 나누지 않고 브라우저에
// 저장된 선택값으로 화면 문구만 바꾸는 방식이라(lib/i18n.js) 언어마다 줄 주소가 없다.
export default function sitemap() {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/combos`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/board`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
