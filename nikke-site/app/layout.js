import './globals.css';
import Script from 'next/script';
import Link from 'next/link';
import { AuthProvider } from '@/components/AuthProvider';
import Header from '@/components/Header';

export const metadata = {
  title: '니케 조합 추천 | 보유 니케로 최적의 팀 짜기',
  description:
    '보유중인 니케 캐릭터를 선택하면 캠페인, 보스전, 아레나(PvP)에 맞는 추천 조합을 알려주고, 유저들과 직접 조합을 공유·투표할 수 있는 승리의 여신: 니케 팬 사이트입니다.',
};

// Vercel 환경변수 NEXT_PUBLIC_ADSENSE_CLIENT_ID(예: ca-pub-1234567890123456)가 설정된 경우에만
// Google AdSense 로더 스크립트를 붙인다. 아직 계정 승인 전이면 이 값이 없으므로 아무 영향 없다.
// (components/AdSlot.js가 실제 광고 유닛 렌더링을 담당, 여기서는 로더만 붙인다.)
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="bg-nikke-bg text-slate-100 min-h-screen">
        <AuthProvider>
          <Header />
          {children}
          <footer className="border-t border-slate-800/80 mt-16">
            <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <p>니케 조합 추천은 승리의 여신: 니케(시프트업) 비공식 팬 사이트입니다.</p>
              <Link href="/privacy" className="hover:text-slate-300 underline underline-offset-2">
                개인정보처리방침
              </Link>
            </div>
          </footer>
        </AuthProvider>
        {ADSENSE_CLIENT_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
