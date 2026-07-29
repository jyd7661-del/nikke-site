// 규칙 기반 조합 추천/채점 엔진
//
// 이 파일은 "AI가 임의로 정한 가중치"가 아니라, characterDatabase.json(위키+prydwen 티어)과
// synergyNotes.json(prydwen 공략글을 사람이 재구성한 근거자료)에 이미 적혀 있는 정보를
// 명시적인 규칙으로 그대로 옮긴 것입니다. 가중치 상수(WEIGHTS)는 "이 자료가 있으면 왜 이만큼
// 더 좋다고 볼 수 있는지"가 각 규칙 옆 주석에 설명되어 있고, 나중에 유저 데이터(투표/채택률)가
// 쌓이면 이 가중치들을 실측치로 교체하는 것이 다음 단계입니다(README '향후 계획' 참고).
//
// 핵심 설계 원칙 (사용자 요구사항 반영):
// 1) 사람이 만든 근거자료(synergyNotes)는 정확하지만 갱신이 느리다는 한계가 있으므로,
//    모든 추천 결과에는 근거자료의 기준일(asOf)과 "오래된 자료일 수 있다"는 신뢰도 표시를 함께 낸다.
// 2) 보유 캐릭터(임의의 부분집합)만으로 실시간으로 최적 5인 조합을 찾아야 하므로,
//    전수조사(nC5)가 아니라 버스트 타입별로 나눠 탐색 공간을 줄이는 방식을 쓴다.
// 3) 추천 근거는 항상 "왜 이 조합인지"를 사람이 읽을 수 있는 문장으로 함께 반환한다(설명 가능성).

import characterDatabase from '../data/characterDatabase.json';
import synergyNotes from '../data/synergyNotes.json';
import dataFreshness from '../data/dataFreshness.json';
import treasureEffects from '../data/treasureEffects.json';

// characterId(=characterDatabase.json id) → 애장품 효과 데이터 조회용 맵.
const TREASURE_EFFECT_BY_ID = new Map(treasureEffects.characters.map((t) => [t.characterId, t]));

// ---------------------------------------------------------------------------
// 기초 유틸
// ---------------------------------------------------------------------------

// prydwen류 티어 표기를 점수로 변환. SSS가 최고, F가 최저.
// (characterDatabase.json 실제 값으로 검증됨: Vesti: Tactical Upgrade의 story/pvp가 SSS)
const TIER_SCORE = {
  SSS: 9, SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1,
};

// 사이트 내부에서 쓰는 용도(mode) 이름을 characterDatabase.json의 tiers 키로 매핑.
// story = 캠페인, bossing = 보스전(인터셉트/레이드 포함 근사치), pvp = 아레나/유니온레이드 근사치
const MODE_TO_TIER_KEY = {
  campaign: 'story',
  story: 'story',
  bossing: 'bossing',
  raid: 'bossing',
  tribe_tower: 'story',
  pvp: 'pvp',
};

// synergyNotes.archetypes의 mode 값 중 어떤 것이 이 추천 mode와 관련 있는지.
const MODE_COMPAT = {
  campaign: ['campaign', 'tribe_tower'],
  story: ['campaign', 'tribe_tower'],
  tribe_tower: ['tribe_tower', 'campaign'],
  bossing: ['bossing', 'raid'],
  raid: ['raid', 'bossing'],
  pvp: ['pvp'],
};

function tierScore(character, mode) {
  const key = MODE_TO_TIER_KEY[mode] || 'story';
  const grade = character?.tiers?.[key];
  return TIER_SCORE[grade] || 0;
}

// 스킬 설명에 쿨타임 감소(CDR) 관련 문구가 있는지로 CDR 제공 캐릭터인지 판정.
// (mechanics.cdr: "팀에 CDR 제공 캐릭터가 최소 1명 있는지가 고티어 조합의 필수 조건")
function providesCDR(character) {
  return (character.skills || []).some((s) => /cooldown/i.test(s.desc || ''));
}

