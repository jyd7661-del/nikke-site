// 조합 등록 폼. 검색 결과에 뜰 이유가 없고, 부모(/combos)의 정본을 물려받으면 안 된다.
export const metadata = {
  alternates: { canonical: '/combos/new' },
  robots: { index: false, follow: true },
};

export default function CombosNewLayout({ children }) {
  return children;
}
