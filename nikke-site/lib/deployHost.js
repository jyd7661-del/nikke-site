// Vercel 배포 전용 주소(nikke-site-…-the-j1.vercel.app) 판정. (2026-10-30)
// middleware.js가 쓴다. 순수 함수라 scripts/testTraffic.mjs에서 바로 검사한다.
export function isDeploymentHost(host) {
  if (typeof host !== 'string') return false;
  const h = host.toLowerCase().split(':')[0];
  return h.endsWith('.vercel.app');
}