// 버스트 스킬(보통 3번째 스킬, type: Active, cd 존재)의 쿨타임이 20초인지.
// (mechanics.burstSkillCooldown: 20초가 40초보다 풀버스트 진입이 잦음)
function hasFastBurstCooldown(character) {
  const burstSkill = (character.skills || []).find((s) => s.type === 'Active' && s.cd);
  return burstSkill?.cd === '20';
}

function normalizeElement(el) {
  return (el || '').toLowerCase();
}

function isStale(asOfStr, staleAfterDays) {
  const asOf = new Date(asOfStr);
  const now = new Date();
  const diffDays = (now - asOf) / (1000 * 60 * 60 * 24);
  return diffDays > (staleAfterDays || 60);
}

// ---------------------------------------------------------------------------
// 데이터 신선도 메타 정보 (추천 결과에 항상 동봉)
// ---------------------------------------------------------------------------

export function getDataFreshnessMeta() {
  const cdb = dataFreshness.characterDatabase;
  const syn = dataFreshness.synergyNotes;
  return {
    characterDatabase: { ...cdb, stale: isStale(cdb.asOf, cdb.staleAfterDays) },
    synergyNotes: { ...syn, stale: isStale(syn.asOf, syn.staleAfterDays) },
    note: dataFreshness.note,
  };
}

// ---------------------------------------------------------------------------
// 조합 채점 (임의의 5인 조합을 넣으면 점수 + 근거 문장을 돌려줌)
// 유저가 직접 등록한 조합(/combos 페이지)에도 그대로 재사용 가능.
// ---------------------------------------------------------------------------

const WEIGHTS = {
  // 개별 캐릭터 성능(티어)의 합 — 가장 기본이 되는 축. 캐릭터 5명 티어 합이라
  // 최대 45점(SSS 5명) 수준. 아래 시너지 보너스들이 이 값과 비슷한 스케일이 되도록 맞춤.
  TIER_SUM: 1,
  // synergyNotes.archetypes에 등록된 "이름 붙은 조합"을 통째로 포함하면 강한 가산점.
  // 커뮤니티에서 반복적으로 검증된 조합이므로 개별 티어 합보다 신뢰도가 높다고 봄.
  ARCHETYPE_FULL_MATCH: 14,
  // 아키타입의 일부만 포함한 경우(예: 2명 중 1명만) — "이 캐릭터를 더 넣으면 좋아진다"는
  // 힌트를 주기 위한 절반 수준의 보너스.
  ARCHETYPE_PARTIAL_MATCH: 5,
  // synergyNotes.synergyPairs에 등록된 페어를 포함하면 가산점.
  SYNERGY_PAIR: 6,
  // 팀에 CDR 제공 캐릭터가 하나도 없으면 고티어 조합이 되기 어렵다는 공략 지적 반영.
  CDR_PRESENT: 5,
  CDR_MISSING_PENALTY: -4,
  // 버스트I/II 중 쿨타임 20초(빠른 버스트) 캐릭터 1명당 소폭 가산 — 풀버스트 안정성.
  FAST_BURST_CD: 2,
  // 원소 다양성: 상성 보너스는 10%로 작다고 명시돼 있으므로 가중치도 작게.
  ELEMENT_DIVERSITY: 1,
};

