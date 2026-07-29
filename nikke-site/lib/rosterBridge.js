// data/characters.js(사이트에서 실제로 쓰는 보유 캐릭터 목록/id)와
// data/characterDatabase.json(스코어링 엔진이 쓰는 상세 데이터, title/tiers/skills 포함)을
// 이어주는 다리 역할. 두 파일은 각각 다른 시점에 만들어져 id 체계가 완전히 일치하지 않을 수
// 있어서, 이름(name_kr) 기준으로 매칭한다. (README '데이터 업데이트 방법' 참고)

import { CHARACTERS } from '../data/characters';
import characterDatabase from '../data/characterDatabase.json';

const nameToCdb = new Map(characterDatabase.map((c) => [c.name_kr, c]));

// characters.js의 id → characterDatabase.json 항목 매핑을 한 번만 계산해 캐시.
const rosterIdToCdb = new Map(
  CHARACTERS
    .map((c) => [c.id, nameToCdb.get(c.name)])
    .filter(([, cdbChar]) => Boolean(cdbChar))
);

// 보유 캐릭터 id 배열(+선택적으로 애장품 장착한 id 목록)을 받아
// { resolved, unresolved, treasureCdbIds } 반환.
// resolved: 엔진이 바로 쓸 수 있는 characterDatabase.json 형태 객체 배열
// unresolved: 아직 상세 데이터(스킬/티어)가 없어 엔진 분석에서 제외된 id 배열
// treasureCdbIds: treasureIds 중 resolved된 항목의 characterDatabase.json id 집합
//   (lib/synergyEngine.js의 scoreTeam/recommendTeams에 그대로 전달해서 사용)
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
