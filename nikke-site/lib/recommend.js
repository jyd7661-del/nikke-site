import { CHARACTERS, TIER_ORDER } from '@/data/characters';
import { COMBOS } from '@/data/combos';

const charMap = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

function tierScore(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return idx === -1 ? TIER_ORDER.length : idx;
}

// 보유 캐릭터(ownedIds: Set)를 기반으로
// 1) 완전히 채울 수 있는 알려진 메타 조합
// 2) 1~2명만 부족한 아쉬운 조합 (영입 추천용)
// 3) 보유 캐릭터만으로 구성하는 자동 추천 팀
// 을 계산해서 반환합니다.
export function recommend(ownedIds) {
  const owned = new Set(ownedIds);

  const fullMatches = [];
  const partialMatches = [];

  for (const combo of COMBOS) {
    const missing = combo.members.filter((id) => !owned.has(id));
    if (missing.length === 0) {
      fullMatches.push(combo);
    } else if (missing.length <= 2) {
      partialMatches.push({ combo, missing: missing.map((id) => charMap[id]).filter(Boolean) });
    }
  }

  // 자동 추천 팀: 보유 캐릭터 중 버스트 단계별로 티어가 좋은 순으로 채워 5인 팀 구성
  const ownedChars = CHARACTERS.filter((c) => owned.has(c.id));
  const byBurst = { 1: [], 2: [], 3: [] };
  for (const c of ownedChars) {
    byBurst[c.burst].push(c);
  }
  for (const b of [1, 2, 3]) {
    byBurst[b].sort((a, b2) => tierScore(a.tier) - tierScore(b2.tier));
  }

  // 기본 슬롯 배분: 버스트1 1~2명, 버스트2 1~2명, 버스트3 2~3명 (총 5명)
  const autoTeam = [];
  const quota = { 1: 1, 2: 2, 3: 2 };
  for (const b of [1, 2, 3]) {
    autoTeam.push(...byBurst[b].slice(0, quota[b]));
  }
  // 5명이 안 채워졌으면 남는 인원으로 보충
  if (autoTeam.length < 5) {
    const used = new Set(autoTeam.map((c) => c.id));
    const rest = ownedChars
      .filter((c) => !used.has(c.id))
      .sort((a, b2) => tierScore(a.tier) - tierScore(b2.tier));
    for (const c of rest) {
      if (autoTeam.length >= 5) break;
      autoTeam.push(c);
    }
  }

  return {
    fullMatches,
    partialMatches: partialMatches.sort((a, b2) => a.missing.length - b2.missing.length),
    autoTeam: autoTeam.slice(0, 5),
    ownedCount: ownedChars.length,
  };
}

export { charMap };