export function scoreTeam(members, mode = 'campaign', opts = {}) {
  if (!members || members.length === 0) {
    return { totalScore: 0, valid: false, reasons: ['조합원이 없습니다.'] };
  }
  const treasureIds = opts.treasureIds || new Set();

  const titles = members.map((m) => m.title);
  const reasons = [];
  let score = 0;

  // --- 하드 제약: 버스트 I/II/III 각 1명 이상 (mechanics.burstPhase) ---
  const burstCounts = { 1: 0, 2: 0, 3: 0 };
  members.forEach((m) => {
    if (burstCounts[m.burst] !== undefined) burstCounts[m.burst] += 1;
  });
  const missingBursts = ['1', '2', '3'].filter((b) => burstCounts[b] === 0);
  const validBurstChain = missingBursts.length === 0;
  if (!validBurstChain) {
    reasons.push(
      `버스트 ${missingBursts.join(', ')} 단계 캐릭터가 없어 풀버스트(전체 버스트)에 도달할 수 없습니다. ` +
      `이 조합은 자동전투 효율이 크게 떨어집니다.`
    );
  }

  // --- 티어 합산 ---
  const tierTotal = members.reduce((sum, m) => sum + tierScore(m, mode), 0);
  score += tierTotal * WEIGHTS.TIER_SUM;

  // --- 아키타입 매칭 ---
  const compatModes = MODE_COMPAT[mode] || [mode];
  synergyNotes.archetypes
    .filter((a) => compatModes.includes(a.mode))
    .forEach((a) => {
      const need = a.members || [];
      if (need.length === 0) return;
      const have = need.filter((n) => titles.includes(n));
      if (have.length === need.length) {
        score += WEIGHTS.ARCHETYPE_FULL_MATCH;
        reasons.push(`'${a.name}' 조합으로 알려진 구성입니다. ${a.note}`);
      } else if (have.length > 0) {
        score += WEIGHTS.ARCHETYPE_PARTIAL_MATCH * have.length;
        const missing = need.filter((n) => !titles.includes(n));
        reasons.push(
          `'${a.name}' 조합의 일부(${have.join(', ')})가 포함되어 있습니다. ` +
          `${missing.join(', ')}를(을) 보유하면 이 조합의 완성도가 더 올라갑니다.`
        );
      }
    });

  // --- 시너지 페어 ---
  synergyNotes.synergyPairs.forEach((p) => {
    const have = p.members.filter((n) => titles.includes(n));
    if (have.length === p.members.length) {
      score += WEIGHTS.SYNERGY_PAIR;
      reasons.push(`${p.members.join(' + ')} 페어 시너지: ${p.reason}`);
    }
  });

  // --- CDR 보유 여부 ---
  const cdrMembers = members.filter(providesCDR);
  if (cdrMembers.length > 0) {
    score += WEIGHTS.CDR_PRESENT;
    reasons.push(`${cdrMembers.map((m) => m.title).join(', ')}가 쿨타임 감소를 제공해 풀버스트 순환이 빨라집니다.`);
  } else {
    score += WEIGHTS.CDR_MISSING_PENALTY;
    reasons.push('쿨타임 감소(CDR) 제공 캐릭터가 없어 풀버스트 진입 빈도가 낮을 수 있습니다.');
  }

  // --- 버스트 쿨타임 20초 캐릭터 ---
  const fastBurstMembers = members.filter((m) => (m.burst === '1' || m.burst === '2') && hasFastBurstCooldown(m));
  score += fastBurstMembers.length * WEIGHTS.FAST_BURST_CD;

  // --- 원소 다양성 ---
  const distinctElements = new Set(members.map((m) => normalizeElement(m.element)).filter(Boolean));
  score += (distinctElements.size - 1) * WEIGHTS.ELEMENT_DIVERSITY;

  // --- 카운터 정보 (PvP일 때만 참고 정보로 추가) ---
  if (mode === 'pvp') {
    synergyNotes.counters.forEach((c) => {
      if (titles.includes(c.unit)) {
        reasons.push(`${c.unit} 보유: ${c.reason} (상대 조합에 따라 카운터로 활용 가능)`);
      }
    });
  }

  // --- 애장품(Treasure) 효과 ---
  // 애장품 장착 시 스킬 자체가 바뀌거나 강화돼 다른 캐릭터와의 궁합이 달라지는 경우를
  // data/treasureEffects.json에서 조회해 반영한다. (사용자 요구사항: "애장품마다 사람들의 평가가
  // 다르기도 하고 다른 니케와의 스킬조합 궁합도 갑작스럽게 바뀌기 때문에" 캐릭터별로 다르게 반영)
  members.forEach((m) => {
    if (!treasureIds.has(m.id)) return;
    const effect = TREASURE_EFFECT_BY_ID.get(m.id);
    if (!effect) return;
    score += effect.scoreBonus || 0;
    reasons.push(`${m.title} 애장품 효과: ${effect.treasureEffect}`);
    (effect.synergyWith || []).forEach((sw) => {
      if (titles.includes(sw.target)) {
        score += sw.bonus || 0;
        reasons.push(`${m.title}(애장품) + ${sw.target} 궁합: ${sw.reason}`);
      }
    });
  });

  return {
    totalScore: Math.round(score * 10) / 10,
    valid: validBurstChain,
    tierTotal,
    reasons,
    dataFreshness: getDataFreshnessMeta(),
  };
}

