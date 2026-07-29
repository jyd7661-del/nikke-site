// 규칙 기반 조합 추천/채점 엔진
//
// 이 파일은 "AI가 임의로 정한 가중치"가 아니라, characterDatabase.json(위키+prydwen 티어)과
// synergyNotes.json(prydwen 공략글을 사람이 재구성한 근거자료), 그리고 metaStats.json(enikk.app의
// 실제 플레이어 픽률·챔피언 아레나 승률 기록)에 이미 적혀 있는 정보를 명시적인 규칙으로 그대로
// 옮긴 것입니다. 가중치 상수(WEIGHTS)는 "이 자료가 있으면 왜 이만큼 더 좋다고 볼 수 있는지"가 각
// 규칙 옆 주석에 설명되어 있고, 나중에 유저 데이터(투표/채택률)가 쌓이면 이 가중치들을 실측치로
// 교체하는 것이 다음 단계입니다(README '향후 계획' 참고).
//
// 핵심 설계 원칙 (사용자 요구사항 반영):
// 1) 사람이 만든 근거자료(synergyNotes)는 정확하지만 갱신이 느리다는 한계가 있으므로,
// 모든 추천 결과에는 근거자료의 기준일(asOf)과 "오래된 자료일 수 있다"는 신뢰도 표시를 함께 낸다.
// 2) 보유 캐릭터(임의의 부분집합)만으로 실시간으로 최적 5인 조합을 찾아야 하므로,
// 전수조사(nC5)가 아니라 버스트 타입별로 나눠 탐색 공간을 줄이는 방식을 쓴다.
// 3) 추천 근거는 항상 "왜 이 조합인지"를 사람이 읽을 수 있는 문장으로 함께 반환한다(설명 가능성).
// 4) enikk.app의 실제 기록(픽률/승률/표본수)은 커뮤니티 공략보다 최신이고 "실제로 강한 조합"을
// 직접 보여주므로, 스킬 기반 추론에 검증 신호로 추가한다. 단, 시즌마다 메타가 바뀌므로
// dataFreshness와 마찬가지로 기준일을 명시하고 오래되면 경고한다.

import characterDatabase from '../data/characterDatabase.json';
import synergyNotes from '../data/synergyNotes.json';
import dataFreshness from '../data/dataFreshness.json';
import treasureEffects from '../data/treasureEffects.json';
import metaStats from '../data/metaStats.json';

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

// enikk.app 실사용 픽률 데이터의 S~F 등급을 점수로 변환.
// (실제 승률이 아니라 픽률 기반 등급이라 characterDatabase 티어보다 가중치를 낮게 잡음)
const REAL_TIER_SCORE = { S: 6, A: 4, B: 2, C: 1, D: 0, F: 0 };

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

