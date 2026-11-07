// 캡처 고르기 — AI가 본 카드(이름 글자·아이콘) → 니케 id 고르기(matchObserved)의 회귀 검사.
//
// 왜 필요한가:
//   고르기 규칙은 실제 사용자 사진에서 틀린 것을 하나씩 막으며 자랐다. 규칙을 하나 고치면 다른 경우가 조용히 바뀔 수 있고,
//   화면에는 「확실」 체크 하나가 달라질 뿐이라 눈으로는 못 잡는다. 아래는 전부 실제 사진에서 나온 입력이다.
//   ⚠️ 「확실」(sure)이 틀리면 사용자가 확인 없이 넣는다(11-02 유저 "맞겠지 하고 그냥 넘겼거든") — 그래서 sure까지 본다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTERS } from '../data/characters.js';
import { matchObserved, altNamesFromCdb } from '../lib/rosterPhotoPrompt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/characterDatabase.json'), 'utf8'));
const cdbById = new Map((Array.isArray(raw) ? raw : raw.characters).map((c) => [c.id, c]));
const ALT = altNamesFromCdb(cdbById);

// [설명, AI가 본 카드, 언어, 기대 id, 기대 sure]
const CASES = [
  ['11-03 「라푼젤 : 퓨어 그레이스」 뒷부분이 빠짐 — 무기가 기본 라푼젤과 달라 확인 필요',
    { name: '라푼젤', element: 'iron', weapon: 'sg', burst: 1 }, 'ko', 'rapunzel', false],
  ['기본 라푼젤은 무기까지 맞으면 그대로 확실',
    { name: '라푼젤', element: 'iron', weapon: 'rl', burst: 1 }, 'ko', 'rapunzel', true],
  ['무기를 못 읽었으면(?) 이름이 우선 — 확실',
    { name: '라푼젤', element: 'iron', weapon: '?', burst: 1 }, 'ko', 'rapunzel', true],
  ['11-03 「스파클링 서머」 끝을 한 글자 잘못 읽음(쿨링서머) — 확인 필요로 찾는다',
    { name: '쿨링서머', element: 'electric', weapon: 'ar', burst: 3 }, 'ko', 'anis-summer', false],
  ['11-02 엠마 · 엠마: 택티컬 업은 이름 전체로 갈린다',
    { name: '엠마', element: 'fire', weapon: 'mg', burst: 1 }, 'ko', 'emma', true],
  ['11-02 버스트를 잘못 읽어도 이름 전체가 맞으면 그 니케(루드밀라 I → III)',
    { name: '루드밀라', element: 'water', weapon: 'mg', burst: 3 }, 'ko', 'ludmilla', true],
  ['11-03 「소다」(기본) — 같은 이름의 변형(트윙클링 바니)은 버스트가 달라 의심하지 않는다',
    { name: '소다', element: 'fire', weapon: 'ar', burst: 1 }, 'ko', 'soda-2', true],
  ['3글자 조각은 한 글자 다른 토막으로 찾지 않는다 — 「레이블」이 「퓨어 그레이스」에 붙었다',
    { name: '레이블', element: 'iron', weapon: 'ar', burst: 1, guess: 'none' }, 'ko', 'none', false],
  ['11-02 「리틀 머메이드」를 「거메이드」로 — 한 글자 다른 토막(확인 필요)',
    { name: '거메이드', element: 'wind', weapon: 'smg', burst: 1, guess: 'none' }, 'ko', 'little-mermaid', false],
  ['11-02 「아르카나 : 포츈 메이트」를 「가나 : 포춘」으로, 무기도 SR로 잘못 읽음(확인 필요)',
    { name: '가나 : 포춘', element: 'fire', weapon: 'sr', burst: 2, guess: 'none' }, 'ko', 'arcana-fortune-mate', false],
  ['11-03 「신데렐라 : 크리스탈 웨이브」를 「엘라 : 크리스」로(확인 필요)',
    { name: '엘라 : 크리스', element: 'iron', weapon: 'mg', burst: 3, guess: 'none' }, 'ko', 'cinderella-crystal-wave', false],
  ['11-03 「나이트」(철갑 AR III) — 맞는 이름이 없어 고르지 않는다',
    { name: '나이트', element: 'iron', weapon: 'ar', burst: 3, guess: 'none' }, 'ko', 'none', false],
  ['11-07 「루드밀라 : 윈터 오너」를 「릴터 윈너」로(두 글자 다름) — 무기까지 맞는 후보 3명 안이라 확인 필요로 찾는다',
    { name: '릴터 윈너', element: 'water', weapon: 'mg', burst: 3, guess: 'none' }, 'ko', 'ludmilla-winter-owner', false],
  ['R 등급 이름 조각은 아무와도 안 맞는다',
    { name: '프로덕트 23', element: 'wind', weapon: 'ar', burst: 2 }, 'ko', 'none', false],
  ['아직 DB에 없는 「라푼젤 : 생추어리」의 끝 조각은 아무와도 안 맞는다',
    { name: '어리', element: 'fire', weapon: 'rl', burst: 2 }, 'ko', 'none', false],
  ['영어 화면 — 이름 전체가 맞으면 확실',
    { name: 'Mihara', element: 'water', weapon: 'ar', burst: 3 }, 'en', 'mihara-sr', true],
];

let bad = 0;
for (const [why, card, lang, wantId, wantSure] of CASES) {
  const r = matchObserved(card, CHARACTERS, cdbById, lang === 'ko' ? null : ALT);
  const ok = r.id === wantId && r.sure === wantSure;
  if (!ok) { bad++; console.error(`  ERROR ${why}\n        → ${r.id} sure=${r.sure} (${r.how}) · 기대 ${wantId} sure=${wantSure}`); }
}
console.log(bad ? `ERROR ${bad} — 캡처 고르기 규칙` : `ERROR 0 — 캡처 고르기 규칙 ${CASES.length}건 정상`);
process.exit(bad ? 1 : 0);
