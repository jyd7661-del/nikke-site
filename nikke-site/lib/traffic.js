// 자체 방문 계측의 **순수 판정 로직**. (2026-08-26)
//
// 라우트(app/api/track/route.js)에서 떼어낸 이유: 이 계측은 조용히 안 쌓이는 실패 모드가
// 여럿이고 전부 에러가 안 난다 —
//   · 경로 판정이 전부 거부하면 → 표가 비는데 화면은 멀쩡하다
//   · 봇 정규식이 과하면      → 사람 방문까지 버려 숫자가 통째로 작아진다
//   · 반대로 봇을 못 거르면    → 크롤러가 203페이지를 훑어 "인원 대비 로딩" 비율이 무의미해진다
// DB 없이도 검사할 수 있어야 이걸 잡는다. scripts/testTraffic.mjs가 여기를 본다.
import characterDatabase from '@/data/characterDatabase.json';

// 계측하지 않을 요청 — 봇.
// ⚠️ 구글봇은 JS를 실행하므로 클라이언트 비콘만으로는 안 걸러진다. UA로 걸러야 한다.
export const BOT_UA = /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|headlesschrome|lighthouse|pingdom|gtmetrix|semrush|ahrefs|petalbot|yandex|duckduck/i;

export const isBot = (ua) => BOT_UA.test(String(ua || ''));

const CHAR_IDS = new Set(
  (Array.isArray(characterDatabase) ? characterDatabase : characterDatabase.characters).map((c) => c.id),
);
const STATIC_PATHS = new Set(['/', '/nikke', '/combos', '/combos/new', '/board', '/board/new', '/privacy']);

/**
 * 기록할 경로로 정규화한다. 허용되지 않으면 null.
 *
 * ⚠️ 화이트리스트가 아니면 아무 문자열이나 밀어넣어 표를 부풀릴 수 있다(공개 엔드포인트다).
 * ⚠️ /board/[id] · /u/[id] 는 id가 무한하므로 **하나로 접는다.** 개별로 세면 행이 무한히 는다.
 *    반면 /nikke/[id] 는 캐릭터 id 집합이 유한하고, 캐릭터별 인기를 보는 것이 이 계측의
 *    핵심 쓸모라 개별로 센다 — 대신 실제 id인지 대조한다.
 */
export function normalizePath(raw) {
  // ⚠️ 빈 문자열은 거부한다. `'' -> '/'`로 흘려보내면 경로를 안 실은 요청이 홈 방문으로
  //    둔갑한다(usePathname은 빈 값을 주지 않으므로 정상 요청이 아니다).
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 120) return null;
  // 쿼리스트링·해시는 버린다. 개인정보가 실려 올 수 있고 집계 단위도 아니다.
  const path = raw.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (STATIC_PATHS.has(path)) return path;
  const dex = path.match(/^\/nikke\/([a-z0-9-]{1,40})$/);
  if (dex) return CHAR_IDS.has(dex[1]) ? path : null;
  if (/^\/board\/[^/]+$/.test(path)) return '/board/[id]';
  if (/^\/u\/[^/]+$/.test(path)) return '/u/[id]';
  return null;
}

// 계측 대상 경로 전체 — 검사기가 "전부 거부되지 않는가"를 확인할 때 쓴다.
export function allTrackablePaths() {
  return [...STATIC_PATHS, '/board/[id]', '/u/[id]', ...[...CHAR_IDS].map((id) => `/nikke/${id}`)];
}
