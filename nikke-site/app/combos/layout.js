// /combos 는 'use client'라 metadata를 export할 수 없어 레이아웃에서 정본 주소를 지정한다.
// ⚠️ 이 레이아웃은 /combos/new 도 감싼다. 그쪽이 이 값을 상속하면 정본이 잘못 찍히므로
//    app/combos/new/layout.js 에서 자기 주소로 덮어쓴다.
export const metadata = {
  alternates: { canonical: '/combos' },
};

export default function CombosLayout({ children }) {
  return children;
}
