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
// 5) "이름 붙은 조합이다"/"어느 사이트에 나온다"는 인용만으로는 왜 강한지 설명이 안 된다는
// 지적에 따라, 가능한 경우 스킬 문구 자체에서 "A가 [데미지 타입] 버프를 주고 B의 공격이 그
// 타입으로 분류된다"는 기계적 근거를 직접 추출해 근거 문장 맨 앞에 배치한다(아래 '스킬 메커니즘
// 기반 데미지 타입 시너지' 섹션 참고). 이 감지는 스킬 원문에 명시된 경우에만 작동하는 보수적인
// 신호라, 매칭이 없다고 시너지가 없다는 뜻은 아니며 그 경우 기존 근거(아키타입/실전 데이터)로
// 보완한다.

import characterDatabase from '../data/characterDatabase.json';
import synergyNotes from '../data/synergyNotes.json';
import dataFreshness from '../data/dataFreshness.json';
import treasureEffects from '../data/treasureEffects.json';
import metaStats from '../data/metaStats.json';
import characterInvestmentNotes from '../data/characterInvestmentNotes.json';

// characterId(=characterDatabase.json id) → 애장품 효과 데이터 조회용 맵.
const TREASURE_EFFECT_BY_ID = new Map(treasureEffects.characters.map((t) => [t.characterId, t]));

// title(=characterDatabase.json title) → 캐릭터 투자 프로필(애장품 필요 여부/저점·고점) 조회용 맵.
// (enjoy-game-life.tistory.com 개별 캐릭터 공략을 조사해 재구성한 참고 자료. data/characterInvestmentNotes.json 참고)
const INVESTMENT_NOTE_BY_NAME = new Map(characterInvestmentNotes.characters.map((c) => [c.name, c]));

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

// 버스트 스킬(항상 skills 배열의 마지막 원소)의 쿨타임이 20초인지.
// (mechanics.burstSkillCooldown: 20초가 40초보다 풀버스트 진입이 잦음)
// 2026-08-04 수정: 이전엔 type이 'Active'인 "첫 번째" 스킬을 찾았는데, 스킬2도 Active 타입이고
// cd가 있는 캐릭터가 많아(예: Falcon: FA의 스킬2 'Falcon Nest'는 cd 15초, 실제 버스트 스킬
// 'Falcon Boost'는 cd 20초) 버스트가 아닌 스킬을 잘못 판정하는 버그가 있었다. 유저가 "3버스트는
// 보통 쿨타임이 40초라 2명 이상 있어야 하는데 AI 조합에 1명만 들어간 경우가 있다"고 제보해
// app/api/ai-recommend/route.js의 동일 버그(burstCooldownSeconds)를 먼저 찾았고, 이 파일의
// 룰 기반 채점에도 같은 패턴의 버그가 있어 함께 수정한다. 마지막 원소를 직접 참조하도록 수정.
function hasFastBurstCooldown(character) {
  const skills = character.skills || [];
  const burstSkill = skills[skills.length - 1];
  return burstSkill?.type === 'Active' && burstSkill?.cd === '20';
}

// ---------------------------------------------------------------------------
// 스킬 메커니즘 기반 데미지 타입 시너지 감지
//
// characterDatabase.json의 skills[].desc는 위키/공략에서 그대로 옮긴 원문(영어) 텍스트라,
// "Projectile Explosion Damage ▲ 54.38%"처럼 특정 데미지 타입을 대상으로 한 버프 문구가
// 그대로 들어있는 경우가 많다. 아래 함수들은 이 원문 문구를 파싱해서
// "A가 [타입] 데미지 버프를 주고, B의 공격이 실제로 그 타입으로 분류된다"는 관계를
// 스킬 문구로 직접 확인 가능한 경우에만 감지한다. (예: 아니스: 스타의 '발사체 폭발 데미지 ▲'
// 버프 + 베스티: 택티컬 업그레이드가 자기 스킬에서 같은 타입을 자기 자신에게 버프하는 문구로
// "이 캐릭터의 공격은 발사체 폭발 데미지로 분류된다"는 정황을 남기는 경우)
//
// 한계: 모든 캐릭터가 자기 공격의 데미지 타입을 스킬 문구에 명시하는 것은 아니라서, 이 감지는
// "문구로 확인되는 경우"에만 작동하는 보수적인 신호다. 매칭이 없다고 시너지가 없다는 뜻은
// 아니며, 그 경우는 기존 근거(아키타입/실전 데이터)로 판단한다. 추측이나 없는 근거를 만들어내지
// 않는 것을 우선한다.
const DAMAGE_TYPES = [
  { key: 'projectile_explosion', re: /projectile explosion damage/i, label: '발사체 폭발 데미지' },
  { key: 'true_damage', re: /true damage/i, label: '고정(트루) 데미지' },
  { key: 'charge_damage', re: /(full charge|charge) damage/i, label: '차지 데미지' },
  { key: 'piercing_damage', re: /piercing damage/i, label: '관통 데미지' },
];

