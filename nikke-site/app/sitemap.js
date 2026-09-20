import { SITE_URL } from '@/lib/site';
import { CHARACTERS } from '@/lib/dex';
import { GUIDES } from '@/lib/guides';
import { LOCALES, DEFAULT_LOCALE, localePath } from '@/lib/locale';

// /sitemap.xml 을 만들어 준다 (Next.js App Router의 메타데이터 파일 규약).
//
// 고정 페이지 + 캐릭터 도감(/nikke, 2026-08-13 Phase 1)을 싣는다.
// 도감은 characterDatabase.json에서 생성하는 정적 공개 페이지라 비밀글 문제가 없고,
// 캐릭터가 늘면 sitemap도 같은 데이터로 자동으로 늘어난다.
//
// 게시글(/board/[id])과 조합은 일부러 뺐다:
//   - 비밀글이 섞여 있다. 목록을 만들려면 서버에서 posts 를 읽어야 하는데, 여기서
//     실수로 비밀글 주소를 흘리면 되돌릴 수 없다.
//   - 게시판은 클라이언트에서 그리므로 크롤러가 주소만 알아도 볼 내용이 없다.
// 글이 쌓이고 서버 렌더링을 붙인 뒤에 다시 판단하는 게 맞다.
//
// ■ 언어별 주소(2026-09-19)
//   번역이 끝난 페이지(홈·도감 목록·도감 상세)는 **세 언어 주소를 모두** 싣고, 항목마다 서로를
//   hreflang(alternates.languages)으로 잇는다. 번역 안 된 페이지(가이드·게시판·개인정보처리방침)는
//   한국어 주소만 싣는다 — 영어·일본어판은 noindex라 싣는 게 모순이다(lib/locale.js isLocalizedForSearch).
//   ⚠️ 이 목록과 각 페이지의 generateMetadata(localeMeta)가 **같은 규칙**을 써야 한다. 한쪽만 바뀌면
//      "sitemap엔 있는데 noindex" 같은 모순이 생긴다 — 둘 다 lib/locale.js 한 곳을 본다.
const abs = (p) => `${SITE_URL}${p === '/' ? '/' : p}`;

// 번역된 페이지 하나 → 세 언어 항목. 각 항목이 세 언어 + x-default를 alternates로 갖는다.
function localized(path, extra) {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, abs(localePath(l, path))]));
  languages['x-default'] = abs(localePath(DEFAULT_LOCALE, path));
  return LOCALES.map((l) => ({ url: abs(localePath(l, path)), alternates: { languages }, ...extra }));
}

export default function sitemap() {
  const now = new Date();
  return [
    ...localized('/', { lastModified: now, changeFrequency: 'weekly', priority: 1 }),
    { url: `${SITE_URL}/combos`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/board`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    ...localized('/nikke', { lastModified: now, changeFrequency: 'weekly', priority: 0.9 }),
    // 가이드(2026-09-04). 글마다 lastModified가 실제 갱신일이라 now를 쓰지 않는다 —
    // 안 고친 글에 오늘 날짜를 찍으면 크롤러에게 거짓말이 된다.
    { url: `${SITE_URL}/guide`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    ...GUIDES.map((g) => ({
      url: `${SITE_URL}/guide/${g.slug}`,
      lastModified: new Date(g.updated),
      changeFrequency: 'monthly',
      priority: 0.8,
    })),
    ...CHARACTERS.flatMap((c) => localized(`/nikke/${c.id}`, { lastModified: now, changeFrequency: 'weekly', priority: 0.7 })),
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
