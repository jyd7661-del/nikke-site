// 니케 캐릭터 데이터 (2026년 7월 메타 기준, 공개된 티어표/공략 정보를 바탕으로 정리한 초안)
// tier: T0(최상) ~ T4(하위) / burst: 1=서포터·힐러, 2=탱커·버퍼, 3=메인딜러
// role: 화면 표시 및 추천 로직에 사용되는 태그

export const CHARACTERS = [
  // ── 버스트 I (서포터 / 힐러) ─────────────────────────
  { id: 'little-mermaid', name: '리틀 머메이드', burst: 1, tier: 'T0', role: ['서포터', '배터리'], img: '4/44/Little_Mermaid_MI.png' },
  { id: 'rita', name: '리타', burst: 1, tier: 'T1', role: ['서포터', '버퍼'], img: null },
  { id: 'rouge', name: '루주', burst: 1, tier: 'T1', role: ['서포터', '힐러'], img: '1/1a/Rouge_MI.png' },
  { id: 'tove', name: '토브', burst: 1, tier: 'T1', role: ['서포터', '힐러'], img: '7/7d/Tove_MI.png' },
  { id: 'miranda', name: '미란다', burst: 1, tier: 'T1', role: ['서포터', '버퍼'], img: '5/51/Miranda_MI.png' },
  { id: 'volume', name: '볼륨', burst: 1, tier: 'T2', role: ['서포터'], img: '7/72/Volume_MI.png' },
  { id: 'soline', name: '솔린: 프로스트 티켓', burst: 1, tier: 'T2', role: ['서포터', '힐러'], img: '4/4e/Soline_MI.png' },
  { id: 'tia', name: '티아', burst: 1, tier: 'T2', role: ['서포터', '디버퍼'], img: '5/59/Tia_MI.png' },
  { id: 'd-killer-wife', name: 'D: 킬러 와이프', burst: 1, tier: 'T2', role: ['서포터'], img: 'c/c9/D_Killer_Wife_MI.png' },
  { id: 'eve', name: '이브', burst: 1, tier: 'T2', role: ['서포터', '힐러'], img: '4/4a/EVE_MI.png' },
  { id: 'soda', name: '소다: 트윙클링 바니', burst: 1, tier: 'T2', role: ['서포터'], img: '7/76/Soda_MI.png' },
  { id: 'milk', name: '밀크: 블루밍 바니', burst: 1, tier: 'T2', role: ['서포터', '힐러'], img: '3/30/Milk_MI.png' },
  { id: 'dorothy', name: '도로시', burst: 1, tier: 'T3', role: ['서포터'], img: 'b/b2/Dorothy_MI.png' },
  { id: 'alice-bunny', name: '앨리스: 원더랜드 바니', burst: 1, tier: 'T3', role: ['서포터'], img: 'd/d5/Alice_Wonderland_Bunny_MI.png' },
  { id: 'emma-tactical', name: '엠마: 택티컬 업', burst: 1, tier: 'T3', role: ['서포터'], img: '3/32/Emma_Tactical_Upgrade_MI.png' },
  { id: 'exia', name: '엑시아', burst: 1, tier: 'T3', role: ['서포터'], img: 'd/df/Exia_MI.png' },
  { id: 'jackal', name: '자칼', burst: 1, tier: 'T0', role: ['서포터', 'PvP'], img: '5/55/Jackal_MI.png' },
  { id: 'rosanna', name: '로산나', burst: 1, tier: 'T1', role: ['서포터', 'PvP'], img: 'b/b8/Rosanna_MI.png' },
  { id: 'label', name: '라벨', burst: 1, tier: 'T1', role: ['서포터', 'PvP', '방어형'], img: 'a/af/Label_MI.png' },

  // ── 버스트 II (탱커 / 버퍼) ─────────────────────────
  { id: 'crown', name: '크라운', burst: 2, tier: 'T0', role: ['탱커', '버퍼'], img: '7/7b/Crown_MI.png' },
  { id: 'nayuta', name: '나유타', burst: 2, tier: 'T0', role: ['버퍼', '배터리'], img: '1/19/Nayuta_MI.png' },
  { id: 'maste', name: '마스트: 로망틱 메이드', burst: 2, tier: 'T0', role: ['탱커', '버퍼'], img: '2/22/Mast_Romantic_Maid_MI.png' },
  { id: 'anchor', name: '앵커: 이노센트 메이드', burst: 2, tier: 'T1', role: ['탱커'], img: 'd/d1/Anchor_MI.png' },
  { id: 'grave', name: '그레이브', burst: 2, tier: 'T1', role: ['탱커', '디버퍼'], img: '8/8a/Grave_MI.png' },
  { id: 'ade', name: '에이드: 에이전트 바니', burst: 2, tier: 'T1', role: ['버퍼'], img: '9/99/Ade_MI.png' },
  { id: 'velvet', name: '벨벳', burst: 2, tier: 'T1', role: ['어태커', '서포터'], img: '1/15/Velvet_MI.png' },
  { id: 'blanc', name: '블랑', burst: 2, tier: 'T2', role: ['탱커', '버퍼'], img: '8/8c/Blanc_MI.png' },
  { id: 'arcana', name: '아르카나', burst: 2, tier: 'T2', role: ['탱커'], img: '8/8b/Arcana_MI.png' },
  { id: 'naga', name: '나가', burst: 2, tier: 'T2', role: ['탱커', '디버퍼'], img: 'f/f6/Naga_MI.png' },
  { id: 'helm-aqua', name: '헬름: 아쿠아마린', burst: 2, tier: 'T2', role: ['버퍼'], img: 'f/fb/Helm_Aquamarine_MI.png' },
  { id: 'viper', name: '바이퍼', burst: 2, tier: 'T3', role: ['탱커'], img: 'a/a4/Viper_MI.png' },
  { id: 'trina', name: '트리나', burst: 2, tier: 'T0', role: ['버퍼', 'PvP'], img: 'f/fa/Trina_MI.png' },
  { id: 'biscuit', name: '비스킷', burst: 2, tier: 'T0', role: ['탱커', 'PvP'], img: '2/21/Biscuit_MI.png' },
  { id: 'noa', name: '노아', burst: 2, tier: 'T0', role: ['탱커', 'PvP'], img: '8/80/Noah_MI.png' },

  // ── 버스트 III (메인 딜러) ─────────────────────────
  { id: 'snow-white', name: '스노우 화이트', burst: 3, tier: 'T0', role: ['딜러'], img: '2/24/Snow_White_MI.png' },
  { id: 'rapi-red-hood', name: '라피: 레드 후드', burst: 3, tier: 'T0', role: ['딜러'], img: 'c/c5/Rapi_Red_Hood_MI.png' },
  { id: 'helm', name: '헬름', burst: 3, tier: 'T0', role: ['딜러'], img: '8/8a/Helm_MI.png' },
  { id: 'liberalio', name: '리버렐리오', burst: 3, tier: 'T0', role: ['딜러'], img: '5/5c/Liberalio_MI.png' },
  { id: 'cinderella', name: '신데렐라', burst: 3, tier: 'T0', role: ['딜러'], img: 'b/b2/Cinderella_MI.png' },
  { id: 'dorothy-serendipity', name: '도로시: 세렌디피티', burst: 3, tier: 'T1', role: ['딜러'], img: 'f/f1/Dorothy_Serendipity_MI.png' },
  { id: 'diesel', name: '디젤: 윈터 스위츠', burst: 3, tier: 'T1', role: ['딜러'], img: 'c/c9/Diesel_MI.png' },
  { id: 'drake', name: '드레이크', burst: 3, tier: 'T1', role: ['딜러'], img: 'e/e9/Drake_MI.png' },
  { id: 'mihara', name: '미하라: 본딩 체인', burst: 3, tier: 'T1', role: ['딜러'], img: 'b/b9/Mihara_MI.png' },
  { id: 'scarlet-black-shadow', name: '홍련: 흑영', burst: 3, tier: 'T1', role: ['딜러'], img: 'd/d9/Scarlet_Black_Shadow_MI.png' },
  { id: 'raven', name: '레이븐', burst: 3, tier: 'T1', role: ['딜러'], img: '0/02/Raven_MI.png' },
  { id: 'maiden-ice-rose', name: '메이든: 아이스 로즈', burst: 3, tier: 'T1', role: ['딜러', 'PvP'], img: '2/24/Maiden_Ice_Rose_MI.png' },
  { id: 'ada-wong', name: '에이다 웡', burst: 3, tier: 'T1', role: ['딜러'], img: '4/4b/Ada_Wong_MI.png' },
  { id: 'alice', name: '앨리스', burst: 3, tier: 'T2', role: ['딜러'], img: 'c/ce/Alice_MI.png' },
  { id: 'anis-summer', name: '아니스: 스파클링 서머', burst: 3, tier: 'T2', role: ['딜러'], img: 'e/ea/Anis_Sparkling_Summer_MI.png' },
  { id: 'modernia', name: '모더니아', burst: 3, tier: 'T2', role: ['딜러'], img: '8/80/Modernia_MI.png' },
  { id: 'guillotine-winter', name: '길로틴: 윈터 슬레이어', burst: 3, tier: 'T2', role: ['딜러'], img: '8/8c/Guillotine_Winter_Slayer_MI.png' },
  { id: 'red-hood', name: '레드 후드', burst: 3, tier: 'T2', role: ['딜러'], img: 'c/ca/Red_Hood_MI.png' },
  { id: '2b', name: '2B', burst: 3, tier: 'T3', role: ['딜러'], img: '1/16/2B_MI.png' },
  { id: 'scarlet', name: '홍련', burst: 3, tier: 'T3', role: ['딜러', 'PvP'], img: '4/45/Scarlet_MI.png' },
  { id: 'laplace', name: '라플라스', burst: 3, tier: 'T3', role: ['딜러'], img: '6/68/Laplace_MI.png' },
  { id: 'julia', name: '율리아', burst: 3, tier: 'T3', role: ['딜러'], img: '4/45/Julia_MI.png' },
  { id: 'emilia', name: '에밀리아', burst: 3, tier: 'T0', role: ['딜러', 'PvP'], img: '1/15/Emilia_MI.png' },
  { id: 'noir', name: '누아르', burst: 3, tier: 'T3', role: ['딜러'], img: '1/14/Noir_MI.png' },
];

export const BURST_LABEL = { 1: '버스트 I (서포터/힐러)', 2: '버스트 II (탱커/버퍼)', 3: '버스트 III (메인딜러)' };
export const TIER_ORDER = ['T0', 'T1', 'T2', 'T3', 'T4'];
