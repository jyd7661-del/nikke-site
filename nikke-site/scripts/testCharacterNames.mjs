#!/usr/bin/env node
/**
 * lib/characterNames.js — 니케 이름 로케일 표시 테스트
 *
 *   node scripts/testCharacterNames.mjs
 *
 * 왜 필요한가:
 * 이름 표시가 틀려도 **에러가 나지 않는다.** 일본어로 바꿨는데 이름만 한국어로 남아도
 * 화면은 멀쩡히 그려지고, 그 언어 사용자만 조용히 불편을 겪는다. 실제로 2026-08-10까지
 * 그 상태로 배포돼 있었다 — name_ja를 196명 넣어놓고도 화면이 읽는 파일이 달라서였다.
 * 사람이 세 언어로 직접 눌러보지 않으면 발견되지 않는 유형이라 자동 검사를 붙인다.
 *
 * 순수 node ESM은 JSON import에 import attribute를 요구하므로(Next.js는 알아서 처리)
 * scripts/testGlossary.mjs와 같은 방식으로 fs 읽기로 바꿔 /tmp에 복사한 뒤 불러온다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const href = (...p) => pathToFileURL(path.join(ROOT, ...p)).href;

const src = fs.readFileSync(path.join(ROOT, 'lib', 'characterNames.js'), 'utf8')
  .replace(/^import \{ CHARACTERS \} from '\.\.\/data\/characters';$/m,
    `import { CHARACTERS } from '${href('data', 'characters.js')}';`)
  .replace(/^import characterDatabase from '\.\.\/data\/characterDatabase\.json';$/m,
    `import fs0 from 'node:fs';\nconst characterDatabase = JSON.parse(fs0.readFileSync(new URL('${href('data', 'characterDatabase.json')}'), 'utf8'));`)
  .replace(/^import \{ DEFAULT_LOCALE \} from '\.\/i18n';$/m,
    `import { DEFAULT_LOCALE } from '${href('lib', 'i18n.js')}';`)
  // 2026-08-24: memberName 정의가 lib/memberName.js로 빠졌다 — 클라이언트 컴포넌트가
  // 이 함수 하나 때문에 characterDatabase.json 666KB를 번들에 싣던 것을 막으려고 순수
  // 모듈로 분리하고 여기서는 재수출만 한다(이름 규칙은 여전히 한 곳).
  // ⚠️ 이 테스트는 파일을 임시 폴더로 복사해 불러오므로 **상대 import를 하나씩 절대
  //    경로로 바꿔줘야 한다.** 빠뜨리면 ERR_MODULE_NOT_FOUND로 테스트가 통째로 죽는다
  //    (실제로 분리 직후 그렇게 깨졌다). lib/characterNames.js에 상대 import를 새로
  //    추가하면 여기도 함께 고칠 것.
  .replace(/^export \{ memberName \} from '\.\/memberName';$/m,
    `export { memberName } from '${href('lib', 'memberName.js')}';`);

const tmp = path.join(os.tmpdir(), `charnames-test-${process.pid}.mjs`);
fs.writeFileSync(tmp, src);
const N = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

const { CHARACTERS } = await import(href('data', 'characters.js'));
const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const cdbById = new Map(cdb.map((c) => [c.id, c]));

let pass = 0;
const fails = [];
const eq = (name, got, want) => {
  if (got === want) pass++;
  else fails.push(`${name} — got ${JSON.stringify(got)} / want ${JSON.stringify(want)}`);
};

// ── 언어별 표기 ────────────────────────────────────────────────
eq('ko 리틀머메이드', N.characterName('little-mermaid', 'ko'), '리틀 머메이드');
eq('en 리틀머메이드', N.characterName('little-mermaid', 'en'), 'Little Mermaid');
eq('ja 리틀머메이드', N.characterName('little-mermaid', 'ja'), 'リトルマーメイド');
// 한자 표기 — 가타카나 변환이 아니라 그대로 와야 한다
eq('ja 홍련(한자)', N.characterName('scarlet', 'ja'), '紅蓮');

// ── 폴백: 이름이 사라지는 것이 최악이다 ─────────────────────────
eq('lang 미지정 → ko', N.characterName('jackal'), '자칼');
eq('lang 이상값 → ko', N.characterName('jackal', 'zz'), '자칼');
eq('모르는 id → id 유지', N.characterName('no-such-id', 'ja'), 'no-such-id');
eq('객체 입력', N.characterName(CHARACTERS.find((c) => c.id === 'jackal'), 'en'), 'Jackal');

// ── 검색: 어느 언어로 쳐도 걸려야 한다 ──────────────────────────
const hit = (q) => CHARACTERS.filter((c) => N.characterSearchText(c).includes(q.toLowerCase())).map((c) => c.id);
eq('검색 한국어', hit('자칼').includes('jackal'), true);
eq('검색 영어', hit('jackal').includes('jackal'), true);
eq('검색 일본어 가나', hit('ジャッカル').includes('jackal'), true);
eq('검색 일본어 한자', hit('紅蓮').includes('scarlet'), true);
eq('검색 대소문자 무시', hit('JACKAL').includes('jackal'), true);
eq('검색 공백만 → 전원', hit('').length, CHARACTERS.length);

// ── localizedCharacter: name만 바꾸고 나머지는 보존 ─────────────
const lm = CHARACTERS.find((c) => c.id === 'little-mermaid');
const ja = N.localizedCharacter(lm, 'ja');
eq('localized name', ja.name, 'リトルマーメイド');
eq('localized img 보존', ja.img, lm.img);
eq('localized tier 보존', ja.tier, lm.tier);
eq('원본 객체 불변', lm.name, '리틀 머메이드');
eq('null 입력 안전', N.localizedCharacter(null, 'ja'), null);

// ── memberName: 엔진이 내려보낸 조합 멤버 ───────────────────────
const m = { id: 'rapi', title: 'Rapi', name_kr: '라피', name_ja: 'ラピ' };
eq('member ko', N.memberName(m, 'ko'), '라피');
eq('member en', N.memberName(m, 'en'), 'Rapi');
eq('member ja', N.memberName(m, 'ja'), 'ラピ');
// name_ja 없이 저장된 옛 캐시/응답이 와도 이름이 비면 안 된다
eq('member ja 폴백', N.memberName({ title: 'Rapi', name_kr: '라피', name_ja: null }, 'ja'), '라피');
eq('member en 폴백', N.memberName({ name_kr: '라피' }, 'en'), '라피');
eq('member null 안전', N.memberName(null, 'ja'), '');

// ── 전수: 로스터 전원이 세 언어 모두 실제 값을 갖는가 ────────────
const broken = [];
for (const c of CHARACTERS) {
  const d = cdbById.get(c.cdbId || c.id);
  for (const lang of ['ko', 'en', 'ja']) {
    const v = N.characterName(c, lang);
    if (!v || v === c.id) broken.push(`${c.id}/${lang}`);
  }
  // 연결이 살아 있는지 — 끊기면 이름이 한국어 하나로 굳는다
  if (d && N.characterName(c, 'en') !== d.title) broken.push(`${c.id}/en≠title`);
  if (d && N.characterName(c, 'ja') !== d.name_ja) broken.push(`${c.id}/ja≠name_ja`);
}
eq(`로스터 ${CHARACTERS.length}명 3개국어 전수`, broken.length, 0);
if (broken.length) fails.push(`  깨진 항목: ${broken.slice(0, 15).join(', ')}`);

// ── 결과 ────────────────────────────────────────────────────────
console.log(`\n니케 이름 로케일 테스트 — 통과 ${pass} / 실패 ${fails.length}`);
if (fails.length) {
  console.log('');
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log('전부 통과\n');