function splitSkillClauses(desc) {
  return (desc || '').split(/(?<=\.)\s+/);
}

// 캐릭터가 스킬로 부여하는 [데미지 타입 버프] 목록. { type, label, scope } 배열.
// scope는 그 버프 직전에 나온 "Affects ..." 문구 원문(예: "all allies",
// "self and all allies with lower final DEF than self")을 그대로 담는다.
function extractDamageTypeGrants(character) {
  const grants = [];
  (character.skills || []).forEach((s) => {
    let scope = null;
    splitSkillClauses(s.desc).forEach((clause) => {
      const affectsMatch = clause.match(/^Affects\s+(.+?)\.$/i);
      if (affectsMatch) {
        scope = affectsMatch[1];
        return;
      }
      DAMAGE_TYPES.forEach((dt) => {
        if (dt.re.test(clause) && /▲/.test(clause)) {
          grants.push({ type: dt.key, label: dt.label, scope });
        }
      });
    });
  });
  return grants;
}

// 캐릭터 자신의 공격이 [데미지 타입]으로 분류된다는 근거가 스킬 문구에 있는지.
// 1) "Deals X% ... as (타입) damage" 형태로 명시된 경우, 또는
// 2) 자기 자신에게 같은 타입 버프를 주는 경우(자기 타입이 아니면 자기 버프가 의미 없으므로
// 실제로 그 타입 공격을 한다는 정황 근거로 취급)
function dealsDamageType(character, typeKey) {
  const dt = DAMAGE_TYPES.find((d) => d.key === typeKey);
  if (!dt) return false;
  const hasExplicitDeal = (character.skills || []).some((s) => {
    const re = new RegExp('deals[^.]*as[^.]*' + dt.re.source, 'i');
    return re.test(s.desc || '');
  });
  if (hasExplicitDeal) return true;
  return extractDamageTypeGrants(character).some(
    (g) => g.type === typeKey && g.scope && /^self$/i.test(g.scope.trim())
  );
}

// grant(scope 포함)가 실제로 이 아군(allyMember)에게 적용되는지 판정.
// "all allies"는 조건 없이 팀 전체. "lower final DEF than self" 조건이 붙은 경우는 정확한 DEF
// 수치 데이터가 없어, 시전자가 defender(방어형) 클래스일 때만 "이 아군 대부분이 해당될 가능성이
// 높다"고 클래스 기준으로 근사한다. 그 외 애매한 조건부 scope는 근거 없는 매칭을 만들지 않기
// 위해 적용하지 않는다.
function grantAppliesToAlly(caster, grant, allyMember) {
  if (allyMember.id === caster.id) return false;
  if (!grant.scope) return false;
  const scope = grant.scope.toLowerCase();
  if (/all allies/.test(scope)) {
    if (/lower final def than self/.test(scope)) {
      return caster.class === 'defender' && allyMember.class !== 'defender';
    }
    return true;
  }
  return false;
}

