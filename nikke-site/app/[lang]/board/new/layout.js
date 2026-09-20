import { localeMeta } from '@/lib/locale';

// 글쓰기 폼. 색인 대상이 아니다.
// 언어별 주소(2026-09-19): 본문이 한국어뿐이라 **한국어판만 색인**한다. /en·/ja 주소로도 열리지만
// noindex + canonical을 한국어판으로 둔다(lib/locale.js localeMeta). 영어 주소에 한국어 본문을 색인시키면 해가 된다.
export function generateMetadata({ params }) {
  return localeMeta(params.lang, '/board/new', { index: false });
}

export default function BoardNewLayout({ children }) {
  return children;
}
