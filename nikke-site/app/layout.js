import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import Header from '@/components/Header';

export const metadata = {
  title: '니케 조합 추천 | 보유 니케로 최적의 팀 짜기',
  description:
    '보유중인 니케 캐릭터를 선택하면 캠페인, 보스전, 아레나(PvP)에 맞는 추천 조합을 알려주고, 유저들과 직접 조합을 공유·투표할 수 있는 승리의 여신: 니케 팬 사이트입니다.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="bg-nikke-bg text-slate-100 min-h-screen">
        <AuthProvider>
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
