// data/characters.js(사이트에서 실제로 쓰는 보유 캐릭터 목록/id)와
// data/characterDatabase.json(스코어링 엔진이 쓰는 상세 데이터, title/tiers/skills 포함)을
// 이어주는 다리 역할. 두 파일은 각각 다른 시점에 만들어져 id 체계가 완전히 일치하지 않을 수
// 있어서, 이름(name_kr) 기준으로 매칭한다. (README '데이터 업데이트 방법' 참고)
//
// 주의: characters.js는 '이름: 부제'(콜론 앞 공백 없음), characterDatabase.json은
// '이름 : 부제'(콜론 앞뒤 공백) 형식을 섞어 쓰고 있어, 콜론 주변 공백 차이를 무시하고
// 비교하지 않으면 정상적으로 보유 중인 캐릭터도 매칭에 실패해 분석에서 누락된다.

import { CHARACTERS } from '../data/characters';
import characterDatabase from '../data/characterDatabase.json';

const normalizeName = (name) => (name || '').replace(/\s*:\s*/g, ':').trim();

const nameToCdb = new Map(characterDatabase.map((c) => [normalizeName(c.name_kr), c]));

// characters.js의 id → characterDatabase.json 항목 매핑을 한 번만 계산해 캐시.
const rosterIdToCdb = new Map(
  CHARACTERS
    .map((c) => [c.id, nameToCdb.get(normalizeName(c.name))])
    .filter(([, cdbChar]) => Boolean(cdbChar))
);

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
