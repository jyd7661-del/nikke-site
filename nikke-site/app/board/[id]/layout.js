// 게시글 상세. 부모(/board)의 정본을 물려받으면 모든 글이 목록 주소를 가리키게 되므로
// 글마다 자기 주소를 정본으로 지정한다.
export function generateMetadata({ params }) {
  return { alternates: { canonical: `/board/${params.id}` } };
}

export default function BoardPostLayout({ children }) {
  return children;
}
