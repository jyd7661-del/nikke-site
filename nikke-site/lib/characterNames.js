// 캐릭터 이름을 선택한 언어로 보여주기 위한 해석 계층 (2026-08-10 신설).
//
// 왜 필요한가:
//   화면에서 니케 목록을 그리는 건 data/characters.js(보유 선택용 로스터)인데
//   이 파일의 `name`은 **한국어 한 가지뿐**이다. 반면 3개국어 표기
//   (title / name_kr / name_ja)는 data/characterDatabase.json에만 있다.
//   그래서 언어를 일본어로 바꿔도 니케 이름만 한국어로 남아 있었다.
//
//   두 파일을 합치는 건 티어(T0~T4)·hasTreasure·cdbId 매핑까지 얽혀 있어 위험이 크다.
//   여기서는 **연결만** 해서 표시 문제를 먼저 없앤다. 통합은 별건으로 다룬다.
//
// 연결 규칙은 lib/rosterBridge.js와 같다 — 이름이 아니라 **id로만** 잇는다.
// (이름 매칭은 표기가 조금만 어긋나도 조용히 깨져서 2026-08-07에 이미 한 번 사고가 났다)

import { CHARACTERS } from '../data/characters';
import characterDatabase from '../data/characterDatabase.json';
import { DEFAULT_LOCALE } from './i18n';

const cdbById = new Map(characterDatabase.map((c) => [c.id, c]));

// uiId -> { ko, en, ja, search }
const NAME_TABLE = new Map();

for (const c of CHARACTERS) {
  const cdb = cdbById.get(c.cdbId || c.id);
  // cdb를 못 찾으면(=checkData의 UI_CDB_UNRESOLVED가 잡는 상황) 기존 한국어 이름으로 버틴다.
  // 이름이 사라지는 것보다 한 언어로라도 보이는 편이 낫다.
  const ko = cdb?.name_kr || c.name;
  const en = cdb?.title || c.name;
  const ja = cdb?.name_ja || ko;
  NAME_TABLE.set(c.id, {
    ko,
    en,
    ja,
    // 검색은 어느 언어로 쳐도 걸리게 한다. 일본 사용자가 "ラピ"로 쳐도,
    // 영어권이 "Rapi"로 쳐도, 한국 사용자가 "라피"로 쳐도 같은 결과가 나와야 한다.
    search: [ko, en, ja, c.name, c.id].filter(Boolean).join(' ').toLowerCase(),
  });
}

function pick(entry, lang) {
  if (!entry) return null;
  return entry[lang] || entry[DEFAULT_LOCALE] || entry.ko || null;
}

// 로스터(data/characters.js) 기준 캐릭터의 표시 이름.
// 인자는 id 문자열이거나 캐릭터 객체 둘 다 받는다.
export function characterName(idOrChar, lang = DEFAULT_LOCALE) {
  const id = typeof idOrChar === 'string' ? idOrChar : idOrChar?.id;
  const fallback = typeof idOrChar === 'string' ? id : (idOrChar?.name || id);
  return pick(NAME_TABLE.get(id), lang) || fallback || '';
}

// 검색용 문자열(소문자). 세 언어 + 원본 표기 + id가 모두 들어 있다.
export function characterSearchText(idOrChar) {
  const id = typeof idOrChar === 'string' ? idOrChar : idOrChar?.id;
  return NAME_TABLE.get(id)?.search || String(id || '').toLowerCase();
}

// 캐릭터 객체의 `name`만 현재 언어로 갈아끼운 사본.
// CharacterAvatar가 alt/이니셜에 `character.name`을 쓰기 때문에 객체째로 넘기는 쪽이 안전하다.
export function localizedCharacter(c, lang = DEFAULT_LOCALE) {
  if (!c) return c;
  return { ...c, name: characterName(c, lang) };
}

// memberName은 lib/memberName.js에 있다 — 데이터 파일을 읽지 않는 순수 모듈이라
// 클라이언트 컴포넌트가 import해도 characterDatabase.json 666KB를 끌어오지 않는다.
// 정의는 그쪽 한 곳뿐이고 여기서는 재수출만 한다(이름 규칙이 갈라지지 않게).
export { memberName } from './memberName';
