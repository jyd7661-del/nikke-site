// 글쓰기 폼. 색인 대상이 아니다.
export const metadata = {
  alternates: { canonical: '/board/new' },
  robots: { index: false, follow: true },
};

export default function BoardNewLayout({ children }) {
  return children;
}
