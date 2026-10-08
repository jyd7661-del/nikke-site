// data/characters.js(사이트에서 실제로 쓰는 보유 캐릭터 목록/id)와
// data/characterDatabase.json(스코어링 엔진이 쓰는 상세 데이터, title/tiers/skills 포함)을
// 이어주는 다리 역할.
//
// 2026-08-07 수정: 예전에는 두 파일을 '한국어 이름'으로 매칭했는데, 이름 표기가 조금만 어긋나도
// 정상 보유 캐릭터가 조용히 분석에서 빠지는 사고가 반복됐다. 실제로 이런 것들이 누락되고 있었다:
//   - 홍련(Scarlet), 유니(Yuni): characterDatabase의 name_kr이 위키 스크랩 오류로 "{{hover"였음
//   - 라벨: characters.js는 '라벨', characterDatabase는 '레이블'로 표기가 달랐음
// 홍련은 PvP SS 티어인데도 추천 계산에서 통째로 제외되고 있었다.
//
// 그래서 이름 매칭을 완전히 없애고 id로만 연결한다. UI id와 엔진 id가 다른 13명에는
// characters.js에 cdbId를 명시해 뒀다(예: rita -> liter). 표기가 어떻게 바뀌든 매칭은 깨지지 않고,
// 새 캐릭터를 추가하다 연결을 빠뜨리면 scripts/checkData.mjs의 UI_CDB_UNRESOLVED가 잡아준다.

import { CHARACTERS } from '../data/characters';
import characterDatabase from '../data/characterDatabase.json';

const cdbById = new Map(characterDatabase.map((c) => [c.id, c]));

// characters.js의 id → characterDatabase.json 항목 매핑을 한 번만 계산해 캐시.
// cdbId가 명시돼 있으면 그것을, 없으면 id가 같다고 보고 연결한다.
const rosterIdToCdb = new Map(
  CHARACTERS
    .map((c) => [c.id, cdbById.get(c.cdbId || c.id)])
    .filter(([, cdbChar]) => Boolean(cdbChar))
);

// **상시 모집 SR** — 콜라보가 아닌 SR(제조사 abnormal = 콜라보 한정). 2026-10-08 유저: "SR 중에서 뽑기에서 쉽게 뽑을 수 있는 애들은
// 상시 선택이 좋아 보이는데" — 일반 모집에서 흔히 나오고 라피·아니스·네온은 스토리로 받으니 사실상 누구나 가졌다. 홈 화면이 처음부터
// 보유로 골라 두고(해제 가능) 'SR 포함' 토글 없이도 보인다. 콜라보 SR(히메노·파스칼·람…)은 기간 한정이라 토글 뒤에 둔다.
// 판정은 데이터(characterDatabase.manufacturer)에서 — 새 SR이 들어오면 자동으로 따라간다.
export const STANDARD_SR_IDS = CHARACTERS
  .filter((c) => c.rarity === 'SR' && rosterIdToCdb.get(c.id) && rosterIdToCdb.get(c.id).manufacturer !== 'abnormal')
  .map((c) => c.id);
const STANDARD_SR_SET = new Set(STANDARD_SR_IDS);
export const isStandardSR = (id) => STANDARD_SR_SET.has(id);

// UI id 하나를 characterDatabase 항목으로 바꾼다. 화면에서 티어 같은 원본 값을 보여줄 때 쓴다.
// 여기서도 cdbId 매핑을 그대로 타므로 rita→liter 같은 13명이 조용히 빠지지 않는다.
export function cdbForRosterId(id) {
  return rosterIdToCdb.get(id) || null;
}

// 보유 캐릭터 id 배열(+선택적으로 애장품 장착한 id 목록)을 받아
// { resolved, unresolved, treasureCdbIds } 반환.
export function resolveRosterIdsToCdb(ownedIds, treasureIds = new Set()) {
  const resolved = [];
  const unresolved = [];
  const treasureCdbIds = new Set();
  ownedIds.forEach((id) => {
    const cdbChar = rosterIdToCdb.get(id);
    if (cdbChar) {
      resolved.push(cdbChar);
      if (treasureIds.has(id)) treasureCdbIds.add(cdbChar.id);
    } else {
      unresolved.push(id);
    }
  });
  return { resolved, unresolved, treasureCdbIds };
}
