import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import TrafficBeacon from '@/components/TrafficBeacon';
import { AuthProvider } from '@/components/AuthProvider';
import { LanguageProvider } from '@/components/LanguageProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { SITE_URL } from '@/lib/site';

export const metadata = {
  // 상대 주소로 적힌 메타데이터(og:image 등)를 절대 주소로 만들 기준점.
  // 없으면 Next.js가 빌드 때 경고를 내고, 검색·SNS 미리보기에서 주소가 깨질 수 있다.
  metadataBase: new URL(SITE_URL),
  title: '니케 조합 추천 | 보유 니케로 최적의 팀 짜기',
  description:
    '보유중인 니케 캐릭터를 선택하면 캠페인, 보스전, 아레나(PvP)에 맞는 추천 조합을 알려주고, 유저들과 직접 조합을 공유·투표할 수 있는 승리의 여신: 니케 팬 사이트입니다.',
  // Google Search Console 소유권 확인 (2026-08-13, Phase 0).
  // 삭제하면 소유권이 풀려 Search Console 접근을 잃는다.
  verification: {
    google: 'cXe2elGxOSNx992Nm62TZGosEFaQTKt-3PZGWy3VLAk',
  },
};

// Vercel 환경변수 NEXT_PUBLIC_ADSENSE_CLIENT_ID(예: ca-pub-1234567890123456)가 설정된 경우에만
// Google AdSense 로더 스크립트를 붙인다. 아직 계정 승인 전이면 이 값이 없으므로 아무 영향 없다.
// (components/AdSlot.js가 실제 광고 유닛 렌더링을 담당, 여기서는 로더만 붙인다.)
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
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
        <LanguageProvider>
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
