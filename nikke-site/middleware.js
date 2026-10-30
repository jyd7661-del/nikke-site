import { isDeploymentHost } from '@/lib/deployHost';

// 배포 전용 주소에는 사이트 대신 짧은 안내만 보낸다. (2026-10-30, 유저: "안뜨게 해줘")
//
// 배포마다 Vercel이 대시보드 썸네일을 찍으려고 이 주소를 연다. 그때 광고 로더가 불려
// 애드센스 "기타 주소"에 페이지뷰가 쌓였다(14일 110회, 사람은 0 — docs/log/2026-10.md 10-26).
// 광고 로더는 원본 HTML의 평범한 <script>여야 해서(app/[lang]/layout.js) 주소별로 빼지 않고
// 여기서 페이지 자체를 내보내지 않는다. 진짜 주소(nikketeamguide.com)는 matcher에 안 걸려
// 미들웨어가 아예 돌지 않는다. 옛 주소 nikke-site.vercel.app은 Vercel 도메인 설정이 먼저 308로 넘긴다.
export function middleware(req) {
  if (!isDeploymentHost(req.headers.get('host'))) return;
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
    + '<title>배포 미리보기</title><p>배포 미리보기 주소입니다. <a href="https://nikketeamguide.com/">nikketeamguide.com</a>',
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'cache-control': 'no-store' } },
  );
}

export const config = {
  matcher: [{ source: '/:path*', has: [{ type: 'host', value: '.*\\.vercel\\.app' }] }],
};
