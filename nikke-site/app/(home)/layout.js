// 홈(/)에만 붙는 레이아웃. **주소에는 영향이 없다** — 괄호로 감싼 폴더는 라우트 그룹이라
// URL에 나타나지 않는다.
//
// 왜 이렇게까지 하냐면, app/page.js는 'use client'라 metadata를 export할 수 없기 때문이다.
// 그렇다고 루트 레이아웃(app/layout.js)에 canonical을 넣으면 **모든 하위 경로가 그걸 상속**해서
// /board·/combos까지 정본이 '/'로 찍힌다. Next.js는 metadata를 얕게 병합하고, 자식이 정의하지
// 않은 필드는 부모 것을 그대로 물려받는다. 그래서 홈 전용 레이아웃을 따로 만들었다.
export const metadata = {
  alternates: { canonical: '/' },
};

export default function HomeLayout({ children }) {
  return children;
}