// mode → metaStats.usageTier의 어떤 슬라이스를 참고할지.
const MODE_TO_META_SLICE = {
  campaign: 'campaign',
  story: 'campaign',
  tribe_tower: 'campaign',
  bossing: 'soloraid',
  raid: 'soloraid',
  pvp: 'arena',
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

// 캠페인 실전 조합(metaStats.campaignCompositions) 매칭을 적용할 mode 목록.
// (엔니케 캠페인 Compositions 탭 데이터는 "스토리 클리어"에 쓰인 5인 로스터라 타워에도
// 참고할 만하지만, 근거 강도가 다르므로 campaign/story에는 정상 가중치, tribe_tower에는
// 적용하지 않는다 — 타워는 원소 방벽 등 별도 요구사항이 강해 그대로 적용하면 오도할 수 있음.)
const CAMPAIGN_COMBO_MODES = new Set(['campaign', 'story']);

// 솔로 레이드 보스 약점 속성 선택지. metaStats.soloRaidByElement의 키와 반드시 일치해야 함.
export const BOSS_ELEMENTS = ['Iron', 'Wind', 'Water', 'Electronic', 'Fire'];

function tierScore(character, mode) {
  const key = MODE_TO_TIER_KEY[mode] || 'story';
  const grade = character?.tiers?.[key];
  return TIER_SCORE[grade] || 0;
}

// enikk.app 실사용 픽률 등급 조회 (없으면 0점 = 실데이터 미확보, 영향 없음).
function realUsageTierScore(character, mode) {
  const slice = MODE_TO_META_SLICE[mode] || 'campaign';
  const entry = metaStats.usageTier?.[slice]?.[character.title];
  if (!entry) return 0;
  return REAL_TIER_SCORE[entry.tier] || 0;
}

// 솔로 레이드 보스의 약점 속성(bossElement)이 주어졌을 때, 그 속성 안에서 이 캐릭터의
// 실사용률(%)을 조회. metaStats.soloRaidByElement는 원소별 대표 시즌 하나의 Advantage
// Nikkes(그 원소 캐릭터 한정 실사용률) 기록이라, 값이 있으면 "그 원소 안에서 얼마나
// 우선순위 높은 픽인지"를 곧바로 알려준다.
function realElementUsage(character, bossElement) {
  if (!bossElement) return null;
  const table = metaStats.soloRaidByElement?.[bossElement];
  if (!table) return null;
  const entry = (table.entries || []).find((e) => e.title === character.title);
  return entry ? entry.usage : null;
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
  const meta = metaStats.meta;
  return {
    characterDatabase: { ...cdb, stale: isStale(cdb.asOf, cdb.staleAfterDays) },
    synergyNotes: { ...syn, stale: isStale(syn.asOf, syn.staleAfterDays) },
    metaStats: { asOf: meta.asOf, source: meta.source, stale: isStale(meta.asOf, meta.staleAfterDays) },
    note: dataFreshness.note,
  };
}

// ---------------------------------------------------------------------------
// enikk.app 실전 기록(PvP 챔피언 아레나 페어/트리오/쿼드/완전 조합, 캠페인 조합) 매칭 유틸
// ---------------------------------------------------------------------------

// (wr - 50) 기준으로 부호/크기가 결정되는 실전 승률 보너스. wr이 50%보다 높으면 가산,
// 낮으면 감산 — "실제로 이겼는지"를 그대로 점수에 반영하는 가장 직접적인 신호이기 때문에
// scale 값을 조합 크기(페어<트리오<쿼드<완전 5인)가 커질수록 키운다(더 구체적인 증거이므로).
function wrBonus(wr, scale) {
  return ((wr - 50) / 10) * scale;
}

function titleSetKey(titles) {
  return titles.slice().sort().join('|');
}

function buildRealComboIndex(list) {
  const map = new Map();
  (list || []).forEach((entry) => {
    map.set(titleSetKey(entry.members), entry);
  });
  return map;
}

const REAL_PAIR_INDEX = buildRealComboIndex(metaStats.pvp?.pairs);
const REAL_TRIO_INDEX = buildRealComboIndex(metaStats.pvp?.trios);
const REAL_QUAD_INDEX = buildRealComboIndex(metaStats.pvp?.quads);
const REAL_TEAM_INDEX = buildRealComboIndex(metaStats.pvp?.topTeams);

// 캠페인 "가장 많이 쓴 5인 조합" 완전 일치 인덱스.
const REAL_CAMPAIGN_TEAM_INDEX = buildRealComboIndex(metaStats.campaignCompositions?.list);

// 캠페인 조합의 4인 부분집합 → "그 4인을 포함하는 조합 중 totalUses가 가장 큰 것" 인덱스.
// 유저가 코어 4인만 보유하고 5번째가 없을 때 "이 캐릭터를 더 넣으면 실전에서 가장 많이 쓰인
// 조합이 완성된다"는 근거를 만들기 위함 (archetypes의 partial match와 같은 목적).
function buildCampaignPartialIndex(list) {
  const map = new Map();
  (list || []).forEach((comp) => {
    const members = comp.members;
    members.forEach((missing, idx) => {
      const subset = members.filter((_, i) => i !== idx);
      const key = titleSetKey(subset);
      const existing = map.get(key);
      if (!existing || comp.totalUses > existing.comp.totalUses) {
        map.set(key, { comp, missing });
      }
    });
  });
  return map;
}
const REAL_CAMPAIGN_PARTIAL_INDEX = buildCampaignPartialIndex(metaStats.campaignCompositions?.list);

function combinationsOfTitles(titles, k) {
  const results = [];
  const combo = [];
  function backtrack(start) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < titles.length; i += 1) {
      combo.push(titles[i]);
      backtrack(i + 1);
      combo.pop();
    }
  }
  backtrack(0);
  return results;
}

