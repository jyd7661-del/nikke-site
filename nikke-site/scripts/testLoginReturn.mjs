/**
 * 로그인 뒤 돌아갈 경로 판정 검사 — lib/loginReturn.js. (2026-10-29)
 *
 * ■ 이 검사가 막으려는 고장
 *   로그인 버튼을 누른 페이지를 sessionStorage에 적어 두었다가, 구글에서 돌아오면 그리로 보낸다(lib/login.js · AuthProvider).
 *     · 판정이 느슨하면 → 저장값을 바꿔 넣은 링크로 우리 사이트가 남의 사이트로 튕기는 통로가 된다(//evil.com, /\evil.com, https://…)
 *     · 판정이 과하면   → 언어 주소(/en/board)나 쿼리(?category=bug)가 막혀 예전처럼 조용히 첫 화면에 떨어진다
 *     · 시간 제한이 없으면 → 구글 화면에서 취소하고 한참 뒤 로그인했을 때 엉뚱한 페이지로 간다
 *
 * ■ 역테스트(2026-10-29): '//' 판정을 지우면 2건, 시간 제한을 지우면 3건이 실패하는 것을 확인했다.
 */
import { safeReturnPath, RETURN_TTL_MS } from '../lib/loginReturn.js';

const NOW = 1_800_000_000_000;
const rec = (path, ago = 1000) => JSON.stringify({ path, at: NOW - ago });

const cases = [
  // 통과해야 하는 것 — 사이트 안의 페이지
  [rec('/board'), '/board'],
  [rec('/en/board/new?category=bug'), '/en/board/new?category=bug'],
  [rec('/ja/combos/new'), '/ja/combos/new'],
  [rec('/board/0b6c1f9e-1a2b-4c3d-8e9f-001122334455'), '/board/0b6c1f9e-1a2b-4c3d-8e9f-001122334455'],
  [rec('/nikke/neon-vision-eye'), '/nikke/neon-vision-eye'],
  // 막아야 하는 것 — 남의 주소
  [rec('//evil.example'), null],
  [rec('/\\evil.example'), null],
  [rec('https://evil.example/board'), null],
  [rec('javascript:alert(1)'), null],
  [rec('/board\n//evil.example'), null],
  [rec(''), null],
  // 막아야 하는 것 — 오래됐거나 시간이 이상한 값
  [rec('/board', RETURN_TTL_MS + 1), null],
  [rec('/board', -5000), null],
  [JSON.stringify({ path: '/board' }), null],
  // 막아야 하는 것 — 깨진 저장값
  ['not json', null],
  [JSON.stringify({ path: 42, at: NOW }), null],
  ['null', null],
];

let fail = 0;
for (const [raw, want] of cases) {
  const got = safeReturnPath(raw, NOW);
  if (got !== want) {
    fail++;
    console.log(`  ❌ ${raw} → ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`);
  }
}
if (fail) {
  console.log(`❌ testLoginReturn: ${fail}/${cases.length} 실패`);
  process.exit(1);
}
console.log(`✅ testLoginReturn: ${cases.length}건 통과 (사이트 안 경로 5 · 막을 값 ${cases.length - 5})`);