// 팀 구성원 사이에서 "A가 주는 [타입] 데미지 버프를 B가 (스킬 문구 근거로) 받는다"는 관계를
// 찾아 반환. scoreTeam에서 이 결과를 근거 문장 맨 앞에 배치해 "왜 시너지가 나는지"를 스킬
// 메커니즘으로 직접 설명한다.
function findSkillMechanicSynergies(members) {
  const found = [];
  members.forEach((caster) => {
    const grants = extractDamageTypeGrants(caster).filter((g) => g.scope && /all allies/i.test(g.scope));
    const uniqueTypes = new Set(grants.map((g) => g.type));
    uniqueTypes.forEach((typeKey) => {
      const grant = grants.find((g) => g.type === typeKey);
      const receivers = members.filter(
        (m) => grantAppliesToAlly(caster, grant, m) && dealsDamageType(m, typeKey)
      );
      if (receivers.length > 0) {
        found.push({ caster: caster.title, type: typeKey, label: grant.label, receivers: receivers.map((m) => m.title) });
      }
    });
  });
  return found;
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
  // 스킬 문구에서 직접 확인되는 [데미지 타입 버프 → 그 타입 공격을 하는 캐릭터] 매칭.
  // "이름 붙은 조합"이나 "실전 픽률"과 달리 왜 강한지 자체를 설명하는 근거라, 시너지 페어(6)보다
  // 높고 아키타입 완전 일치(14)보다는 낮게 잡아 "검증된 기계적 근거"로서의 비중을 준다.
  SKILL_MECHANIC_SYNERGY: 10,
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

  // --- 스킬 메커니즘 기반 데미지 타입 시너지 (가장 먼저 배치: "왜 강한지"의 핵심 근거) ---
  findSkillMechanicSynergies(members).forEach((syn) => {
    score += WEIGHTS.SKILL_MECHANIC_SYNERGY;
    reasons.push(
      `[스킬 근거] ${syn.caster}의 스킬에 '${syn.label} ▲' 버프 효과가 있고, ${syn.receivers.join(', ')}의 ` +
      `공격은 스킬 문구상 ${syn.label}로 분류되어 있어 이 버프를 그대로 받습니다.`
    );
  });

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

  // --- 캐릭터 투자 프로필 (애장품 필요 여부) ---
  // 애장품이 사실상 필수인 캐릭터를 애장품 없이 채용한 경우, 실전 성능이 공략 자료 기준과 크게
  // 달라질 수 있다는 점을 알려준다. (근거: data/characterInvestmentNotes.json, enjoy-game-life.tistory.com
  // 개별 캐릭터 공략을 조사해 재구성)
  members.forEach((m) => {
    const note = INVESTMENT_NOTE_BY_NAME.get(m.title);
    if (!note) return;
    if (note.treasureRequired && !treasureIds.has(m.id)) {
      reasons.push(
        `[투자 참고] ${m.title}는(은) 공략 기준 애장품(Treasure) 의존도가 높은 캐릭터입니다. ` +
        `${note.treasureNote}`
      );
    }
  });

  // --- 토템 역할(같은 버스트 단계를 다른 캐릭터가 이미 커버할 때 상시 버프용으로 추가 기용) ---
  // 2026-08-04 추가: 유저가 "나가처럼 버스트가 아니라 팀 회복 버프 때문에 같은 버스트 단계에
  // 추가로 넣는 캐릭터가 있다"고 제보. characterInvestmentNotes.json에 totemRole/totemNote로
  // 정리해둔 캐릭터가, 같은 버스트 단계의 다른 멤버가 이미 빠른 쿨타임(20초)으로 매 사이클을
  // 커버하고 있는 상태로 팀에 포함돼 있으면, 그게 왜 정당한 픽인지 근거 문장으로 설명해준다.
  members.forEach((m) => {
    const note = INVESTMENT_NOTE_BY_NAME.get(m.title);
    if (!note?.totemRole) return;
    const sameBurstFastCovered = members.some(
      (o) => o.id !== m.id && o.burst === m.burst && hasFastBurstCooldown(o)
    );
    if (sameBurstFastCovered) {
      reasons.push(
        `[토템 활용] ${m.title}는(은) 같은 버스트${m.burst} 단계를 다른 캐릭터가 이미 빠른 쿨타임으로 ` +
        `안정적으로 커버하고 있어, 버스트 스킬보다 상시 버프/유틸리티 역할로 기용된 것으로 보입니다. ${note.totemNote}`
      );
    }
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

// ---------------------------------------------------------------------------
// prydwen.gg 커뮤니티 검증 조합 완전일치 매칭 (AI 자유 구성 생략용)
//
// 2026-08-06 추가: 유저가 "AI에게 매번 새로 조합을 짜게 하고 그 과정에서 나온 문제를 하나씩
// 규칙으로 시스템 프롬프트에 추가하다 보니, 규칙이 쌓일수록 AI의 사고가 점점 경직된다"고
// 지적함. synergyNotes.archetypes에는 이미 prydwen.gg 개별 캐릭터 페이지 + Team Database에서
// 수집한 검증된 5인 조합이 500개 이상 들어있으므로, 로스터가 그 중 하나와 완전히 일치하면
// (5명 전원 보유 + 모드 호환 + 버스트 I/II/III 조건 충족) AI에게 새로 구성을 맡기지 않고 그
// 조합을 그대로 반환한다. AI는 이 목록에 없는 경우이거나, ambiguousBurst로 표시된 애매한
// 조합(예: 레드후드처럼 prydwen에서 버스트 역할별로 성능이 갈리는데 우리 DB는 버스트를
// 하나로 고정해둔 캐릭터가 포함된 경우)에서만 "조합 구성"에 호출된다.
//
// 2026-08-06 수정(2차): 유저가 "완전일치 조합의 설명이 영어 원문 그대로 나오고, '~사이트에서
// 검증된 xxx 조합'처럼 불필요한 출처/조합명 인용이 붙는다"고 지적. archetype.note는 prydwen.gg
// 원문을 그대로 스크랩한 영어 텍스트라 사용자에게 그대로 보여주기엔 부적합했음 -> 이 함수는
// 더 이상 aiReasoning 문자열을 직접 만들지 않고, 대신 archetypeName/archetypeNote를 그대로
// 반환해 호출부(app/api/ai-recommend/route.js)가 이 원문을 "참고 자료"로만 삼아 AI에게 가볍게
// 번역/재구성("이미 정해진 조합을 설명만 하라")을 시키도록 위임한다. 조합 구성 자체는 여전히
// AI 없이 확정되므로("어떤 5명을 쓸지"를 AI가 자유롭게 바꾸지 않음) 경직 문제의 원인이었던
// "자유 구성" 단계는 그대로 생략된 채, 설명 문장의 품질/언어만 개선하는 구조다.
// ---------------------------------------------------------------------------
function computeFormationLocal(members) {
  const counts = { 1: 0, 2: 0, 3: 0 };
  members.forEach((m) => {
    counts[m.burst] = (counts[m.burst] || 0) + 1;
  });
  return `${counts[1]}-${counts[2]}-${counts[3]}`;
}

export function findExactTeamMatch(ownedCharacters, mode = 'campaign', opts = {}) {
  const treasureIds = opts.treasureIds || new Set();
  const bossElement = opts.bossElement || null;
  const excludeTitles = new Set(opts.excludeTitles || []);
  const compatModes = MODE_COMPAT[mode] || [mode];
  const byTitle = new Map(ownedCharacters.map((c) => [c.title, c]));
  const ownedTitleSet = new Set(ownedCharacters.map((c) => c.title));

  const candidates = synergyNotes.archetypes.filter((a) => {
    const members = a.members || [];
    if (members.length !== 5) return false;
    if (new Set(members).size !== 5) return false;
    if (a.ambiguousBurst) return false;
    if (!compatModes.includes(a.mode)) return false;
    if (!members.every((m) => ownedTitleSet.has(m))) return false;
    if (members.some((m) => excludeTitles.has(m))) return false;
    return true;
  });

  let best = null;
  candidates.forEach((a) => {
    const members = a.members.map((m) => byTitle.get(m));
    const scored = scoreTeam(members, mode, { treasureIds, bossElement });
    if (!scored.valid) return;
    // 2026-08-06 수정(3차): 유저가 "726점씩이나 나오는 게 이상하다"고 지적, 원인을 찾아보니
    // archetypes가 590개(prydwen 개별 캐릭터 447명 Team 탭 전수조사 이후)로 늘면서 scoreTeam의
    // 아키타입 매칭이 "겹치는 아키타입 전부"를 중복 합산해 팀 하나에 600점 넘게 쌓이는 버그였음
    // (위 WEIGHTS.ARCHETYPE_FULL_MATCH 주석 참고). 이어서 유저가 "5인 완전일치 후보가 여러 개면
    // 뭘 기준으로 고르냐"고 질문했는데, 지금까지는 바로 이 버그투성이 scoreTeam().totalScore로
    // 후보를 비교하고 있었다 — 즉 실제로 좋은 조합이 아니라 "다른 아키타입들과 우연히 많이
    // 겹치는 조합"이 이겼을 수 있다는 뜻. 유저 제안대로 캐릭터 개별 티어(스토리/보스전/PvP 티어,
    // SSS~F를 tierScore()로 점수화) 합으로 후보를 비교하도록 변경한다 — 아키타입 개수와 무관하게
    // 항상 안정적이고, 캐릭터 5명의 실제 성능을 그대로 반영한다. scoreTeam은 reasons(참고용
    // 설명 문장)를 만드는 데는 계속 쓰지만, 후보 비교와 최종 표시 점수(totalScore)에는 이
    // 티어 합을 쓴다.
    const tierSum = members.reduce((sum, m) => sum + tierScore(m, mode), 0);
    if (!best || tierSum > best.tierSum) {
      best = { archetype: a, members, scored, tierSum };
    }
  });

  if (!best) return null;
  return {
    formation: computeFormationLocal(best.members),
    members: best.members.map((m) => ({ id: m.id, title: m.title, name_kr: m.name_kr, burst: m.burst, img: m.img || null })),
    // scoreTeam().totalScore(아키타입 중복 합산 버그로 700점대까지 부풀 수 있음) 대신 위에서
    // 후보 비교에 쓴 티어 합을 그대로 표시 점수로 쓴다 — 캐릭터 5명의 실제 성능을 그대로
    // 반영하는 값이라 이해하기 쉽고, 아키타입 개수가 늘어나도 값이 흔들리지 않는다.
    totalScore: best.tierSum,
    reasons: best.scored.reasons,
    // 원문(영어) 그대로 사용하지 말 것 — 호출부에서 이 두 필드를 참고 자료로만 삼아
    // AI에게 한국어(또는 선택 언어)로 재구성하도록 넘긴다.
    archetypeName: best.archetype.name,
    archetypeNote: best.archetype.note,
  };
}

// 사용 예:
// const owned = resolveOwnedCharacters(['rapi-red-hood', 'mast-romantic-maid', ...]);
// const { teams, dataFreshness } = recommendTeams(owned, 'bossing', { bossElement: 'Iron' });
