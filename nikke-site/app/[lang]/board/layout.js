import { localeMeta } from '@/lib/locale';

// /board 는 'use client'라 metadata를 export할 수 없어 레이아웃에서 정본 주소를 지정한다.
// ⚠️ 이 레이아웃은 /board/new 와 /board/[id] 도 감싼다. 각각 자기 레이아웃에서 덮어쓴다.
// 언어별 주소(2026-09-19): 본문이 한국어뿐이라 **한국어판만 색인**한다. /en·/ja 주소로도 열리지만
// noindex + canonical을 한국어판으로 둔다(lib/locale.js localeMeta). 영어 주소에 한국어 본문을 색인시키면 해가 된다.
export function generateMetadata({ params }) {
  return localeMeta(params.lang, '/board');
}

export default function BoardLayout({ children }) {
  return children;
}
