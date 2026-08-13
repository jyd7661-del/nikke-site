// /board 는 'use client'라 metadata를 export할 수 없어 레이아웃에서 정본 주소를 지정한다.
// ⚠️ 이 레이아웃은 /board/new 와 /board/[id] 도 감싼다. 각각 자기 레이아웃에서 덮어쓴다.
export const metadata = {
  alternates: { canonical: '/board' },
};

export default function BoardLayout({ children }) {
  return children;
}
