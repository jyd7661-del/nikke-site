// 가이드 상세 — /guide/[slug] (2026-09-04)
//
// 빌드 때 정적 생성한다(도감과 같은 방식). 본문 컴포넌트는 여기서 slug와 잇는다 —
// `lib/guides.js`는 메타데이터만 들고 있다(그 파일을 sitemap이 import하기 때문).
//
// ⚠️ 새 글을 추가할 때는 **두 곳**을 함께 고친다: `lib/guides.js`의 GUIDES와 아래 BODY.
//    한쪽만 고치면 목록에는 뜨는데 404가 나거나, 페이지는 있는데 목록에 없다.
//    `scripts/testGuides.mjs`가 양쪽이 정확히 일치하는지 검사한다.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, bySlug } from '@/lib/guides';
import { SITE_URL } from '@/lib/site';
import RealTeamStats from '@/components/guides/RealTeamStats';
import BurstCycle from '@/components/guides/BurstCycle';
import WeaponDps from '@/components/guides/WeaponDps';

const BODY = {
  'real-team-stats': RealTeamStats,
  'burst-cycle': BurstCycle,
  'weapon-dps': WeaponDps,
};

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }) {
  const g = bySlug(params.slug);
  if (!g) return {};
  return {
    title: `${g.title} | 니케 조합 추천`,
    description: g.description,
    alternates: { canonical: `/guide/${g.slug}` },
    openGraph: {
      type: 'article',
      title: g.title,
      description: g.description,
      publishedTime: g.published,
      modifiedTime: g.updated,
    },
  };
}

export default function GuidePage({ params }) {
  const g = bySlug(params.slug);
  const Body = BODY[params.slug];
  if (!g || !Body) notFound();

  // 검색엔진에 "이건 글이다"라고 알린다. 도구 페이지와 성격이 다르다는 표시이기도 하다.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.title,
    description: g.description,
    datePublished: g.published,
    dateModified: g.updated,
    inLanguage: 'ko',
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/guide/${g.slug}` },
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-sm text-slate-500">
        <Link href="/guide" className="hover:text-slate-300">← 가이드 목록</Link>
      </nav>

      <header className="mt-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">{g.tag}</span>
          <time dateTime={g.published}>{g.published}</time>
          {g.updated !== g.published && <span>· {g.updated} 갱신</span>}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-100 leading-snug">{g.title}</h1>
      </header>

      <article className="mt-6">
        <Body />
      </article>

      <footer className="mt-12 pt-6 border-t border-slate-800 text-sm text-slate-500 space-y-3">
        <p>
          이 글의 통계 수치는 배포할 때 원본 데이터에서 다시 계산됩니다. 데이터가 갱신되면 본문 숫자도 함께
          바뀝니다. 과거에 잰 실측치와 인용문만 예외이고, 본문에 그렇게 밝혀 둡니다.
        </p>
        <p>
          <Link href="/" className="text-sky-400 hover:underline">보유 니케로 조합 추천받기</Link>
          {' · '}
          <Link href="/nikke" className="text-sky-400 hover:underline">캐릭터 도감</Link>
          {' · '}
          <Link href="/guide" className="text-sky-400 hover:underline">다른 가이드</Link>
        </p>
      </footer>
    </main>
  );
}