// ---------------------------------------------------------------------------
// 조합 채점 (임의의 5인 조합을 넣으면 점수 + 근거 문장을 돌려줌)
// 유저가 직접 등록한 조합(/combos 페이지)에도 그대로 재사용 가능.
// ---------------------------------------------------------------------------

const WEIGHTS = {
  // 개별 캐릭터 성능(티어)의 합 — 가장 기본이 되는 축. 캐릭터 5명 티어 합이라
  // 최대 45점(SSS 5명) 수준. 아래 시너지 보너스들이 이 값과 비슷한 스케일이 되도록 맞춤.
  TIER_SUM: 1,
  // enikk.app 실사용 픽률 등급 합산 — characterDatabase 티어(커뮤니티 공략, 갱신 느림)를
  // 실제 플레이어 채택 데이터로 보정하는 2차 신호. 스케일을 작게 잡아 "참고용 보정"에 그치게 함.
  REAL_USAGE_TIER_SUM: 0.5,
  // 솔로 레이드 보스의 약점 속성(bossElement)이 지정됐을 때, 그 속성 안에서의 실사용률(%) 자체를
  // 가산점으로 사용. 원소 밖 캐릭터에는 영향이 없고(값이 null), 같은 원소 캐릭터끼리의 우선순위를
  // 결정하는 신호라 TIER_SUM/REAL_USAGE_TIER_SUM보다 이 상황(그 보스 상대)에서는 더 구체적인 증거.
  REAL_ELEMENT_USAGE_SCALE: 0.08,
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
  // enikk.app 챔피언 아레나 실전 기록(승률) 기반 보너스. 조합 크기가 클수록(더 구체적인
  // 증거일수록) scale을 키운다. PvP 모드에서만 적용.
  REAL_PVP_PAIR_SCALE: 1,
  REAL_PVP_TRIO_SCALE: 1.5,
  REAL_PVP_QUAD_SCALE: 2,
  REAL_PVP_TEAM_SCALE: 3,
  // enikk.app 캠페인 Compositions 실전 기록(pctOfClears, 전체 클리어 중 이 조합의 비중) 기반
  // 보너스. 승률 개념이 없는 PvE라 "얼마나 많이 실제로 채택됐는지" 자체를 신호로 쓴다.
  // 1위 조합 pctOfClears가 15.43%이므로 FULL_SCALE=0.6이면 최대 약 +9.3점(ARCHETYPE_FULL_MATCH와
  // 비슷한 스케일), 부분 일치(4/5)는 그 절반 비중으로 낮춘다.
  REAL_CAMPAIGN_FULL_SCALE: 0.6,
  REAL_CAMPAIGN_PARTIAL_SCALE: 0.3,
};

