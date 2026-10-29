// 로그인 뒤 돌아갈 경로 판정 — lib/login.js가 쓴다(2026-10-29). DB·브라우저 없이 검사하려고 뗐다(scripts/testLoginReturn.mjs).
// 저장값은 sessionStorage에서 오므로 믿지 않는다: 우리 사이트 안의 경로만 통과시켜 남의 주소로 튕기는 통로가 되지 않게 한다.
export const RETURN_TTL_MS = 10 * 60 * 1000; // 구글 화면에서 취소하고 한참 뒤 다시 로그인했을 때 엉뚱한 곳으로 가지 않게

export function safeReturnPath(raw, now) {
  try {
    const { path, at } = JSON.parse(raw);
    if (typeof path !== 'string' || !path.startsWith('/')) return null;
    // //evil.com · /\evil.com 은 브라우저가 다른 사이트로 읽는다.
    if (path.startsWith('//') || path.startsWith('/\\')) return null;
    if (/[\u0000-\u001f]/.test(path)) return null;
    if (!(typeof at === 'number' && now - at >= 0 && now - at < RETURN_TTL_MS)) return null;
    return path;
  } catch {
    return null;
  }
}
