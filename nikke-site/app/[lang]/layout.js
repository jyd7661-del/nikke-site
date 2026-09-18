import '../globals.css';
import { notFound } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import TrafficBeacon from '@/components/TrafficBeacon';
import { AuthProvider } from '@/components/AuthProvider';
import { LanguageProvider } from '@/components/LanguageProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { SITE_URL } from '@/lib/site';
import { LOCALES, isLocale } from '@/lib/locale';
import { seo } from '@/lib/seoText';

// 언어별 주소(2026-09-19) — 루트 레이아웃이 [lang] 안에 있다. 한국어는 접두어 없는 주소로 보이지만
// 내부적으로는 /ko/…다(next.config.js rewrites). 세 언어를 빌드 때 전부 만든다.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}
// ko·en·ja 말고는 없다 — /fr/… 같은 주소는 404.
export const dynamicParams = false;

export function generateMetadata({ params }) {
  const S = seo(params.lang);
  return {
    // 상대 주소로 적힌 메타데이터(og:image 등)를 절대 주소로 만들 기준점.
    // 없으면 Next.js가 빌드 때 경고를 내고, 검색·SNS 미리보기에서 주소가 깨질 수 있다.
    metadataBase: new URL(SITE_URL),
    // 한국어는 도입 전 문구 그대로(lib/seoText.js) — 한국어 검색 순위를 건드리지 않는다.
    title: S.homeTitle,
    description: S.homeDesc,
    // Google Search Console 소유권 확인 (2026-08-13, Phase 0).
    // 삭제하면 소유권이 풀려 Search Console 접근을 잃는다.
    verification: {
      google: 'cXe2elGxOSNx992Nm62TZGosEFaQTKt-3PZGWy3VLAk',
    },
  };
}

// Vercel 환경변수 NEXT_PUBLIC_ADSENSE_CLIENT_ID(예: ca-pub-1234567890123456)가 설정된 경우에만
// Google AdSense 로더 스크립트를 붙인다. 아직 계정 승인 전이면 이 값이 없으므로 아무 영향 없다.
// (components/AdSlot.js가 실제 광고 유닛 렌더링을 담당, 여기서는 로더만 붙인다.)
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

export default function RootLayout({ children, params }) {
  if (!isLocale(params.lang)) notFound();
  return (
    // 서버가 처음부터 그 주소의 언어로 렌더링한다 — 구글이 보는 lang이 주소와 항상 같다.
    <html lang={params.lang}>
      <head>
        {/* ⚠️ 애드센스 로더는 **평범한 <script> 태그**여야 한다. next/script를 쓰면
            안 된다 — afterInteractive든 beforeInteractive든 Next.js는 HTML에
            <link rel="preload">만 내보내고 진짜 <script>는 브라우저에서 JS로 만든다
            (2026-08-24 두 strategy 모두 빌드 산출물로 실측: script 태그 0개 / preload 1개).
            사람 눈에는 광고가 정상으로 보이지만, **애드센스 소유권 확인 크롤러는 원본
            HTML의 <script> 태그를 찾기 때문에** "사이트를 확인할 수 없습니다"로 계속
            실패한다. 실제로 세 번 연속 실패했고 이것이 원인이었다.
            scripts/checkAdSenseTag.mjs 가 빌드 산출물에서 이 태그를 검사한다. */}
        {ADSENSE_CLIENT_ID && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="bg-nikke-bg text-slate-100 min-h-screen">
        <LanguageProvider lang={params.lang}>
          <AuthProvider>
            <Header />
            {children}
            <Footer />
          </AuthProvider>
        </LanguageProvider>
        {/* Vercel Web Analytics — 방문·페이지뷰 계측 (2026-08-12, Phase 0).
            쿠키를 쓰지 않아 동의 배너(CMP) 없이도 적법하게 동작한다.
            Vercel 대시보드에서 Web Analytics를 Enable해야 수집이 시작된다. */}
        <Analytics />
        {/* 자체 방문 계측 (2026-08-26). Vercel Analytics와 목적이 다르다 —
            저쪽은 대시보드라 사람이 봐야 하고, 이쪽은 **쿼리 가능한 숫자**를 우리 DB에
            남겨 주간 리포트 자동화가 읽게 한다. 쿠키를 쓰지 않고 IP·UA도 저장하지 않는다
            (날짜가 섞인 해시라 하루를 넘겨 추적되지 않는다). supabase/traffic_migration.sql 참고. */}
        <TrafficBeacon />
      </body>
    </html>
  );
}