// ---------------------------------------------------------------------------
// 보유 로스터에서 실시간 최적 조합 탐색
// ---------------------------------------------------------------------------

function combinations(arr, k) {
  const results = [];
  const combo = [];
  function backtrack(start) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i += 1) {
      combo.push(arr[i]);
      backtrack(i + 1);
      combo.pop();
    }
  }
  backtrack(0);
  return results;
}

// 버킷당 후보를 이 개수로 제한해 탐색량을 억제 (티어 점수 상위 N명만 조합 후보로 고려).
// 예: 8개면 1-1-3 포메이션 기준 최대 약 1.2만 개 조합 → 실시간 응답 가능한 수준.
const BUCKET_CAP = 8;

const FORMATIONS = {
  '2-1-2': { 1: 2, 2: 1, 3: 2 },
  '1-1-3': { 1: 1, 2: 1, 3: 3 },
};

// ownedCharacters: characterDatabase.json 항목 배열(보유한 캐릭터만)
export function recommendTeams(ownedCharacters, mode = 'campaign', opts = {}) {
  const topN = opts.topN || 5;
  const treasureIds = opts.treasureIds || new Set();
  const formations = opts.formation ? [opts.formation] : Object.keys(FORMATIONS);

  const buckets = { 1: [], 2: [], 3: [] };
  ownedCharacters.forEach((c) => {
    if (buckets[c.burst]) buckets[c.burst].push(c);
  });

  const missing = ['1', '2', '3'].filter((b) => buckets[b].length === 0);
  if (missing.length > 0) {
    return {
      teams: [],
      error: `버스트 ${missing.join(', ')} 캐릭터를 보유하고 있지 않아 완전한 풀버스트 조합을 만들 수 없습니다. ` +
        `해당 버스트 단계의 캐릭터를 육성하는 것을 추천합니다.`,
      dataFreshness: getDataFreshnessMeta(),
    };
  }

  // 버킷별로 이 mode 기준 티어 점수 상위 BUCKET_CAP명만 후보로 사용 (탐색량 억제).
  Object.keys(buckets).forEach((b) => {
    buckets[b] = buckets[b]
      .slice()
      .sort((a, z) => tierScore(z, mode) - tierScore(a, mode))
      .slice(0, BUCKET_CAP);
  });

  const candidateTeams = [];
  formations.forEach((formationName) => {
    const counts = FORMATIONS[formationName];
    if (buckets[1].length < counts[1] || buckets[2].length < counts[2] || buckets[3].length < counts[3]) {
      return; // 이 포메이션을 만들 만큼 인원이 부족하면 스킵
    }
    const combos1 = combinations(buckets[1], counts[1]);
    const combos2 = combinations(buckets[2], counts[2]);
    const combos3 = combinations(buckets[3], counts[3]);

    combos1.forEach((c1) => {
      combos2.forEach((c2) => {
        combos3.forEach((c3) => {
          const members = [...c1, ...c2, ...c3];
          const result = scoreTeam(members, mode, { treasureIds });
          candidateTeams.push({
            formation: formationName,
            members: members.map((m) => ({ id: m.id, title: m.title, name_kr: m.name_kr, burst: m.burst, img: m.img || null })),
            ...result,
          });
        });
      });
    });
  });

  candidateTeams.sort((a, z) => z.totalScore - a.totalScore);

  return {
    teams: candidateTeams.slice(0, topN),
    searched: candidateTeams.length,
    dataFreshness: getDataFreshnessMeta(),
  };
}

// id 배열(보유 캐릭터 id 목록)을 받아 characterDatabase.json에서 실제 객체로 변환하는 헬퍼.
export function resolveOwnedCharacters(ownedIds) {
  const idSet = new Set(ownedIds);
  return characterDatabase.filter((c) => idSet.has(c.id));
}

// 사용 예:
//   const owned = resolveOwnedCharacters(['rapi-red-hood', 'mast-romantic-maid', ...]);
//   const { teams, dataFreshness } = recommendTeams(owned, 'bossing');
