import { localeMeta } from '@/lib/locale';

// 게시글 상세. 부모(/board)의 정본을 물려받으면 모든 글이 목록 주소를 가리키게 되므로
// 글마다 자기 주소를 정본으로 지정한다.
export function generateMetadata({ params }) {
  // 언어별 주소(2026-09-19): 유저 글은 한국어라 한국어판만 색인(lib/locale.js).
  return localeMeta(params.lang, `/board/${params.id}`);
}

export default function BoardPostLayout({ children }) {
  return children;
}
