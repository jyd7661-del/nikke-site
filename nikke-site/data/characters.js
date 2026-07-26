// 니케 캐릭터 데이터 (2026년 7월 메타 기준, 공개된 티어표/공략 정보를 바탕으로 정리한 초안)
// tier: T0(최상) ~ T4(하위) / burst: 1=서포터·힐러, 2=탱커·버퍼, 3=메인딜러
// role: 화면 표시 및 추천 로직에 사용되는 태그

export const CHARACTERS = [
  // ── 버스트 I (서포터 / 힐러) ─────────────────────────
  { id: 'little-mermaid', name: '리틀 머메이드', burst: 1, tier: 'T0', role: ['서포터', '배터리'] },
  { id: 'rita', name: '리타', burst: 1, tier: 'T1', role: ['서포터', '버퍼'] },
  { id: 'rouge', name: '루주', burst: 1, tier: 'T1', role: ['서포터', '힐러'] },
  { id: 'tove', name: '토브', burst: 1, tier: 'T1', role: ['서포터', '힐러'] },
  { id: 'miranda', name: '미란다', burst: 1, tier: 'T1', role: ['서포터', '버퍼'] },
  { id: 'volume', name: '볼륨', burst: 1, tier: 'T2', role: ['서포터'] },
  { id: 'soline', name: '솔린: 프로스트 티켓', burst: 1, tier: 'T2', role: ['서포터', '힐러'] },
  { id: 'tia', name: '티아', burst: 1, tier: 'T2', role: ['서포터', '디버퍼'] },
  { id: 'd-killer-wife', name: 'D: 킬러 와이프', burst: 1, tier: 'T2', role: ['서포터'] },
  { id: 'eve', name: '이브', burst: 1, tier: 'T2', role: ['서포터', '힐러'] },
  { id: 'soda', name: '소다: 트윙클링 바니', burst: 1, tier: 'T2', role: ['서포터'] },
  { id: 'milk', name: '밀크: 블루밍 바니', burst: 1, tier: 'T2', role: ['서포터', '힐러'] },
  { id: 'dorothy', name: '도로시', burst: 1, tier: 'T3', role: ['서포터'] },
  { id: 'alice-bunny', name: '앨리스: 원더랜드 바니', burst: 1, tier: 'T3', role: ['서포터'] },
  { id: 'emma-tactical', name: '엠마: 택티컬 업', burst: 1, tier: 'T3', role: ['서포터'] },
  { id: 'exia', name: '엑시아', burst: 1, tier: 'T3', role: ['서포터'] },
  { id: 'jackal', name: '자칼', burst: 1, tier: 'T0', role: ['서포터', 'PvP'] },
  { id: 'rosanna', name: '로산나', burst: 1, tier: 'T1', role: ['서포터', 'PvP'] },
  { id: 'label', name: '라벨', burst: 1, tier: 'T1', role: ['서포터', 'PvP', '방어형'] },

  // ── 버스트 II (탱커 / 버퍼) ─────────────────────────
  { id: 'crown', name: '크라운', burst: 2, tier: 'T0', role: ['탱커', '버퍼'] },
  { id: 'nayuta', name: '나유타', burst: 2, tier: 'T0', role: ['버퍼', '배터리'] },
  { id: 'maste', name: '마스트: 로망틱 메이드', burst: 2, tier: 'T0', role: ['탱커', '버퍼'] },
  { id: 'anchor', name: '앵커: 이노센트 메이드', burst: 2, tier: 'T1', role: ['탱커'] },
  { id: 'grave', name: '그레이브', burst: 2, tier: 'T1', role: ['탱커', '디버퍼'] },
  { id: 'ade', name: '에이드: 에이전트 바니', burst: 2, tier: 'T1', role: ['버퍼'] },
  { id: 'velvet', name: '벨벳', burst: 2, tier: 'T1', role: ['어태커', '서포터'] },
  { id: 'blanc', name: '블랑', burst: 2, tier: 'T2', role: ['탱커', '버퍼'] },
  { id: 'arcana', name: '아르카나', burst: 2, tier: 'T2', role: ['탱커'] },
  { id: 'naga', name: '나가', burst: 2, tier: 'T2', role: ['탱커', '디버퍼'] },
  { id: 'helm-aqua', name: '헬름: 아쿠아마린', burst: 2, tier: 'T2', role: ['버퍼'] },
  { id: 'viper', name: '바이퍼', burst: 2, tier: 'T3', role: ['탱커'] },
  { id: 'trina', name: '트리나', burst: 2, tier: 'T0', role: ['버퍼', 'PvP'] },
  { id: 'biscuit', name: '비스킷', burst: 2, tier: 'T0', role: ['탱커', 'PvP'] },
  { id: 'noa', name: '노아', burst: 2, tier: 'T0', role: ['탱커', 'PvP'] },

  // ── 버스트 III (메인 딜러) ─────────────────────────
  { id: 'snow-white', name: '스노우 화이트', burst: 3, tier: 'T0', role: ['딜러'] },
  { id: 'rapi-red-hood', name: '라피: 레드 후드', burst: 3, tier: 'T0', role: ['딜러'] },
  { id: 'helm', name: '헬름', burst: 3, tier: 'T0', role: ['딜러'] },
  { id: 'liberalio', name: '리버렐리오', burst: 3, tier: 'T0', role: ['딜러'] },
  { id: 'cinderella', name: '신데렐라', burst: 3, tier: 'T0', role: ['딜러'] },
  { id: 'dorothy-serendipity', name: '도로시: 세렌디피티', burst: 3, tier: 'T1', role: ['딜러'] },
  { id: 'diesel', name: '디젤: 윈터 스위츠', burst: 3, tier: 'T1', role: ['딜러'] },
  { id: 'drake', name: '드레이크', burst: 3, tier: 'T1', role: ['딜러'] },
  { id: 'mihara', name: '미하라: 본딩 체인', burst: 3, tier: 'T1', role: ['딜러'] },
  { id: 'scarlet-black-shadow', name: '홍련: 흑영', burst: 3, tier: 'T1', role: ['딜러'] },
  { id: 'raven', name: '레이븐', burst: 3, tier: 'T1', role: ['딜러'] },
  { id: 'maiden-ice-rose', name: '메이든: 아이스 로즈', burst: 3, tier: 'T1', role: ['딜러', 'PvP'] },
  { id: 'ada-wong', name: '에이다 웡', burst: 3, tier: 'T1', role: ['딜러'] },
  { id: 'alice', name: '앨리스', burst: 3, tier: 'T2', role: ['딜러'] },
  { id: 'anis-summer', name: '아니스: 스파클링 서머', burst: 3, tier: 'T2', role: ['딜러'] },
  { id: 'modernia', name: '모더니아', burst: 3, tier: 'T2', role: ['딜러'] },
  { id: 'guillotine-winter', name: '길로틴: 윈터 슬레이어', burst: 3, tier: 'T2', role: ['딜러'] },
  { id: 'red-hood', name: '레드 후드', burst: 3, tier: 'T2', role: ['딜러'] },
  { id: '2b', name: '2B', burst: 3, tier: 'T3', role: ['딜러'] },
  { id: 'scarlet', name: '홍련', burst: 3, tier: 'T3', role: ['딜러', 'PvP'] },
  { id: 'laplace', name: '라플라스', burst: 3, tier: 'T3', role: ['딜러'] },
  { id: 'julia', name: '율리아', burst: 3, tier: 'T3', role: ['딜러'] },
  { id: 'emilia', name: '에밀리아', burst: 3, tier: 'T0', role: ['딜러', 'PvP'] },
  { id: 'noir', name: '누아르', burst: 3, tier: 'T3', role: ['딜러'] },
];

export const BURST_LABEL = { 1: '버스트 I (서포터/힐러)', 2: '버스트 II (탱커/버퍼)', 3: '버스트 III (메인딜러)' };
export const TIER_ORDER = ['T0', 'T1', 'T2', 'T3', 'T4'];
