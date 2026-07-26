// 공개된 공략/티어표에 나온 "알려진 메타 조합" 초안 목록입니다.
// 실제 게임 밸런스 패치에 따라 수시로 바뀌므로, 사이트 운영 시 주기적으로 업데이트가 필요합니다.

export const COMBOS = [
  {
    id: 'campaign-core',
    name: '캠페인 메인 딜러 팀',
    purpose: '캠페인 / 일반 스테이지',
    description: '크라운의 방어+버프를 중심으로 리타가 버스트 사이클을 돌리고 레드 후드·모더니아가 화력을 담당하는 범용 캠페인 팀입니다.',
    members: ['crown', 'rita', 'red-hood', 'modernia', 'naga'],
  },
  {
    id: 'nublanc-boss',
    name: '누블랑 보스전 팀',
    purpose: '솔로/유니온 레이드, 보스전',
    description: '앨리스의 고정 코어 대미지에 블랑·누아르 듀오 시너지를 더한 보스전 특화 팀입니다.',
    members: ['alice', 'blanc', 'noir', 'rita', 'crown'],
  },
  {
    id: 'naga-tia-boss',
    name: '나가티아 보스전 팀',
    purpose: '솔로/유니온 레이드, 보스전',
    description: '티아·나가 듀오의 방어력 감소·탱킹으로 안정성을 확보하고 앨리스가 딜을 몰아치는 조합입니다.',
    members: ['tia', 'naga', 'alice', 'crown', 'dorothy'],
  },
  {
    id: 'pvp-burst-rush',
    name: 'PvP 고속 버스트 팀',
    purpose: '아레나 (PvP)',
    description: '자칼로 선제 버스트를 확보하고 노아·트리나·비스킷으로 버티며 홍련이 마무리하는 속공형 아레나 팀입니다.',
    members: ['jackal', 'noa', 'trina', 'biscuit', 'scarlet'],
  },
  {
    id: 'velvet-wind-code',
    name: '벨벳 우월코드(풍압) 팀',
    purpose: '솔로 레이드 상위권',
    description: '벨벳을 중심으로 한 풍압 속성 우월 코드 특화 조합으로, 상위 3% 솔로 레이드를 노리는 유저에게 추천됩니다.',
    members: ['nayuta', 'scarlet-black-shadow', 'liberalio', 'little-mermaid', 'velvet'],
  },
  {
    id: 'label-defense',
    name: '라벨 PvP 방어 팀',
    purpose: '아레나 방어팀',
    description: '라벨의 무적 보호막으로 초기 폭딜을 견디는 챌린저 랭크용 방어 특화 조합입니다.',
    members: ['jackal', 'emilia', 'maiden-ice-rose', 'blanc', 'label'],
  },
];
