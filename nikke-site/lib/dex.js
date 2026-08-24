// 니케 도감(/nikke) 서버 페이지 공용 헬퍼 (2026-08-13, 성장 계획 Phase 1)
//
// 이 파일은 **서버 컴포넌트 전용**이다. 도감 페이지는 SEO를 위해 서버에서 정적 렌더되므로
// 클라이언트 i18n(lib/i18n.js)을 쓸 수 없고(개인정보처리방침 페이지와 같은 제약),
// 한국어를 기준 언어로 렌더한다. 페이지 안에 name_kr/title/name_ja를 함께 실어
// 세 언어 검색어 모두 색인되게 한다.
//
// 한국어 라벨은 data/glossary.json의 확정 표기를 따른다(화력형/수냉/작열 등 — 임의 번역 금지).
import db from '@/data/characterDatabase.json';
import syn from '@/data/synergyNotes.json';
import inv from '@/data/characterInvestmentNotes.json';

// characterDatabase.json은 최상위가 배열이다 (investmentNotes와 달리 래퍼 객체가 없음)
export const CHARACTERS = Array.isArray(db) ? db : db.characters;

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));
const BY_TITLE = new Map(CHARACTERS.map((c) => [c.title, c]));
const INV_BY_NAME = new Map((inv.characters || []).map((n) => [n.name, n]));

export function getCharacter(id) {
  return BY_ID.get(id) || null;
}

export function byTitle(title) {
  return BY_TITLE.get(title) || null;
}

export function investmentFor(title) {
  return INV_BY_NAME.get(title) || null;
}

// 이 캐릭터가 멤버로 들어 있는 prydwen 아키타입 (모드 무관 전체)
export function teamsFor(title) {
  return (syn.archetypes || []).filter((a) => (a.members || []).includes(title));
}

// glossary.json 확정 표기 (ko)
export const CLASS_KR = { attacker: '화력형', defender: '방어형', supporter: '지원형' };
export const ELEMENT_KR = { fire: '작열', water: '수냉', electric: '전격', iron: '철갑', wind: '풍압' };
export const CORP_KR = {
  elysion: '엘리시온', missilis: '미실리스', tetra: '테트라', pilgrim: '필그림',
  abnormal: '어브노멀',
};
export const WEAPON_KR = { ar: 'AR', mg: 'MG', rl: 'RL', sr: 'SR', sg: 'SG', smg: 'SMG' };
export const MODE_KR = {
  campaign: '캠페인', story: '캠페인', bossing: '보스전', raid: '보스전',
  pvp: 'PvP(아레나)', tribe_tower: '트라이브 타워',
};
// prydwen 티어리스트 아이콘 라벨 (docs/data.md)
export const TAG_KR = {
  limited: '한정 캐릭터',
  invest: '고투자 전제',
  expert: '수동 조작 숙련 필요',
  partner: '특정 동료와 함께일 때 강함',
};

// 언어별 라벨은 lib/dexLabels.js에 있다(클라이언트 안전 모듈).
// ⚠️ 여기서 재수출하지 않는다 — 클라이언트가 lib/dex를 import하면 characterDatabase.json
//    666KB가 브라우저 번들에 실린다. 필요한 쪽에서 lib/dexLabels를 직접 import할 것.
