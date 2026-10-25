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
  // 언어별 주소(2026-09-19): 영어·일본어판은 **접두어를 남긴 채** 센다(/en/nikke/crown). 해외 수요가
  // 실제로 있는지가 언어별 주소를 연 이유라, 합쳐 버리면 그걸 못 본다. 한국어는 접두어가 없다.
  // rewrite된 내부 경로(/ko/…)가 들어와도 한국어로 접어 한 페이지가 둘로 갈리지 않게 한다.
  const m = path.match(/^\/(ko|en|ja)(?=\/|$)(.*)$/);
  if (!m) return normalizeBare(path);
  const bare = normalizeBare(m[2] || '/');
  if (bare === null) return null;
  if (m[1] === 'ko') return bare;
  return bare === '/' ? `/${m[1]}` : `/${m[1]}${bare}`;
}

// 언어 접두어 없는 경로 하나를 판정한다(normalizePath의 본체).
function normalizeBare(path) {
  if (STATIC_PATHS.has(path)) return path;
  const dex = path.match(/^\/nikke\/([a-z0-9-]{1,40})$/);
  if (dex) return CHAR_IDS.has(dex[1]) ? path : null;
  if (/^\/board\/[^/]+$/.test(path)) return '/board/[id]';
  if (/^\/u\/[^/]+$/.test(path)) return '/u/[id]';
  return null;
}

const TRACKED_PREFIXES = ['en', 'ja'];

// 계측 대상 경로 전체 — 검사기가 "전부 거부되지 않는가"를 확인할 때 쓴다.
export function allTrackablePaths() {
  const bare = [...STATIC_PATHS, '/board/[id]', '/u/[id]', ...[...CHAR_IDS].map((id) => `/nikke/${id}`)];
  return [
    ...bare,
    ...TRACKED_PREFIXES.flatMap((l) => bare.map((p) => (p === '/' ? `/${l}` : `/${l}${p}`))),
  ];
}

// ---------------------------------------------------------------------------
// 유입 경로 · 국가 (2026-10-21)
//
// 유저 질문에서 출발했다: "네이버 쪽에서 유입이 있는 편이야?" — page_views에는 경로만 있어
// 답할 수 없었다. 그래서 **사이트에 처음 들어온 순간(랜딩)** 마다 어디서 왔는지와 국가를 센다.
//
// ⚠️ 랜딩만 센다. Next.js의 화면 전환은 문서를 새로 열지 않아 document.referrer가 처음 값 그대로
//    남는다 — 페이지마다 보내면 네이버에서 와서 5쪽을 본 사람이 "네이버 유입 5"가 된다.
//    그래서 비콘은 첫 전송에만 referrer를 싣는다(components/TrafficBeacon.js).
// ⚠️ 주소 전체가 아니라 **도메인만** 남긴다. 검색 주소에는 검색어가, 커뮤니티 주소에는 글 번호가
//    실려 오는데 집계 단위도 아니고 남길 이유도 없다.

// 도메인 → 집계 이름. 같은 곳의 하위 도메인(m.search.naver.com 등)을 하나로 접는다.
// 위에서부터 처음 맞는 것을 쓴다.
const SOURCE_RULES = [
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)naver\.(com|net)$/, 'naver'],
  [/(^|\.)(daum\.net|kakao\.com)$/, 'daum'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)yahoo\.(com|co\.jp)$/, 'yahoo'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)arca\.live$/, 'arca'],
  [/(^|\.)ruliweb\.com$/, 'ruliweb'],
  [/(^|\.)dcinside\.com$/, 'dcinside'],
  [/(^|\.)inven\.co\.kr$/, 'inven'],
  [/(^|\.)namu\.wiki$/, 'namuwiki'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/, 'x'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)(discord\.com|discordapp\.com)$/, 'discord'],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, 'chatgpt'],
  [/(^|\.)perplexity\.ai$/, 'perplexity'],
];

// 우리 사이트 주소. 여기서 온 것은 랜딩이 아니다(언어 전환 등으로 문서를 새로 연 경우).
const OWN_HOST = /(^|\.)(nikketeamguide\.com|nikke-site\.vercel\.app)$|^localhost$|^127\.0\.0\.1$/;

/**
 * referrer → 집계 이름. 'direct'(없음) · 알려진 이름 · 그 밖의 도메인 그대로. 우리 사이트면 null(세지 않음).
 * 알려지지 않은 도메인도 남기는 이유: 어디서 링크가 걸렸는지가 이 계측의 쓸모다.
 * 대신 도메인 모양이 아니거나 길면 'other'로 접는다(공개 엔드포인트라 아무 문자열이나 온다).
 */
export function normalizeSource(referrer) {
  if (referrer == null || referrer === '') return 'direct';
  if (typeof referrer !== 'string' || referrer.length > 2000) return 'other';
  let u;
  try { u = new URL(referrer); } catch { return 'other'; }
  // 안드로이드 앱이 보내는 referrer는 android-app://<패키지>/ 꼴이다 — hostname이 패키지라
  // 도메인 규칙에 넣으면 지메일(com.google.android.gm)이 'google'이 된다. 검색 앱만 따로 접는다.
  if (u.protocol === 'android-app:') {
    const pkg = u.hostname.toLowerCase();
    if (pkg === 'com.google.android.googlequicksearchbox') return 'google';
    if (pkg === 'com.nhn.android.search') return 'naver';
    if (pkg === 'net.daum.android.daum') return 'daum';
    return 'android-app';
  }
  let host = u.hostname.toLowerCase();
  if (!host) return 'direct';
  if (OWN_HOST.test(host)) return null;
  for (const [re, name] of SOURCE_RULES) if (re.test(host)) return name;
  host = host.replace(/^www\./, '');
  return /^[a-z0-9.-]{1,60}$/.test(host) && host.includes('.') ? host : 'other';
}

// Vercel이 붙여 주는 x-vercel-ip-country(ISO 3166-1 알파2). 없거나 모양이 틀리면 'XX'.
export function normalizeCountry(raw) {
  const c = String(raw || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : 'XX';
}

// 화면 기능 사용 이벤트(2026-10-25, supabase/feature_usage_migration.sql). 공개 엔드포인트라 **화이트리스트만** 센다 —
// 아무 이름이나 받으면 표에 행이 무한히 는다. 새 기능을 세려면 여기에 이름을 더한다.
//   synchro_rank: 싱크로 우선순위 "순서 보기"를 누름(components/ResultPanel.js)
export const FEATURE_EVENTS = new Set(['synchro_rank']);
export const normalizeFeature = (raw) => (typeof raw === 'string' && FEATURE_EVENTS.has(raw) ? raw : null);
export const normalizeLang = (raw) => (raw === 'en' || raw === 'ja' ? raw : 'ko');
