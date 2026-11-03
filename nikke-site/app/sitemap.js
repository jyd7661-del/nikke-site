import { SITE_URL } from '@/lib/site';
import { CHARACTERS } from '@/lib/dex';
import { GUIDES } from '@/lib/guides';
import { LOCALES, DEFAULT_LOCALE, localePath } from '@/lib/locale';
import { fetchUpdates, fetchUpdateTranslations } from '@/lib/updates';

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

// 업데이트 소식(2026-10-31)은 DB에서 읽으므로 사이트맵도 한 시간마다 다시 만든다(배포 없이 새 글이 실린다).
export const revalidate = 3600;

// 업데이트 글: 한국어는 늘, 영어·일본어는 번역이 끝난 글만(번역 없으면 그 주소는 noindex — app/[lang]/updates/[id]).
async function updateEntries(posts) {
  if (!posts.length) return [];
  const ids = posts.map((p) => p.id);
  const done = {};
  for (const l of LOCALES) if (l !== DEFAULT_LOCALE) done[l] = await fetchUpdateTranslations(ids, l);
  return posts.flatMap((p) => {
    const path = `/updates/${p.id}`;
    const langs = LOCALES.filter((l) => l === DEFAULT_LOCALE || done[l]?.[p.id]);
    const languages = Object.fromEntries(langs.map((l) => [l, abs(localePath(l, path))]));
    if (langs.length > 1) languages['x-default'] = abs(localePath(DEFAULT_LOCALE, path));
    return langs.map((l) => ({ url: abs(localePath(l, path)), lastModified: new Date(p.created_at), changeFrequency: 'monthly', priority: 0.7, ...(langs.length > 1 ? { alternates: { languages } } : {}) }));
  });
}

// ■ lastModified는 **실제로 고친 날짜를 아는 주소에만** 붙인다(2026-11-03).
//   전에는 홈·도감 625개 주소에 `now`를 찍었고, 위 revalidate 때문에 한 시간마다 "전부 방금 바뀜"이 됐다.
//   구글은 lastmod가 꾸준히 정확할 때만 쓰고, 아니면 사이트 전체의 lastmod를 무시한다 — 진짜 날짜가 있는 가이드·업데이트 글까지
//   신호를 잃는다. 11-03 확인: /en · /en/nikke · /nikke가 9월에 한 번 크롤링된 뒤 6주째 「크롤링됨 - 색인 안 됨」 그대로였다.
//   도감·홈은 페이지별 수정일을 모른다(dataFreshness.asOf도 실제 수정과 어긋난다 — 10-31 마리안 추가가 10-19로 남아 있었다) → 뺀다.
//   날짜가 없으면 구글은 자기 크롤링 주기로 돈다. 거짓 날짜보다 낫다.
export default async function sitemap() {
  const posts = await fetchUpdates();
  const latestPost = posts.length ? new Date(Math.max(...posts.map((p) => +new Date(p.created_at)))) : undefined;
  const latestGuide = new Date(Math.max(...GUIDES.map((g) => +new Date(g.updated))));
  return [
    ...localized('/', { changeFrequency: 'weekly', priority: 1 }),
    { url: `${SITE_URL}/combos`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/board`, changeFrequency: 'daily', priority: 0.8 },
    ...localized('/nikke', { changeFrequency: 'weekly', priority: 0.9 }),
    // 가이드(2026-09-04). 글마다 lastModified가 실제 갱신일이다. 목록은 가장 최근 글의 갱신일.
    { url: `${SITE_URL}/guide`, lastModified: latestGuide, changeFrequency: 'weekly', priority: 0.9 },
    ...GUIDES.map((g) => ({
      url: `${SITE_URL}/guide/${g.slug}`,
      lastModified: new Date(g.updated),
      changeFrequency: 'monthly',
      priority: 0.8,
    })),
    ...CHARACTERS.flatMap((c) => localized(`/nikke/${c.id}`, { changeFrequency: 'weekly', priority: 0.7 })),
    // 업데이트 목록은 가장 최근 글 날짜(글이 올라오면 목록이 바뀐다)
    ...localized('/updates', { ...(latestPost ? { lastModified: latestPost } : {}), changeFrequency: 'weekly', priority: 0.8 }),
    ...(await updateEntries(posts)),
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