export function scoreTeam(members, mode = 'campaign', opts = {}) {
  if (!members || members.length === 0) {
    return { totalScore: 0, valid: false, reasons: ['조합원이 없습니다.'] };
  }
  const treasureIds = opts.treasureIds || new Set();
  // 솔로 레이드/보스전 전용: 이번에 상대할 보스의 약점 속성 (예: 'Iron', 'Wind', 'Water',
  // 'Electronic', 'Fire'). bossing/raid 모드에서만 의미가 있고, 지정하지 않으면 이 보정은 생략된다.
  const bossElement = opts.bossElement || null;

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

  // --- 실사용 픽률 등급 합산 (enikk.app) ---
  const realTierTotal = members.reduce((sum, m) => sum + realUsageTierScore(m, mode), 0);
  score += realTierTotal * WEIGHTS.REAL_USAGE_TIER_SUM;
  const sTierRealMembers = members.filter((m) => realUsageTierScore(m, mode) >= REAL_TIER_SCORE.S);
  if (sTierRealMembers.length > 0) {
    reasons.push(
      `[실사용 데이터] ${sTierRealMembers.map((m) => m.title).join(', ')}는(은) enikk.app 실제 플레이어 ` +
      `기록에서도 이 모드 S등급 픽률을 보이는 검증된 채용 캐릭터입니다.`
    );
  }

  // --- 솔로 레이드 보스 약점 속성별 실사용률 (bossing/raid + bossElement 지정 시) ---
  if ((mode === 'bossing' || mode === 'raid') && bossElement) {
    const elementUsageMembers = members
      .map((m) => ({ m, usage: realElementUsage(m, bossElement) }))
      .filter((x) => x.usage !== null);
    elementUsageMembers.forEach(({ m, usage }) => {
      score += (usage / 100) * WEIGHTS.REAL_ELEMENT_USAGE_SCALE * 10;
    });
    const highUsage = elementUsageMembers.filter((x) => x.usage >= 80);
    if (highUsage.length > 0) {
      const table = metaStats.soloRaidByElement[bossElement];
      reasons.push(
        `[실전 기록] ${highUsage.map((x) => `${x.m.title}(${x.usage}%)`).join(', ')}는(은) ${bossElement} ` +
        `약점 보스(시즌${table.season} '${table.boss}' 기준) 상대 실사용률이 매우 높은 픽입니다. (출처: enikk.app)`
      );
    }
    const lowUsage = elementUsageMembers.filter((x) => x.usage < 10);
    if (lowUsage.length > 0) {
      reasons.push(
        `[실전 기록] ${lowUsage.map((x) => `${x.m.title}(${x.usage}%)`).join(', ')}는(은) ${bossElement} ` +
        `속성이지만 실제로는 이 약점 보스전에 잘 채용되지 않는 편입니다. (출처: enikk.app)`
      );
    }
  }

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

  // --- enikk.app 챔피언 아레나 실전 기록 매칭 (PvP 모드 전용) ---
  // 페어/트리오/쿼드/완전 5인 조합 중 실제로 기록이 쌓인 부분집합이 있으면, 그 승률(wr)을
  // 그대로 점수에 반영하고 표본수(n)·채택률까지 근거 문장에 인용한다. 승률이 50%에 가까우면
  // 정보성이 낮으므로(불확실) 근거 문장은 승률이 뚜렷하게 높거나(≥60%) 낮을 때(≤40%)만 남긴다.
  if (mode === 'pvp' && titles.length >= 2) {
    const seen = new Set();
    const addRealMatch = (index, k, scale, sourceLabel) => {
      combinationsOfTitles(titles, k).forEach((combo) => {
        const key = titleSetKey(combo);
        const entry = index.get(key);
        if (!entry || seen.has(sourceLabel + ':' + key)) return;
        seen.add(sourceLabel + ':' + key);
        score += wrBonus(entry.wr, scale);
        if (entry.wr >= 60 || entry.wr <= 40) {
          reasons.push(
            `[실전 기록] ${combo.join(' + ')} (${sourceLabel}) 조합은 챔피언 아레나 실제 대전에서 ` +
            `승률 ${entry.wr}%(${entry.n}전, 채택률 ${entry.adoption}%)를 기록했습니다. (출처: enikk.app)`
          );
        }
      });
    };
    addRealMatch(REAL_PAIR_INDEX, 2, WEIGHTS.REAL_PVP_PAIR_SCALE, '페어');
    addRealMatch(REAL_TRIO_INDEX, 3, WEIGHTS.REAL_PVP_TRIO_SCALE, '트리오');
    addRealMatch(REAL_QUAD_INDEX, 4, WEIGHTS.REAL_PVP_QUAD_SCALE, '4인 코어');
    if (titles.length === 5) {
      const exact = REAL_TEAM_INDEX.get(titleSetKey(titles));
      if (exact) {
        score += wrBonus(exact.wr, WEIGHTS.REAL_PVP_TEAM_SCALE);
        reasons.push(
          `[실전 기록] 이 5인 조합은 챔피언 아레나에서 실제로 승률 ${exact.wr}%(${exact.n}전, ` +
          `채택률 ${exact.adoption}%)로 기록된 완전 일치 구성입니다. (출처: enikk.app)`
        );
      }
    }
  }

  // --- enikk.app 캠페인 "가장 많이 쓰인 조합(Compositions)" 실전 기록 매칭 (campaign/story 전용) ---
  // 정확히 5인 로스터가 실전 기록과 완전히 일치하면 그 조합의 pctOfClears(전체 클리어 중 비중)를
  // 그대로 가산점으로 쓰고, 4인만 일치하면 "이 캐릭터를 더 넣으면 실전 최다 사용 조합이 완성된다"는
  // 절반 비중의 힌트를 준다.
  if (CAMPAIGN_COMBO_MODES.has(mode) && titles.length >= 4) {
    let exactMatched = false;
    if (titles.length === 5) {
      const exact = REAL_CAMPAIGN_TEAM_INDEX.get(titleSetKey(titles));
      if (exact) {
        exactMatched = true;
        score += (exact.pctOfClears || 0) * WEIGHTS.REAL_CAMPAIGN_FULL_SCALE;
        reasons.push(
          `[실전 기록] 이 5인 조합은 enikk.app 캠페인 클리어 기록에서 실제로 ${exact.totalUses.toLocaleString()}회 ` +
          `사용되어 분석된 전체 클리어의 ${exact.pctOfClears}%를 차지하는, 플레이어들이 가장 많이 쓰는 캠페인 조합 ` +
          `중 하나입니다. (출처: enikk.app)`
        );
      }
    }
    if (!exactMatched) {
      const seenComp = new Set();
      combinationsOfTitles(titles, 4).forEach((combo) => {
        const hit = REAL_CAMPAIGN_PARTIAL_INDEX.get(titleSetKey(combo));
        if (!hit) return;
        const compKey = titleSetKey(hit.comp.members);
        if (seenComp.has(compKey)) return;
        seenComp.add(compKey);
        score += (hit.comp.pctOfClears || 0) * WEIGHTS.REAL_CAMPAIGN_PARTIAL_SCALE;
        reasons.push(
          `[실전 기록] ${combo.join(', ')}는(은) enikk.app에서 ${hit.missing}와(과) 함께 쓰였을 때 ` +
          `가장 많이 기록된 캠페인 조합(${hit.comp.totalUses.toLocaleString()}회, 전체의 ${hit.comp.pctOfClears}%)의 ` +
          `핵심 4인입니다. ${hit.missing}를(을) 보유하면 이 실전 검증 조합을 완성할 수 있습니다. (출처: enikk.app)`
        );
      });
    }
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
  const bossElement = opts.bossElement || null;
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
  // 단, 보스 약점 속성이 지정된 경우에는 정렬 기준에 그 속성 실사용률도 함께 반영해
  // "이번 보스에 잘 맞는 캐릭터"가 후보에서 밀려나지 않게 한다.
  Object.keys(buckets).forEach((b) => {
    buckets[b] = buckets[b]
      .slice()
      .sort((a, z) => {
        const za = tierScore(z, mode) + ((bossElement && realElementUsage(z, bossElement)) || 0) / 20;
        const aa = tierScore(a, mode) + ((bossElement && realElementUsage(a, bossElement)) || 0) / 20;
        return za - aa;
      })
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
          const result = scoreTeam(members, mode, { treasureIds, bossElement });
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
// const owned = resolveOwnedCharacters(['rapi-red-hood', 'mast-romantic-maid', ...]);
// const { teams, dataFreshness } = recommendTeams(owned, 'bossing', { bossElement: 'Iron' });
