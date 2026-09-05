// 가이드 인덱스 — /guide (2026-09-04)
//
// 왜 만들었나: `lib/guides.js` 맨 위 주석 참고. 요약하면 애드센스가 세 번째로
// "가치가 별로 없는 콘텐츠"로 반려했고, 실측해 보니 사이트에 사람이 쓴 글이 한 편도 없었다.
//
// ⚠️ 서버 컴포넌트라 클라이언트 i18n을 쓸 수 없다(`/nikke`와 같은 제약).
//    가이드는 한국어로 쓰는 분석 글이라 번역 대상이 아니다 — 그래서 여기서는 제약이 아니다.
//
// ⚠️ 광고를 넣지 않았다. 승인 전이라 AdSlot은 자리표시자만 그리는데, "콘텐츠 가치"를
//    심사받는 중에 새 페이지마다 빈 광고 상자를 얹을 이유가 없다. 승인 뒤에 판단한다.
import Link from 'next/link';
import { GUIDES } from '@/lib/guides';

export const metadata = {
  title: '니케 조합 가이드 — 실사용 데이터로 본 조합 원리 | 니케 조합 추천',
  description:
    '승리의 여신: 니케의 조합을 실제 데이터로 분석한 글 모음. 실사용 조합 214건 통계, '
    + '버스트 쿨타임이 도는 방식, 무기 타입별 평타 DPS 계산.',
  alternates: { canonical: '/guide' },
};

export default function GuideIndexPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-extrabold text-slate-100">가이드</h1>
      <p className="mt-3 text-slate-400 leading-7">
        이 사이트가 가진 데이터를 직접 세고 계산해서 쓴 글입니다. 다른 곳의 글을 옮기거나 요약한 것이
        아니라, 실사용 조합 집계와 캐릭터·무기 데이터에서 나온 수치를 근거로 합니다. 글에 나오는 통계
        수치는 배포할 때 원본 데이터에서 다시 계산되므로 데이터가 갱신되면 본문도 따라 바뀝니다(과거에 잰
        실측치와 인용문만 예외이고 본문에 그렇게 밝혀 둡니다).
      </p>

      <ul className="mt-8 space-y-4">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/guide/${g.slug}`}
              className="block rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-nikke-accent/60 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">{g.tag}</span>
                <time dateTime={g.published}>{g.published}</time>
              </div>
              <h2 className="mt-2 font-bold text-slate-100 text-lg leading-snug">{g.title}</h2>
              <p className="mt-2 text-sm text-slate-400 leading-6">{g.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
