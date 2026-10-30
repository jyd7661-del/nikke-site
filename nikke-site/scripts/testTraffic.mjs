/**
 * 자체 방문 계측 판정 검사 — lib/traffic.js. (2026-08-26)
 *
 * ■ 이 검사가 막으려는 고장
 *   계측은 **조용히 안 쌓인다.** 전부 에러가 안 나고 화면도 멀쩡하다:
 *     · 경로 판정이 과하게 막으면      -> 표가 비는데 아무도 모른다
 *     · 봇 정규식이 과하면            -> 사람 방문까지 버려 숫자가 통째로 작아진다
 *     · 반대로 봇을 못 거르면          -> 크롤러가 203페이지를 훑어
 *                                       "인원 대비 로딩" 비율이 무의미해진다
 *     · 화이트리스트가 느슨하면        -> 아무 문자열이나 들어와 표가 부푼다
 *
 *   DB가 없어도 여기까지는 전부 검사할 수 있다. 그래서 순수 로직을 lib/traffic.js로 뗐다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// lib/traffic.js는 '@/data/…'로 읽는다(Next.js 별칭). 순수 Node로 부르려면 바꿔치기한다.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-traffic-'));
const fixed = fs.readFileSync(path.join(ROOT, 'lib', 'traffic.js'), 'utf8')
  .replace(/from '(?:@\/|\.\.\/)data\/([\w.]+)\.json';/g, (_, name) =>
    `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${name}.json`)).href)} with { type: 'json' };`);
fs.writeFileSync(path.join(tmp, 'traffic.mjs'), fixed);
const { normalizePath, isBot, allTrackablePaths, normalizeSource, normalizeCountry, normalizeFeature, normalizeLang } = await import(pathToFileURL(path.join(tmp, 'traffic.mjs')).href);

// 재방문 판정은 브라우저 번들에 실리므로 캐릭터 DB를 끌고 오는 traffic.js와 따로 둔다(lib/returnVisit.js).
const { isReturningVisit } = await import(pathToFileURL(path.join(ROOT, 'lib', 'returnVisit.js')).href);
// 배포 전용 주소 판정(middleware.js). 진짜 주소를 막으면 사이트가 통째로 안내 페이지가 된다.
const { isDeploymentHost } = await import(pathToFileURL(path.join(ROOT, 'lib', 'deployHost.js')).href);

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));

const fails = [];
const check = (name, cond, detail = '') => { if (!cond) fails.push(`${name}${detail ? ` — ${detail}` : ''}`); };

// ---------------------------------------------------------------------------
// 1. 실제 존재하는 경로는 **전부** 통과해야 한다.
//    하나라도 막히면 그 페이지의 방문이 통째로 안 쌓이는데 아무 신호가 없다.
const rejected = allTrackablePaths().filter((p) => normalizePath(p) === null);
check('계측 대상 경로 전부 통과', rejected.length === 0, rejected.slice(0, 5).join(', '));

// 2. 도감 198페이지가 **개별로** 세어져야 한다 — 캐릭터별 인기가 이 계측의 핵심 쓸모다.
const dexPaths = db.map((c) => `/nikke/${c.id}`);
const dexOk = dexPaths.filter((p) => normalizePath(p) === p);
check('도감 상세가 캐릭터별로 집계된다', dexOk.length === db.length,
  `${dexOk.length}/${db.length} — 접히거나 거부되면 캐릭터별 숫자가 사라진다`);

// 3. 없는 캐릭터 id는 거부해야 한다. 공개 엔드포인트라 아무 문자열이나 들어올 수 있다.
check('없는 캐릭터 id 거부', normalizePath('/nikke/does-not-exist') === null);
check('긴 쓰레기 경로 거부', normalizePath(`/nikke/${'a'.repeat(60)}`) === null);
check('모르는 경로 거부', normalizePath('/wp-admin') === null && normalizePath('/../../etc/passwd') === null);
check('문자열이 아니면 거부', normalizePath(null) === null && normalizePath(123) === null);

// 4. id가 무한한 경로는 하나로 접어야 한다. 안 접으면 행이 무한히 늘어난다.
check('/board/[id] 접기', normalizePath('/board/abc-123') === '/board/[id]');
check('/u/[id] 접기', normalizePath('/u/someuser') === '/u/[id]');

// 5. 쿼리스트링·해시·끝 슬래시 정규화. 안 하면 같은 페이지가 여러 행으로 갈라진다.
check('쿼리스트링 제거', normalizePath('/nikke?x=1') === '/nikke');
check('해시 제거', normalizePath('/nikke#top') === '/nikke');
check('끝 슬래시 제거', normalizePath('/nikke/') === '/nikke');
check('루트 유지', normalizePath('/') === '/' && normalizePath('') === null);
// ⚠️ 쿼리에 개인정보가 실려 와도 저장되면 안 된다.
check('쿼리의 값이 경로에 남지 않는다', normalizePath('/board?email=a@b.c') === '/board');

// 언어별 주소(2026-09-19) — 영어·일본어는 접두어를 남기고, 한국어는 접두어가 없다.
check('영어 도감은 접두어를 남긴다', normalizePath('/en/nikke/crown') === '/en/nikke/crown');
check('일본어 홈', normalizePath('/ja') === '/ja' && normalizePath('/ja/') === '/ja');
check('내부 경로 /ko/…는 한국어로 접는다', normalizePath('/ko/nikke') === '/nikke' && normalizePath('/ko') === '/');
check('영어판 게시글도 접는다', normalizePath('/en/board/abc') === '/en/board/[id]');
check('없는 언어는 거부', normalizePath('/fr/nikke') === null);
check('언어 접두어 뒤의 없는 캐릭터도 거부', normalizePath('/en/nikke/does-not-exist') === null);

// 6. 봇 판정 — 양쪽 방향 모두 본다.
const BOTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 (compatible; YandexBot/3.0)',
  'Mozilla/5.0 (compatible; AhrefsBot/7.0)',
  'facebookexternalhit/1.1',
  'Mozilla/5.0 HeadlessChrome/120.0.0.0',
];
const HUMANS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
];
const botMiss = BOTS.filter((ua) => !isBot(ua));
const humanHit = HUMANS.filter((ua) => isBot(ua));
check('봇을 거른다', botMiss.length === 0, botMiss.join(' / '));
check('사람을 거르지 않는다', humanHit.length === 0, humanHit.join(' / '));

// 7. 유입 경로(2026-10-21) — 하위 도메인을 접고, 우리 사이트는 세지 않고, 주소 내용(검색어)은 남기지 않는다.
const SRC = [
  ['https://m.search.naver.com/search.naver?query=니케+조합', 'naver'],
  ['https://search.naver.com/search.naver?query=x', 'naver'],
  ['https://www.google.com/', 'google'],
  ['https://www.google.co.kr/', 'google'],
  ['https://search.daum.net/search?q=x', 'daum'],
  ['https://arca.live/b/nikke/123', 'arca'],
  ['https://m.ruliweb.com/game/1', 'ruliweb'],
  ['https://t.co/abc', 'x'],
  ['https://www.somefan.blog/post/1', 'somefan.blog'],
  ['', 'direct'],
  [undefined, 'direct'],
  ['android-app://com.google.android.gm/', 'android-app'],
  ['android-app://com.google.android.googlequicksearchbox/', 'google'],
  ['android-app://com.nhn.android.search/', 'naver'],
  ['not a url', 'other'],
  ['https://' + 'a'.repeat(70) + '.com/', 'other'],
];
const srcBad = SRC.filter(([r, want]) => normalizeSource(r) !== want).map(([r, want]) => `${String(r).slice(0, 40)} → ${normalizeSource(r)} (기대 ${want})`);
check('유입처 판정', srcBad.length === 0, srcBad.join(' / '));
// 우리 사이트에서 온 것은 랜딩이 아니다. 이걸 세면 언어 전환마다 유입이 하나씩 부푼다.
check('우리 사이트는 세지 않는다', ['https://nikketeamguide.com/nikke', 'https://www.nikketeamguide.com/', 'https://nikke-site.vercel.app/', 'http://localhost:3000/'].every((r) => normalizeSource(r) === null));
// 검색어가 실려 와도 저장값에 남으면 안 된다.
check('검색어가 유입처에 남지 않는다', !String(normalizeSource('https://search.naver.com/search.naver?query=secret')).includes('secret'));
// 기능 이벤트는 화이트리스트만(공개 엔드포인트 — 아무 이름이나 받으면 행이 무한히 는다). 언어는 셋 중 하나로.
check('기능 이벤트 화이트리스트', normalizeFeature('synchro_rank') === 'synchro_rank' && normalizeFeature('x'.repeat(30)) === null && normalizeFeature(undefined) === null && normalizeFeature({}) === null);
check('기능 이벤트 언어', normalizeLang('ja') === 'ja' && normalizeLang('en') === 'en' && normalizeLang('ko') === 'ko' && normalizeLang('zz') === 'ko' && normalizeLang(null) === 'ko');
// 재방문(2026-10-29): 앞선 날만 참. 같은 날을 참으로 세면 하루 안에 페이지만 옮겨도 재방문이 되고,
// 미래 날짜를 참으로 세면 시계가 틀린 기기가 매일 재방문으로 잡힌다.
check('재방문 판정', isReturningVisit('2026-10-28', '2026-10-29') && isReturningVisit('2025-12-31', '2026-01-01')
  && !isReturningVisit('2026-10-29', '2026-10-29') && !isReturningVisit('2026-10-30', '2026-10-29')
  && !isReturningVisit(null, '2026-10-29') && !isReturningVisit('garbage', '2026-10-29') && !isReturningVisit('2026-10-28T00', '2026-10-29'));
check('배포 전용 주소만 막는다', ['nikke-site-2hvi5z1my-the-j1.vercel.app', 'NIKKE-SITE-GIT-MAIN-THE-J1.VERCEL.APP', 'nikke-site-abc-the-j1.vercel.app:443'].every(isDeploymentHost)
  && !['nikketeamguide.com', 'www.nikketeamguide.com', 'localhost:3000', 'vercel.app.nikketeamguide.com', '', null].some(isDeploymentHost));
check('국가 정규화', normalizeCountry('kr') === 'KR' && normalizeCountry('') === 'XX' && normalizeCountry(null) === 'XX' && normalizeCountry('KOR') === 'XX');

// ---------------------------------------------------------------------------
const line = '─'.repeat(72);
console.log(line);
console.log('자체 방문 계측 판정 검사');
console.log(`계측 대상 경로 ${allTrackablePaths().length}개 (언어 3개 × ${allTrackablePaths().length / 3} — 한국어는 접두어 없음, 영어·일본어는 /en·/ja)`);
console.log(line);
if (fails.length) {
  console.log(`❌ 실패 ${fails.length}건`);
  fails.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
  process.exitCode = 1;
} else {
  console.log('✅ 전부 통과');
}
fs.rmSync(tmp, { recursive: true, force: true });
