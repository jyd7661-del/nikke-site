// 공개된 공략/티어표에 나온 "알려진 메타 조합" 초안 목록입니다.
// 실제 게임 밸런스 패치에 따라 수시로 바뀌므로, 사이트 운영 시 주기적으로 업데이트가 필요합니다.
//
// 이름·용도·설명은 문구가 아니라 **i18n 키**를 들고 있습니다(2026-08-11).
// 예전에는 한국어 문자열이 직접 박혀 있어서, 언어를 일본어로 바꿔도 "조금만 더 모으면
// 완성되는 조합" 섹션만 한국어로 남았습니다. 조합이 6개뿐이라 사전으로 옮겼습니다
// (엔진 근거 문장은 데이터가 400건이 넘어 같은 방식을 쓸 수 없습니다 — HANDOFF 참고).
// 조합을 추가하면 lib/i18n.js에 combo_<id>_name / _purpose / _desc 세 키를 함께 넣으세요.
// scripts/testI18n.mjs가 빠진 키를 잡아줍니다.

export const COMBOS = [
  {
    id: 'campaign-core',
    nameKey: 'combo_campaign_core_name',
    purposeKey: 'combo_campaign_core_purpose',
    descKey: 'combo_campaign_core_desc',
    members: ['crown', 'rita', 'red-hood', 'modernia', 'naga'],
  },
  {
    id: 'nublanc-boss',
    nameKey: 'combo_nublanc_boss_name',
    purposeKey: 'combo_nublanc_boss_purpose',
    descKey: 'combo_nublanc_boss_desc',
    members: ['alice', 'blanc', 'noir', 'rita', 'crown'],
  },
  {
    id: 'naga-tia-boss',
    nameKey: 'combo_naga_tia_boss_name',
    purposeKey: 'combo_naga_tia_boss_purpose',
    descKey: 'combo_naga_tia_boss_desc',
    members: ['tia', 'naga', 'alice', 'crown', 'dorothy'],
  },
  {
    id: 'pvp-burst-rush',
    nameKey: 'combo_pvp_burst_rush_name',
    purposeKey: 'combo_pvp_burst_rush_purpose',
    descKey: 'combo_pvp_burst_rush_desc',
    members: ['jackal', 'noa', 'trina', 'biscuit', 'scarlet'],
  },
  {
    id: 'velvet-wind-code',
    nameKey: 'combo_velvet_wind_code_name',
    purposeKey: 'combo_velvet_wind_code_purpose',
    descKey: 'combo_velvet_wind_code_desc',
    members: ['nayuta', 'scarlet-black-shadow', 'liberalio', 'little-mermaid', 'velvet'],
  },
  {
    id: 'label-defense',
    nameKey: 'combo_label_defense_name',
    purposeKey: 'combo_label_defense_purpose',
    descKey: 'combo_label_defense_desc',
    members: ['jackal', 'emilia', 'maiden-ice-rose', 'blanc', 'label'],
  },
];
