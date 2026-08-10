#!/usr/bin/env node
/**
 * lib/glossary.js 치환 로직 테스트
 *
 *   node scripts/testGlossary.mjs
 *
 * 왜 필요한가:
 * 이름 치환은 틀려도 에러가 안 난다. "확신이"의 '신'을 캐릭터로 바꿔버려도 프로그램은
 * 멀쩡히 돌고, 번역된 글만 조용히 이상해진다. 사람이 세 언어를 다 읽어보지 않으면
 * 발견되지 않는 유형이라 자동 검사가 반드시 필요하다.
 *
 * lib/glossary.js는 '@/data/...' 별칭을 쓰므로(Next.js 설정) 여기서 상대경로로 바꿔
 * /tmp에 복사한 뒤 불러온다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
// Next.js는 JSON import를 알아서 처리하지만 순수 node ESM은 import attribute를 요구한다.
// 테스트에서만 fs로 읽어 넣는 형태로 바꾼다(로직은 그대로).
const dataUrl = (f) => pathToFileURL(path.join(ROOT, 'data', f)).href;
const src = fs.readFileSync(path.join(ROOT, 'lib', 'glossary.js'), 'utf8')
  .replace(/^import characters from '@\/data\/characterDatabase\.json';$/m,
    `import fs0 from 'node:fs';\nconst characters = JSON.parse(fs0.readFileSync(new URL('${dataUrl('characterDatabase.json')}'), 'utf8'));`)
  .replace(/^import glossaryData from '@\/data\/glossary\.json';$/m,
    `const glossaryData = JSON.parse(fs0.readFileSync(new URL('${dataUrl('glossary.json')}'), 'utf8'));`);
const tmp = path.join(os.tmpdir(), `glossary-test-${process.pid}.mjs`);
fs.writeFileSync(tmp, src);
const G = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

// 원문을 보호했다가 대상 언어로 되돌린 최종 결과.
// (실제로는 가운데에 AI 번역이 들어가지만, 여기서는 토큰이 그대로 남아 있다고 가정한다 —
//  이름이 제자리에 정확히 들어가는지만 본다)
const roundTrip = (text, from, to) => {
  const { masked, used } = G.protectText(text, from);
  const r = G.restoreText(masked, used, to);
  return { masked, used, ...r };
};

// ---------------------------------------------------------------------------
// 1. 한국어 — 조사가 붙어도 이름이 잡혀야 한다
// ---------------------------------------------------------------------------
{
  const r = roundTrip('라피가 좋아', 'ko', 'ja');
  check('ko 조사(가)', r.text === 'ラピ가 좋아', `결과=${r.text}`);
  check('ko 조사(가) 토큰 1개', r.used.length === 1, `used=${r.used.length}`);
}
{
  const r = roundTrip('네온을 키웠어', 'ko', 'en');
  check('ko 조사(을)', r.text === 'Neon을 키웠어', `결과=${r.text}`);
}
{
  const r = roundTrip('앵커는 방어형이야', 'ko', 'ja');
  check('ko 조사(는) + 용어', r.text === 'アンカー는 防御型이야', `결과=${r.text}`);
}

// ---------------------------------------------------------------------------
// 2. 한국어 — 낱말 한가운데를 건드리면 안 된다
// ---------------------------------------------------------------------------
{
  // '앵커'로 시작하는 더 긴 한글 낱말. 조사가 아닌 한글이 이어지므로 매치되면 안 된다.
  const r = roundTrip('앵커리지에 갔다', 'ko', 'ja');
  check('ko 낱말 중간 미매치', r.used.length === 0, `used=${r.used.length}, 결과=${r.text}`);
}
{
  // 긴 이름이 먼저 먹어야 짧은 이름이 그 안에서 따로 잡히지 않는다
  const r = roundTrip('헬름 : 아쿠아마린 뽑음', 'ko', 'ja');
  check('ko 긴 이름 우선', r.used.length === 1 && r.text.startsWith('ヘルム：アクアマリン'),
    `used=${r.used.length}, 결과=${r.text}`);
}

// ---------------------------------------------------------------------------
// 3. 모호한 이름은 치환하지 않는다 (문맥을 봐야 구분되는 것들)
// ---------------------------------------------------------------------------
{
  const r = roundTrip('확신이 안 서네', 'ko', 'ja');
  check('ko 모호어 미치환(확신)', r.used.length === 0, `used=${r.used.length}, 결과=${r.text}`);
}
{
  const r = roundTrip('소다 마시고 싶다', 'ko', 'ja');
  check('ko 모호어 미치환(소다)', r.used.length === 0, `used=${r.used.length}, 결과=${r.text}`);
}
{
  // 대신 프롬프트용 힌트에는 잡혀야 한다
  const hints = G.ambiguousHints('소다 뽑았어', 'ko', 'ja');
  check('ko 모호어가 힌트에는 잡힘', hints.some((h) => h.from === '소다' && h.to === 'ソーダ'),
    JSON.stringify(hints));
}

// ---------------------------------------------------------------------------
// 4. 일본어 — 띄어쓰기가 없으므로 글자 종류로 경계를 본다
// ---------------------------------------------------------------------------
{
  const r = roundTrip('ラピが好き', 'ja', 'ko');
  check('ja 조사(が)', r.text === '라피が好き', `결과=${r.text}`);
}
{
  // シンデレラ 안의 シン이 따로 잡히면 안 된다 (シン은 모호어라 애초에 제외되지만,
  // 긴 이름 우선 규칙 자체가 동작하는지 확인한다)
  const r = roundTrip('シンデレラ強い', 'ja', 'ko');
  check('ja 긴 이름 우선', r.used.length === 1 && r.text.startsWith('신데렐라'),
    `used=${r.used.length}, 결과=${r.text}`);
}
{
  const r = roundTrip('ヘルム：アクアマリン引いた', 'ja', 'en');
  check('ja 코스튬 전체 매치', r.used.length === 1 && r.text.startsWith('Helm: Aquamarine'),
    `used=${r.used.length}, 결과=${r.text}`);
}

// ---------------------------------------------------------------------------
// 5. 영어 — 낱말 경계
// ---------------------------------------------------------------------------
{
  const r = roundTrip('Delta is good', 'en', 'ko');
  check('en 단어 경계(Delta 안의 D 아님)', r.used.length === 1 && r.text.startsWith('델타'),
    `used=${r.used.length}, 결과=${r.text}`);
}
{
  const r = roundTrip('Snow White: Innocent Days is strong', 'en', 'ja');
  check('en 긴 이름 우선', r.used.length === 1 && r.text.startsWith('スノーホワイト：イノセントデイズ'),
    `used=${r.used.length}, 결과=${r.text}`);
}

// ---------------------------------------------------------------------------
// 6. 여러 개가 섞인 실제 문장
// ---------------------------------------------------------------------------
{
  const r = roundTrip('라피 : 레드 후드랑 네온 : 비전 아이 조합 어때? 둘 다 엘리시온이야', 'ko', 'ja');
  check('ko 복합 문장 — 이름 2 + 용어 1', r.used.length === 3, `used=${r.used.length}`);
  check('ko 복합 문장 — 복원 성공', r.ok, `missing=${r.missing}`);
  check('ko 복합 문장 — 표기 정확',
    r.text.includes('ラピ：レッドフード') && r.text.includes('ネオン：ビジョン・アイ') && r.text.includes('エリシオン'),
    `결과=${r.text}`);
}

// ---------------------------------------------------------------------------
// 7. 번역이 토큰을 망가뜨린 경우를 잡아내는가 (이게 안전장치의 핵심)
// ---------------------------------------------------------------------------
{
  const { masked, used } = G.protectText('라피가 좋아', 'ko');
  const broken = masked.replace(/⟦0⟧/, ''); // AI가 토큰을 지워버린 상황
  const r = G.restoreText(broken, used, 'ja');
  check('토큰 소실 감지', r.ok === false && r.missing.length === 1, JSON.stringify(r));
}
{
  const { used } = G.protectText('라피가 좋아', 'ko');
  const r = G.restoreText('⟦0⟧が好き ⟦7⟧', used, 'ja'); // AI가 없는 번호를 만들어낸 상황
  check('없는 토큰 감지', r.ok === false && r.leftover.length === 1, JSON.stringify(r));
}

// ---------------------------------------------------------------------------
// 7-1. 한글 'D'는 치환하지 않는다 (2026-08-10)
//
// 한국 서버 정식 표기가 알파벳 D라 name_kr을 'D'로 바꿨다. 그대로 두면 한국어 문장 속
// 아무 D나 캐릭터로 잡혀 본문이 깨진다. 모호어로 빼서 AI가 문맥으로 판단하게 한다.
// ---------------------------------------------------------------------------
{
  const r = roundTrip('D랭크 보상 받았다', 'ko', 'ja');
  check('ko D 미치환(D랭크)', r.used.length === 0, `used=${r.used.length}, 결과=${r.text}`);
}
{
  const r = roundTrip('D 키우는 중', 'ko', 'ja');
  check('ko D 미치환(단독)', r.used.length === 0, `used=${r.used.length}, 결과=${r.text}`);
  const hints = G.ambiguousHints('D 키우는 중', 'ko', 'ja');
  check('ko D가 힌트에는 잡힘', hints.some((h) => h.from === 'D' && h.to === 'D'), JSON.stringify(hints));
}
{
  // 코스튬 이름(D : 킬러 와이프)은 모호어가 아니므로 그대로 치환돼야 한다
  const r = roundTrip('D : 킬러 와이프 뽑음', 'ko', 'ja');
  check('ko D 코스튬은 치환됨', r.used.length === 1 && r.text.startsWith('D：キラーワイフ'),
    `used=${r.used.length}, 결과=${r.text}`);
}

// ---------------------------------------------------------------------------
// 8. 용어집 버전은 안정적인가 (같은 데이터면 같은 값)
// ---------------------------------------------------------------------------
{
  check('glossaryVersion 안정', G.glossaryVersion() === G.glossaryVersion(), G.glossaryVersion());
}

// ---------------------------------------------------------------------------
// 9. 원문 언어 판별 (lib/i18n.js의 detectLang)
//
// 이걸 틀리면 "한국어 글을 한국어로 번역"하는 헛일을 하고, 정작 필요한 언어는 안 만든다.
// 게다가 화면에는 원문이 그대로 나올 뿐이라 에러로 드러나지 않는다.
// ---------------------------------------------------------------------------
{
  const I = await import(pathToFileURL(path.join(ROOT, 'lib', 'i18n.js')).href);
  const cases = [
    ['라피가 좋아', 'ko'],
    ['ラピが好き', 'ja'],
    ['Rapi is good', 'en'],
    ['라피 Red Hood 조합', 'ko'],        // 한글이 섞이면 한국어
    ['ラピ Red Hood 編成', 'ja'],         // 가나가 섞이면 일본어
    ['紅蓮強い', 'ja'],                   // 한자만 → 일본어(중국어 미지원)
    ['ㅋㅋㅋ', 'ko'],                     // 호환 자모도 한국어 단서로 센다
    ['', 'ko'],                           // 빈 문자열은 fallback
    ['123 !!!', 'ko'],                    // 글자 단서 없음 → fallback
    ['gg wp', 'en'],                      // 라틴만 → 영어 (fallback으로 넘기면 영어 번역이 안 생긴다)
  ];
  for (const [text, want] of cases) {
    const got = I.detectLang(text);
    check(`detectLang(${JSON.stringify(text)})`, got === want, `기대=${want} 실제=${got}`);
  }
  check('detectLang fallback 지정', I.detectLang('12345', 'ja') === 'ja', I.detectLang('12345', 'ja'));
}

// ---------------------------------------------------------------------------
const line = '─'.repeat(72);
console.log(`\n${line}\n번역 용어 보호 테스트`);
console.log(`용어집 버전: ${G.glossaryVersion()} / 항목 ${G.buildIndex().entries.length}개`);
console.log(line);
if (fails.length) {
  console.log(`\n❌ 실패 ${fails.length}건\n`);
  fails.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f}`));
} else {
  console.log('\n✅ 전부 통과\n');
}
console.log(`${line}\n통과 ${pass} / 실패 ${fails.length}\n${line}\n`);
process.exit(fails.length ? 1 : 0);
