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

// 2026-08-07 수정: 애장품(Treasure)을 조합 선정에 반영한다.
//
// 배경: treasureEffects.json에는 scoreBonus라는 가산점 필드가 있었지만 (1) 그 숫자들은
// 근거가 약한 임의 가중치였고 (2) recommendTeams/findExactTeamMatch가 최종 점수를
// tierTotal로 덮어쓰기 때문에 애초에 순위에 아무 영향도 주지 못하고 있었다.
//
// 유저 방침("조합에 있는 니케 점수만 따져라")을 지키려면 조합에 보너스를 더하는 게 아니라
// 그 캐릭터 자신의 점수를 조정해야 한다. 처음엔 "애장품 없으면 한 등급 강등"이라는 추정치를
// 썼는데, characterInvestmentNotes.json에 이미 treasureTiers(애장품 보유 시 실제 티어)가
// 15명분 들어있는 것을 확인하고 실제 데이터로 교체했다. treasureTiersNote 원문:
//   "애장품 보유 시 실제 평가(...). 애장품 미보유 시에는 characterDatabase.json의 기본 티어를 따름."
// 즉 characterDatabase.tiers = 애장품 없는 상태, treasureTiers = 애장품 있는 상태다.
// 실제 격차는 한 등급을 훨씬 넘는다(예: 헬름 PvP C -> SSS, 프리바티 전 모드 B -> SS).
//
// treasureTiers가 없는 캐릭터(아직 조사 안 됨)나 특정 모드 값이 비어 있는 경우에는
// 그냥 기본 티어를 쓴다 — 없는 데이터를 추정으로 메우지 않는다.
function tierScore(character, mode, treasureIds) {
  const key = MODE_TO_TIER_KEY[mode] || 'story';
  const note = INVESTMENT_NOTE_BY_NAME.get(character?.title);
  const useTreasureTier =
    treasureIds && note?.treasureTiers && treasureIds.has(character?.id);
  const grade = (useTreasureTier ? note.treasureTiers[key] : null) || character?.tiers?.[key];
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

// 스킬 설명에 버스트 쿨타임 감소(CDR) 문구가 있는지로 CDR 제공 캐릭터인지 판정.
// (mechanics.cdr: "팀에 CDR 제공 캐릭터가 최소 1명 있는지가 고티어 조합의 필수 조건")
//
// 2026-08-07 수정: 예전 판정은 스킬 원문에 'cooldown'이라는 단어가 있기만 하면 CDR로 봤는데,
// 니케 스킬 원문에서 이 단어는 세 가지 전혀 다른 의미로 쓰인다:
//   1) "Cooldown of Burst Skill ▼ N sec"  -- 진짜 버스트 쿨감 (우리가 원하는 것)
//   2) "Cooldown of Skill 2 ▼ N%"          -- 자기 일반 스킬 쿨감. 풀버스트 순환과 무관
//   3) "Cooldown of Burst Skill ▲ N sec"  -- 쿨타임 '증가'. 정반대 효과
// 그래서 센티(2번)와 프리카(3번)가 CDR 제공 캐릭터로 잡혔다. 특히 프리카는 버스트 쿨타임을
// 21초 '늘리는' 대가로 강한 효과를 받는 캐릭터인데, 화면에는 "프리카가 쿨타임 감소를 제공해
// 풀버스트 순환이 빨라집니다"라는 정반대 설명이 출력되고 있었다.
// 이제 '버스트 스킬 쿨타임 ▼'만 CDR로 인정한다. (▼/▲ 기호는 게임 원문 표기 그대로다)
function providesCDR(character) {
  return (character.skills || []).some((s) =>
    /cooldown of burst skill\s*▼/i.test(s.desc || '')
  );
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

// 이 캐릭터가 1/2스킬(버스트 스킬 제외)로 "전 아군"에게 공격 관련 스탯 버프를 주는지.
// 버스트 스킬이 아니라 상시/조건부 패시브로 주는 것만 센다 — 버스트는 이미 버스트 단계
// 로직에서 따로 다루고, 여기서 보고 싶은 것은 "이 캐릭터가 팀 전체를 올려주는 버퍼인가"다.
//
// 2026-08-07 추가. 폴백 탐색의 동점 처리에만 쓰인다(순위를 뒤집는 가산점이 아니다).
const ALLY_BUFF_STATS = /^(ATK|Attack Damage|Critical Rate|Critical Damage|Charge Damage|Pierce Damage|Attack Speed|Reload Speed|Reloading Speed|Hit Rate|Max Ammunition Capacity)$/i;

function allyBuffStrength(character) {
  let best = 0;
  (character?.skills || []).slice(0, 2).forEach((s) => {
    let scope = null;
    splitSkillClauses(s.desc).forEach((clause) => {
      const affects = clause.match(/^Affects\s+(.+?)\.$/i);
      if (affects) { scope = affects[1]; return; }
      if (!scope || !/all allies/i.test(scope)) return;
      const m = clause.match(/([A-Za-z][A-Za-z .]{1,30}?)\s*▲\s*([\d.]+)%/);
      if (m && ALLY_BUFF_STATS.test(m[1].trim())) best = Math.max(best, parseFloat(m[2]));
    });
  });
  return best;
}

// "의미 있는 버퍼"로 볼 최소 버프량. 1~3%짜리 미미한 버프까지 버퍼로 세면 변별력이 없어진다.
const MEANINGFUL_ALLY_BUFF = 10;

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
  // 2026-08-07 수정: synergyNotes.archetypes가 500개 이상으로 늘어나면서, 인기 캐릭터가 낀 팀은
  // 수십~수백 개의 아키타입과 동시에 매칭되어 점수가 500~700점대로 폭주하는 버그가 있었다
  // (예: 크라운/헬름/스노우화이트:헤비암즈/프리바티/목단 조합 726.5점, D/킬러와이프/티아/나가/
  // 홍련:흑영/앨리스 조합 524점). 아키타입 매칭은 "커뮤니티에서 검증된 조합과 얼마나 겹치는가"를
  // 보여주는 근거일 뿐 매칭 개수만큼 무한히 쌓일 신호가 아니므로, 점수 기여가 큰 상위 N개만
  // 반영하도록 캡을 둔다.
  ARCHETYPE_MATCH_CAP: 3,
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

// --- 같은 버스트 단계 인원 낭비 판정 ---
// 2026-08-07 추가: 유저가 "3버스트에 3명이 있는데 셋 다 쿨타임이 40초라 2명만으로도 계속
// 버스트가 돌아갈 수 있고, 나머지 1명은 버스트를 아예 못 쓰게 되는데 토템 역할을 할 수 있는
// 캐릭터도 아니다"라고 지적. recommendTeams()가 (유저 요청대로) 순수 개별 티어 합만으로
// 순위를 매기다 보니, 이렇게 "정말로는 못 쓰는" 캐릭터의 티어 점수까지 그대로 합산해 실제로는
// 더 나쁜 조합이 더 높은 점수를 받는 문제가 있었다 — 그 캐릭터는 명목상 티어는 높아도 이
// 조합 안에서 실제로 기여하는 가치가 없으므로(토템 역할이 아니라면), "조합에 있는 니케 점수만
// 따진다"는 원칙을 제대로 지키려면 애초에 그 캐릭터의 점수를 합산하면 안 된다. 쿨타임이
// 빠른(20초 이하) 캐릭터 1명이 이미 그 단계를 매 사이클 커버하고 있으면 나머지는 전부 낭비,
// 아무도 빠르지 않으면 쿨타임이 짧은 순으로 2명까지만 번갈아 커버가 정당화되고 그 이상은
// 낭비로 본다. 낭비로 판정된 캐릭터도 토템 후보(characterInvestmentNotes.json의 totemRole)로
// 등록되어 있으면 버스트 대신 상시 버프/유틸리티로 기여하므로 예외로 둔다. 쿨타임 데이터가
// 없는 멤버가 하나라도 섞여 있으면 판단 근거가 불충분하므로 그 단계는 건너뛴다(과잉 판정 방지).
const FAST_BURST_CD = 20; // 이 이하면 혼자서 매 사이클 버스트를 안정적으로 커버 가능
const ALTERNATE_BURST_CD = 45; // 이 이하 캐릭터 2명이면 번갈아 커버 가능

function burstCooldownSeconds(character) {
  const skills = character.skills || [];
  const skill = skills[skills.length - 1];
  const cd = skill?.cd;
  if (!cd || Number.isNaN(Number(cd))) return null;
  return Number(cd);
}

// 2026-08-07 추가: 토템 역할에 조건이 붙는 경우 처리.
//
// 토템은 "버스트를 못 써도 상시 효과로 팀에 기여한다"는 이유로 낭비 판정에서 빠진다. 그런데
// 그 상시 효과가 특정 속성 아군에게만 들어가는 캐릭터가 있다:
//   아니스: 스파클링 서머 — "Affects all Electric Code allies"
//   일레그: 붐 앤 쇼크    — "Affects all Water Code allies"
// 이런 캐릭터를 조건 없이 면제하면, 전기 아군이 하나도 없는 팀에 아니스: 스파클링 서머를
// 넣어도 만점을 주게 된다. 실제로는 버프가 아무에게도 안 들어가므로 그냥 낭비다.
//
// characterInvestmentNotes.json의 totemCondition으로 조건을 적어두면 여기서 검사한다.
//   { "element": "electric", "minAllies": 1 }  -> 자신 외 전기 아군이 1명 이상일 때만 토템
// 조건이 없으면(대다수) 예전처럼 무조건 인정한다.
function totemConditionMet(note, member, members) {
  const cond = note?.totemCondition;
  if (!cond) return true;
  if (cond.element) {
    const need = cond.minAllies || 1;
    const count = members.filter(
      (m) => m.id !== member.id && normalizeElement(m.element) === normalizeElement(cond.element)
    ).length;
    if (count < need) return false;
  }
  return true;
}

// 반환값:
//   wasted        — 버스트를 못 쓰는데 토템도 아니라서 점수에서 빼야 하는 멤버
//   totemExempted — 버스트 순번에서는 밀렸지만 토템이라 예외로 인정된 멤버
//   burstOrder    — 각 버스트 단계에서 엔진이 가정하는 순번(앞쪽이 실제로 버스트를 쓰는 쪽).
//                   화면 표시 순서를 이 순번과 맞추기 위해 노출한다.
//
// 2026-08-07 추가(totemExempted / burstOrder): 유저 지적 — "3버스트 순서가 스화헤비, 프리바티,
// 일레그인데 이러면 스화헤비랑 프리바티가 번갈아 쓰게 된다. 프리바티가 토템이면 잘못된 배치".
// 엔진은 실제로 티어순(스화헤비 SSS → 일레그 S → 프리바티 B)으로 정렬해 프리바티를 비버스트
// 자리로 빼고 토템 예외 처리하고 있었지만, 화면에는 원본 데이터 배열 순서가 그대로 나가서
// 마치 프리바티가 2순번인 것처럼 보였다. 순번 정보를 밖으로 내보내 표시 순서를 맞춘다.
function findWastedBurstMembers(members, mode, treasureIds) {
  const wasted = [];
  const totemExempted = [];
  const burstOrder = new Map(); // id -> 같은 버스트 단계 내 순번(0부터)
  ['1', '2', '3'].forEach((burst) => {
    const group = members.filter((m) => String(m.burst) === burst);
    if (group.length <= 1) {
      group.forEach((m) => burstOrder.set(m.id, 0));
      return;
    }
    const withCd = group.map((m) => ({ m, cd: burstCooldownSeconds(m) }));
    if (withCd.some((x) => x.cd === null)) {
      group.forEach((m, i) => burstOrder.set(m.id, i));
      return;
    }
    // 2026-08-07 수정: 쿨타임이 같을 때 배열 순서대로 낭비 대상을 골라서, 똑같은 5명인데
    // 로스터 정렬만 다르면 점수가 달라지는 버그가 있었다(예: 크라운/맥스웰: 오디너리 미케닉
    // 둘 다 버스트2·쿨 20초일 때 29점 vs 30점). 쿨타임이 같으면 티어가 높은 쪽을 남기고
    // 낮은 쪽을 낭비로 판정해, 순서와 무관하게 항상 같은 결과가 나오도록 한다.
    const sorted = [...withCd].sort(
      (a, b) => (a.cd - b.cd) || (tierScore(b.m, mode, treasureIds) - tierScore(a.m, mode, treasureIds))
    );
    let needed;
    if (sorted[0].cd <= FAST_BURST_CD) needed = 1;
    else if (sorted.length >= 2 && sorted[1].cd <= ALTERNATE_BURST_CD) needed = 2;
    else needed = Math.min(sorted.length, 2);
    sorted.forEach(({ m }, i) => burstOrder.set(m.id, i));
    sorted.slice(needed).forEach(({ m }) => {
      const note = INVESTMENT_NOTE_BY_NAME.get(m.title);
      if (note?.totemRole && totemConditionMet(note, m, members)) {
        // 토템 후보는 버스트 대신 상시 효과로 기여하므로 낭비가 아니다.
        totemExempted.push({ member: m, note, needed });
        return;
      }
      wasted.push(m);
    });
  });
  return { wasted, totemExempted, burstOrder };
}

// 화면 표시용 정렬: 버스트 1 → 2 → 3, 같은 단계 안에서는 엔진이 가정한 버스트 순번대로.
// 이렇게 하면 표시 순서가 곧 "누가 실제로 버스트를 쓰는가"를 나타내고, 토템처럼 버스트를
// 쓰지 않는 멤버가 자연스럽게 뒤로 간다.
function orderMembersForDisplay(members, mode, treasureIds) {
  const { burstOrder } = findWastedBurstMembers(members, mode, treasureIds);
  return [...members].sort(
    (a, b) =>
      (Number(a.burst) - Number(b.burst)) ||
      ((burstOrder.get(a.id) ?? 0) - (burstOrder.get(b.id) ?? 0))
  );
}

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
  const skillSynergies = findSkillMechanicSynergies(members);
  skillSynergies.forEach((syn) => {
    score += WEIGHTS.SKILL_MECHANIC_SYNERGY;
    reasons.push(
      `[스킬 근거] ${syn.caster}의 스킬에 '${syn.label} ▲' 버프 효과가 있고, ${syn.receivers.join(', ')}의 ` +
      `공격은 스킬 문구상 ${syn.label}로 분류되어 있어 이 버프를 그대로 받습니다.`
    );
  });

  // --- 티어 합산 (같은 버스트 단계에서 실제로 쓰이지 못하는 낭비 인원은 0점 처리) ---
  const burstAnalysis = findWastedBurstMembers(members, mode, treasureIds);
  const wastedMembers = burstAnalysis.wasted;
  const wastedIds = new Set(wastedMembers.map((m) => m.id));
  const tierTotal = members.reduce(
    (sum, m) => sum + (wastedIds.has(m.id) ? 0 : tierScore(m, mode, treasureIds)),
    0
  );
  score += tierTotal * WEIGHTS.TIER_SUM;
  if (wastedMembers.length > 0) {
    reasons.push(
      `⚠️ ${wastedMembers.map((m) => m.title).join(', ')}는(은) 같은 버스트 단계를 다른 캐릭터가 ` +
      `이미 쿨타임 기준으로 충분히 커버하고 있어 실제로 버스트를 발동할 기회가 거의 없고, 상시 ` +
      `버프/유틸리티로 기여하는 토템 역할도 아니라서 이 조합에서는 사실상 자리를 낭비하고 있습니다. ` +
      `이 자리를 다른 버스트 단계 보강이나 다른 캐릭터로 바꾸는 것을 추천합니다.`
    );
  }

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

  // --- 조건부 매칭 헬퍼 ---
  // 2026-08-07 추가: synergyNotes의 일부 항목은 조건을 멤버 이름에 욱여넣어("Zwei (Treasure)",
  // "Helm (Treasure)", "Red Hood B1") characterDatabase.json에 없는 이름이 되어버렸고, 그 결과
  // 해당 페어/아키타입은 영영 매칭되지 않는 죽은 데이터였다(scripts/checkData.mjs가 검출).
  // 이름은 실제 캐릭터명으로 되돌리고 조건은 requiresTreasure 필드로 분리했으므로,
  // 여기서 그 조건을 실제로 검사한다 — 애장품을 장착하지 않았으면 그 시너지는 인정하지 않는다.
  const idByTitle = new Map(members.map((m) => [m.title, m.id]));
  const treasureSatisfied = (need) =>
    !need || need.every((t) => treasureIds.has(idByTitle.get(t)));
  const withTreasureMark = (list, need) =>
    list.map((n) => ((need || []).includes(n) ? n + "(애장품)" : n));

  // --- 아키타입 매칭 ---
  // 2026-08-07 수정: 매칭되는 아키타입을 전부 더하지 않고, 일단 후보로만 모아뒀다가
  // 점수가 큰 상위 ARCHETYPE_MATCH_CAP개만 실제 점수/근거에 반영한다. (다 같이 고쳐야지 —
  // findExactTeamMatch와 free-form AI 경로가 모두 이 scoreTeam()을 공유하므로 여기서 고치면
  // 두 경로 전부에 적용된다.)
  const compatModes = MODE_COMPAT[mode] || [mode];
  const archetypeMatches = [];
  synergyNotes.archetypes
    .filter((a) => compatModes.includes(a.mode))
    .forEach((a) => {
      const need = a.members || [];
      if (need.length === 0) return;
      const have = need.filter((n) => titles.includes(n));
      if (have.length === need.length) {
        // 애장품이 전제인 조합은 실제로 장착했을 때만 인정한다.
        if (!treasureSatisfied(a.requiresTreasure)) return;
        archetypeMatches.push({
          points: WEIGHTS.ARCHETYPE_FULL_MATCH,
          reason: `'${a.name}' 조합으로 알려진 구성입니다. ${a.note}`,
        });
      } else if (have.length > 0) {
        const missing = need.filter((n) => !titles.includes(n));
        archetypeMatches.push({
          points: WEIGHTS.ARCHETYPE_PARTIAL_MATCH * have.length,
          reason:
            `'${a.name}' 조합의 일부(${have.join(', ')})가 포함되어 있습니다. ` +
            `${missing.join(', ')}를(을) 보유하면 이 조합의 완성도가 더 올라갑니다.`,
        });
      }
    });
  archetypeMatches
    .sort((x, y) => y.points - x.points)
    .slice(0, WEIGHTS.ARCHETYPE_MATCH_CAP)
    .forEach((m) => {
      score += m.points;
      reasons.push(m.reason);
    });

  // --- 시너지 페어 ---
  synergyNotes.synergyPairs.forEach((p) => {
    const have = p.members.filter((n) => titles.includes(n));
    if (have.length !== p.members.length) return;
    if (!treasureSatisfied(p.requiresTreasure)) return;
    score += WEIGHTS.SYNERGY_PAIR;
    reasons.push(
      `${withTreasureMark(p.members, p.requiresTreasure).join(' + ')} 페어 시너지: ${p.reason}`
    );
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
      const key = MODE_TO_TIER_KEY[mode] || 'story';
      const base = m?.tiers?.[key];
      const withTreasure = note.treasureTiers?.[key];
      // 애장품 보유 시 티어를 알고 있으면 "얼마나 손해인지"를 구체적으로 알려준다.
      // 2026-08-07 수정: 처음엔 "애장품을 갖추면 B → SS로 올라간다"고 썼는데, 설명을 쓰는 AI가
      // 그 문장을 '성장 잠재력'으로 읽고 미보유 상태를 오히려 장점처럼 포장하는 문제가 있었다
      // (유저 지적: "애장품이 없으니까 잘못된 추천이잖아"). 지금 보유한 상태를 기준으로만
      // 읽히도록, 상승 여력이 아니라 현재의 한계로 서술한다.
      const gap = withTreasure
        ? ` 지금은 애장품이 없어 공략의 ${withTreasure} 평가가 아니라 ${base} 성능으로 계산했습니다. ` +
          `이 조합에서 ${m.title}의 기여는 ${base} 수준까지로 보고 판단해야 합니다.`
        : ` 이 조합에서는 애장품 없는 기본 티어(${base}) 기준으로 계산했습니다.`;
      reasons.push(
        `[투자 참고] ${m.title}는(은) 공략 기준 애장품(Treasure) 의존도가 높은 캐릭터인데 애장품을 ` +
        `장착하지 않은 상태입니다.${gap} ${note.treasureNote}`
      );
    }
  });

  // --- 토템 역할(같은 버스트 단계를 다른 캐릭터가 이미 커버할 때 상시 버프용으로 추가 기용) ---
  // 2026-08-04 추가: 유저가 "나가처럼 버스트가 아니라 팀 회복 버프 때문에 같은 버스트 단계에
  // 추가로 넣는 캐릭터가 있다"고 제보. characterInvestmentNotes.json에 totemRole/totemNote로
  // 정리해둔 캐릭터가, 같은 버스트 단계의 다른 멤버가 이미 빠른 쿨타임(20초)으로 매 사이클을
  // 커버하고 있는 상태로 팀에 포함돼 있으면, 그게 왜 정당한 픽인지 근거 문장으로 설명해준다.
  //
  // 2026-08-07 수정: 원래는 "같은 단계에 쿨 20초짜리가 있을 때"만 이 문장이 나왔다. 그래서
  // 버스트3에 40초짜리 3명이 있고 그중 하나가 토템인 경우(스화헤비/일레그/프리바티)에는
  // 낭비 판정에서 토템 예외는 적용되는데 정작 그 이유를 설명하는 문장이 안 나왔다.
  // 유저가 "프리바티가 토템이면 잘못된 배치 아니냐"고 물은 것도 이 설명이 없었기 때문이다.
  // 이제는 실제로 버스트 순번에서 밀려 토템으로 인정된 경우(totemExempted)에도 문장을 낸다.
  const explainedTotems = new Set();
  burstAnalysis.totemExempted.forEach(({ member: m, note, needed }) => {
    explainedTotems.add(m.id);
    const others = members
      .filter((o) => o.id !== m.id && String(o.burst) === String(m.burst))
      .map((o) => o.title);
    reasons.push(
      `[토템 활용] 버스트${m.burst} 단계는 ${others.join(', ')}가 번갈아 돌리면 매 사이클 커버되므로 ` +
      `(쿨타임 기준 ${needed}명이면 충분), ${m.title}는(은) 버스트 순번에서 빠집니다. 대신 버스트를 쓰지 ` +
      `않아도 발동하는 상시 버프/유틸리티로 기여하는 토템 역할이라 이 자리는 낭비가 아닙니다. ${note.totemNote}`
    );
  });
  members.forEach((m) => {
    const note = INVESTMENT_NOTE_BY_NAME.get(m.title);
    if (!note?.totemRole || explainedTotems.has(m.id)) return;
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
    // 스킬 원문에서 "A가 주는 [데미지 타입] 버프를 B가 실제로 받는다"가 확인된 쌍의 개수.
    // 폴백 탐색(recommendTeams)의 동점 처리에 쓰기 위해 밖으로 노출한다.
    skillSynergyCount: skillSynergies.length,
    // 1/2스킬로 전 아군에게 의미 있는 공격계열 버프를 주는 멤버 수(버퍼 수).
    allyBufferCount: members.filter((m) => allyBuffStrength(m) >= MEANINGFUL_ALLY_BUFF).length,
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
// 예: 8개면 버스트 인원 분배 기준 최대 약 1.2만 개 조합 → 실시간 응답 가능한 수준.
const BUCKET_CAP = 8;

// 버스트 I/II/III가 각 1명 이상, 합계 5명이 되는 인원 분배 조합을 전부 만든다.
// 2026-08-07 수정: 이전엔 '2-1-2'/'1-1-3' 두 가지 형태만 후보로 만들어서, 실제로 유효한
// 3-1-1/1-3-1/1-2-2/2-2-1 같은 다른 버스트 분배는 애초에 탐색조차 되지 않았다(유저 지적:
// "포메이션에 갇혀서 조합을 짜는 느낌이 있다"). 6가지 분배를 전부 자동 생성해 탐색 대상에
// 넣도록 고쳤었다.
// 2026-08-07 수정(2차): 유저가 재차 지적 — "포메이션 기준으로 선정되는 느낌이 난다, 왜
// 있는지 모르겠다"고 함. 6가지를 전부 도는 것 자체는 수학적으로는 버스트I/II/III 각 1명
// 이상이라는 조건을 만족하는 모든 5인 조합을 빠짐없이 탐색하는 것과 동일한 결과를 내지만
// (버스트 인원 분배는 5명을 뽑으면 자동으로 정해지는 결과이지, 그것을 미리 정해두고 그
// 틀에 맞춰 캐릭터를 채워 넣는 게 아니다), 코드가 "포메이션"이라는 개념을 선정 로직의
// 1급 조직 원리처럼 노출하고 있어 그 인상을 주고 있었다. 이 함수는 이제 순수하게 "버스트
// I/II/III 인원수 조합(needed member counts)"을 생성하는 내부 구현 디테일일 뿐이고,
// 결과 team 객체에는 더 이상 formation 필드를 넣지 않는다 — 어떤 분배였는지는 선정에도
// 표시에도 쓰이지 않는다.
function buildBurstCountDistributions() {
  const distributions = [];
  for (let a = 1; a <= 3; a += 1) {
    for (let b = 1; b <= 3; b += 1) {
      const c = 5 - a - b;
      if (c < 1 || c > 3) continue;
      distributions.push({ 1: a, 2: b, 3: c });
    }
  }
  return distributions;
}
const BURST_COUNT_DISTRIBUTIONS = buildBurstCountDistributions();

// ownedCharacters: characterDatabase.json 항목 배열(보유한 캐릭터만)
export function recommendTeams(ownedCharacters, mode = 'campaign', opts = {}) {
  const topN = opts.topN || 5;
  const treasureIds = opts.treasureIds || new Set();
  const bossElement = opts.bossElement || null;

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
        const za = tierScore(z, mode, treasureIds) + ((bossElement && realElementUsage(z, bossElement)) || 0) / 20;
        const aa = tierScore(a, mode, treasureIds) + ((bossElement && realElementUsage(a, bossElement)) || 0) / 20;
        return za - aa;
      })
      .slice(0, BUCKET_CAP);
  });

  const candidateTeams = [];
  BURST_COUNT_DISTRIBUTIONS.forEach((counts) => {
    if (buckets[1].length < counts[1] || buckets[2].length < counts[2] || buckets[3].length < counts[3]) {
      return; // 이 인원 분배를 만들 만큼 후보가 부족하면 스킵
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
            members: orderMembersForDisplay(members, mode, treasureIds).map((m) => ({ id: m.id, title: m.title, name_kr: m.name_kr, burst: m.burst, img: m.img || null })),
            ...result,
            totalScore: result.tierTotal,
          });
        });
      });
    });
  });

  // 2026-08-07 수정: 순위 기준.
  //
  // 1차는 여전히 순수 티어 합이다 — "조합에 있는 니케 점수만 따진다"는 방침을 지키기 위해,
  // 시너지 때문에 티어가 낮은 조합이 높은 조합을 밀어내는 일이 없어야 한다.
  //
  // 다만 조합을 전수 탐색하면 티어 합이 완전히 같은 후보가 아주 많이 나온다. 그동안은 그중
  // 무엇이 뽑히는지가 사실상 배열 순서였다. 유저 요청("보유 니케가 한정적일 경우에는 스킬
  // 시너지가 날 수 있는 방향으로 조합을 짜달라")은 바로 이 동점 구간에 적용한다:
  //   동점이면 → 스킬 원문으로 확인된 데미지 타입 시너지가 많은 쪽
  //   그래도 동점이면 → 전 아군 버프를 주는 버퍼가 많은 쪽
  // 가산점이 아니라 동점 처리라, 순위가 뒤집히지 않으면서 방향만 잡아준다.
  candidateTeams.sort(
    (a, z) =>
      (z.totalScore - a.totalScore) ||
      (z.skillSynergyCount - a.skillSynergyCount) ||
      (z.allyBufferCount - a.allyBufferCount)
  );

  return {
    teams: candidateTeams.slice(0, topN),
    searched: candidateTeams.length,
    dataFreshness: getDataFreshnessMeta(),
  };
}

// ---------------------------------------------------------------------------
// enikk.app 실사용 5인 조합 완전일치 (조합 선정 1순위)
//
// 2026-08-07 추가. 유저 방침:
//   "실사용 데이터를 우선하되(실사용 데이터는 보통 스킬 시너지가 짜여있는 조합),
//    보유 니케가 한정적일 경우에는 스킬 시너지가 날 수 있는 방향으로 조합을 짜주는 방식"
//
// 핵심 논리는 "실제로 많이 쓰이고 이긴 조합에는 이미 시너지가 검증되어 들어있다"는 것이다.
// 그래서 개별 티어 점수 합보다 이쪽을 먼저 본다. 티어 합은 개인 성능 지표라 팀 시너지를
// 반영하지 못하고, 그것 때문에 "왜 이 조합이 나왔는지" 설명이 계속 부실했다.
//
// 한계(중요): enikk.app에 5인 조합 단위 기록이 있는 것은 캠페인과 PvP뿐이다. 보스전(솔로
// 레이드)은 캐릭터별 사용률만 있고 조합 기록이 없어 이 함수는 null을 반환하며, 그 경우
// 호출부는 다음 순위(prydwen 아키타입)로 넘어간다.
// ---------------------------------------------------------------------------
const REAL_TEAM_SOURCE = {
  campaign: 'campaign',
  story: 'campaign',
  pvp: 'pvp',
  // bossing / raid / tribe_tower: 5인 조합 단위 실사용 기록 없음
};

export function findRealUsageTeamMatch(ownedCharacters, mode = 'campaign', opts = {}) {
  const source = REAL_TEAM_SOURCE[mode];
  if (!source) return null;

  const treasureIds = opts.treasureIds || new Set();
  const bossElement = opts.bossElement || null;
  const excludeTitles = new Set(opts.excludeTitles || []);
  const byTitle = new Map(ownedCharacters.map((c) => [c.title, c]));
  const ownedTitles = new Set(ownedCharacters.map((c) => c.title));

  // 캠페인은 "얼마나 많이 쓰였는가"(pctOfClears), PvP는 "얼마나 이겼는가"(승률)를 기준으로 삼는다.
  const entries =
    source === 'campaign'
      ? (metaStats.campaignCompositions?.list || []).map((e) => ({ e, rank: e.pctOfClears || 0 }))
      : (metaStats.pvp?.topTeams || []).map((e) => ({ e, rank: e.wr || 0 }));

  let best = null;
  entries.forEach(({ e, rank }) => {
    const titles = e.members || [];
    if (titles.length !== 5 || new Set(titles).size !== 5) return;
    if (!titles.every((t) => ownedTitles.has(t))) return;
    if (titles.some((t) => excludeTitles.has(t))) return;

    const members = titles.map((t) => byTitle.get(t));
    const scored = scoreTeam(members, mode, { treasureIds, bossElement });
    if (!scored.valid) return; // 버스트 I/II/III 조건을 못 갖추면 제외
    if (!best || rank > best.rank) best = { entry: e, rank, members, scored };
  });

  if (!best) return null;

  const e = best.entry;
  const headline =
    source === 'campaign'
      ? `[실전 기록] 이 5인 조합은 enikk.app 캠페인 클리어 기록에서 실제로 ` +
        `${(e.totalUses || 0).toLocaleString()}회 사용되어 분석된 전체 클리어의 ${e.pctOfClears}%를 ` +
        `차지합니다. 플레이어들이 실제로 가장 많이 쓰는 조합이라 시너지가 이미 검증된 구성입니다.`
      : `[실전 기록] 이 5인 조합은 챔피언 아레나 실제 대전에서 승률 ${e.wr}%(${e.n}전, ` +
        `채택률 ${e.adoption}%)를 기록한 구성입니다. 실제로 이긴 기록이라 시너지가 검증된 조합입니다.`;

  return {
    members: orderMembersForDisplay(best.members, mode, treasureIds).map((m) => ({
      id: m.id, title: m.title, name_kr: m.name_kr, burst: m.burst, img: m.img || null,
    })),
    // 표시 점수는 다른 경로와 동일하게 티어 합을 쓴다(경로마다 점수 의미가 달라지면 혼란).
    totalScore: best.scored.tierTotal,
    reasons: [headline, ...best.scored.reasons],
    realUsage: source === 'campaign'
      ? { kind: 'campaign', totalUses: e.totalUses, pctOfClears: e.pctOfClears }
      : { kind: 'pvp', wr: e.wr, n: e.n, adoption: e.adoption },
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
//
// 2026-08-07 수정(3차): recommendTeams()와 마찬가지로 여기서도 후보 비교 기준(tierSum)이
// findWastedBurstMembers()의 낭비 판정을 반영하지 않던 문제를 함께 맞춘다 — 같은 버스트 단계
// 인원이 실제로 못 쓰는 자리라면 이 완전일치 후보 비교에서도 점수에 넣지 않는다.
// ---------------------------------------------------------------------------
export function findExactTeamMatch(ownedCharacters, mode = 'campaign', opts = {}) {
  const treasureIds = opts.treasureIds || new Set();
  const bossElement = opts.bossElement || null;
  const excludeTitles = new Set(opts.excludeTitles || []);
  const compatModes = MODE_COMPAT[mode] || [mode];
  const byTitle = new Map(ownedCharacters.map((c) => [c.title, c]));
  const ownedTitleSet = new Set(ownedCharacters.map((c) => c.title));

  // 2026-08-07 추가: flexSlots 지원.
  //
  // prydwen 팀 데이터베이스의 조합에는 "이 3명 + B3 아무나" 처럼 비워둔 자리가 있다.
  // 예전 스크랩은 그 자리 표시(B1/B2/B3/flex)를 그냥 버려서, 5인 팀이 2~4인짜리로 잘린 채
  // 저장됐고 완전일치 후보에서 아예 제외되고 있었다(유저 지적). 이제 flexSlots로 복원했으니,
  // 비어 있는 자리는 보유 로스터에서 조건에 맞는 캐릭터로 채워 5인을 완성한다.
  //   "B1"/"B2"/"B3" -> 그 버스트 단계 캐릭터
  //   "B1-CDR"        -> 버스트1 중 쿨타임 감소를 제공하는 캐릭터
  //   "flex"          -> 버스트 무관
  // 이미 고정 멤버로 들어간 캐릭터는 후보에서 제외한다.
  const slotCandidates = (slot, used) => {
    const pool = ownedCharacters.filter(
      (c) => !used.has(c.title) && !excludeTitles.has(c.title)
    );
    const m = String(slot).match(/^B([123])/);
    let filtered = m ? pool.filter((c) => String(c.burst) === m[1]) : pool;
    if (/-CDR$/i.test(String(slot))) filtered = filtered.filter(providesCDR);
    return filtered;
  };

  // 후보 비교용 티어 합. scoreTeam()의 tierTotal과 같은 규칙(낭비 인원 0점, 토템은 예외)이지만
  // 아키타입/시너지 계산을 건너뛰어 훨씬 싸므로 슬롯 채우기에서 반복 호출해도 부담이 없다.
  const teamTierTotal = (members) => {
    const { wasted } = findWastedBurstMembers(members, mode, treasureIds);
    const wastedIds = new Set(wasted.map((m) => m.id));
    return members.reduce(
      (sum, m) => sum + (wastedIds.has(m.id) ? 0 : tierScore(m, mode, treasureIds)),
      0
    );
  };

  // 고정 멤버 + 슬롯을 채워 5인을 만든다. 채울 수 없으면 null.
  //
  // 2026-08-07 수정: 예전에는 슬롯을 "개인 티어가 가장 높은 캐릭터"로 채웠는데, 최종 점수는
  // tierTotal(= 낭비 인원을 0점 처리한 합)이라 채우는 기준과 채점하는 기준이 서로 달랐다.
  // 그 결과 엔진이 자기 기준으로 더 나쁜 팀을 만들었다. 실측 예(God Comp #2, 캠페인):
  //   고정 4명이 이미 B1/B2/B3를 다 채워서, 5번째로 들어오는 캐릭터는 토템이 아닌 한 무조건
  //   낭비 처리되어 0점이 된다. 그런데 개인 티어만 보면 레드후드(SSS)가 1등이라 그를 골라
  //   총점 35점이 나왔다. 같은 자리에 모더니아(A, 토템)를 넣으면 41점이었다.
  // 이제 "그 캐릭터를 넣었을 때 tierTotal이 실제로 얼마나 오르는가"로 고른다. 그러면 이미
  // 포화된 버스트 단계는 자연히 피하고, 채워야 한다면 토템을 고르게 된다 -- 실제 유저들이
  // 그 자리에 토템을 넣는 이유와 같은 결론이다.
  const fillTeam = (a) => {
    const fixed = a.members || [];
    const slots = a.flexSlots || [];
    if (fixed.length + slots.length !== 5) return null;
    if (!fixed.every((t) => ownedTitleSet.has(t))) return null;
    if (fixed.some((t) => excludeTitles.has(t))) return null;

    const base = fixed.map((t) => byTitle.get(t));
    const used0 = new Set(fixed);
    // 제약이 강한 슬롯(B1-CDR 등)을 앞에 둔다. 아래 전 조합 탐색에서는 순서가 결과를 바꾸지
    // 않지만, 후보가 마른 슬롯을 먼저 걸러 탐색을 일찍 끝낼 수 있다.
    const order = [...slots].sort(
      (x, y) => slotCandidates(x, used0).length - slotCandidates(y, used0).length
    );
    if (order.some((s) => slotCandidates(s, used0).length === 0)) return null;

    // 각 슬롯 후보를 "혼자 넣었을 때의 기여도" 순으로 세운 뒤 상위 CAP명만 남긴다.
    // 슬롯은 최대 4개라 CAP^4 = 4096가지가 상한이고, 버스트 조건 때문에 실제로는 훨씬 적다.
    // (슬롯을 하나씩 순서대로 고르는 방식도 써봤지만, 뒤에 올 슬롯을 보지 못해 자유 슬롯이
    //  2개 이상인 조합에서 최적보다 낮은 구성에 갇히는 경우가 실측으로 확인됐다.)
    const CAP = 8;
    const ranked = order.map((s) =>
      slotCandidates(s, used0)
        .map((c) => ({ c, v: teamTierTotal([...base, c]), t: tierScore(c, mode, treasureIds) }))
        .sort((a, z) => (z.v - a.v) || (z.t - a.t))
        .map((x) => x.c)
    );

    // 슬롯 조합 전체를 시도해 tierTotal이 가장 높은 구성을 고른다. 동점이면 개인 티어 합이
    // 높은 쪽을 택해 결과가 로스터 정렬 순서에 흔들리지 않게 한다.
    const search = (pools) => {
      let best = null;
      let bestV = -Infinity;
      let bestT = -Infinity;
      const usedTitles = new Set(fixed);
      const acc = [];
      const rec = (i) => {
        if (i === pools.length) {
          const v = teamTierTotal([...base, ...acc]);
          const t = acc.reduce((s, c) => s + tierScore(c, mode, treasureIds), 0);
          if (v > bestV || (v === bestV && t > bestT)) {
            bestV = v; bestT = t; best = [...acc];
          }
          return;
        }
        pools[i].forEach((c) => {
          if (usedTitles.has(c.title)) return;
          usedTitles.add(c.title); acc.push(c);
          rec(i + 1);
          acc.pop(); usedTitles.delete(c.title);
        });
      };
      rec(0);
      return best;
    };

    // 상위 CAP명끼리 서로 겹쳐 5인을 못 채우는 드문 경우에는 제한을 풀고 다시 찾는다.
    let picked = search(ranked.map((p) => p.slice(0, CAP)));
    if (!picked) picked = search(ranked);
    if (!picked) return null;

    return {
      members: [...base, ...picked],
      filledCount: picked.length,
    };
  };

  const candidates = synergyNotes.archetypes.filter((a) => {
    const members = a.members || [];
    const slots = a.flexSlots || [];
    if (members.length + slots.length !== 5) return false;
    if (new Set(members).size !== members.length) return false;
    if (a.ambiguousBurst) return false;
    if (!compatModes.includes(a.mode)) return false;
    if (!members.every((m) => ownedTitleSet.has(m))) return false;
    if (members.some((m) => excludeTitles.has(m))) return false;
    // 애장품 전제 조합은 그 애장품을 보유했을 때만 완전일치 후보로 인정한다.
    if (a.requiresTreasure && !a.requiresTreasure.every((t) => {
      const c = byTitle.get(t);
      return c && treasureIds.has(c.id);
    })) return false;
    return true;
  });

  let best = null;
  candidates.forEach((a) => {
    const filled = fillTeam(a);
    if (!filled) return;
    const members = filled.members;
    const scored = scoreTeam(members, mode, { treasureIds, bossElement });
    if (!scored.valid) return;
    // scoreTeam()이 이미 낭비 인원을 제외하고 계산한 tierTotal을 그대로 후보 비교 기준으로
    // 쓴다 — 아키타입 개수와 무관하게 안정적이고, 같은 버스트 단계 낭비 인원도 반영된다.
    const tierSum = scored.tierTotal;
    // 동점이면 자유 슬롯을 덜 채운 쪽(= prydwen이 더 구체적으로 지정한 조합)을 택한다.
    if (!best || tierSum > best.tierSum ||
        (tierSum === best.tierSum && filled.filledCount < best.filledCount)) {
      best = { archetype: a, members, scored, tierSum, filledCount: filled.filledCount };
    }
  });

  if (!best) return null;

  // 자유 슬롯을 채워 완성한 조합이면, 어디까지가 원본 조합이고 어디를 우리가 채웠는지 밝힌다.
  // (그래야 사용자가 "이 자리는 바꿔도 되는 자리"라는 걸 알 수 있다)
  const slotReasons = [];
  if (best.filledCount > 0) {
    const fixedTitles = new Set(best.archetype.members || []);
    const filledTitles = best.members.filter((m) => !fixedTitles.has(m.title)).map((m) => m.title);
    slotReasons.push(
      `[자유 슬롯] 이 조합은 원래 ${[...fixedTitles].join(', ')}만 고정이고 나머지 ` +
      `${best.archetype.flexSlots.join(', ')} 자리는 비어 있는 구성입니다. ` +
      `보유 캐릭터 중 조건에 맞고 이 모드 티어가 가장 높은 ${filledTitles.join(', ')}로 채웠습니다. ` +
      `이 자리는 같은 조건을 만족하는 다른 캐릭터로 바꿔도 조합이 성립합니다.`
    );
  }

  return {
    members: orderMembersForDisplay(best.members, mode, treasureIds).map((m) => ({ id: m.id, title: m.title, name_kr: m.name_kr, burst: m.burst, img: m.img || null })),
    // scoreTeam().totalScore(아키타입 중복 합산 버그로 700점대까지 부풀 수 있음) 대신 위에서
    // 후보 비교에 쓴 티어 합을 그대로 표시 점수로 쓴다 — 캐릭터 5명의 실제 성능을 그대로
    // 반영하는 값이라 이해하기 쉽고, 아키타입 개수가 늘어나도 값이 흔들리지 않는다.
    totalScore: best.tierSum,
    reasons: [...slotReasons, ...best.scored.reasons],
    // 원문(영어) 그대로 사용하지 말 것 — 호출부에서 이 두 필드를 참고 자료로만 삼아
    // AI에게 한국어(또는 선택 언어)로 재구성하도록 넘긴다.
    archetypeName: best.archetype.name,
    archetypeNote: best.archetype.note,
  };
}

// 사용 예:
// const owned = resolveOwnedCharacters(['rapi-red-hood', 'mast-romantic-maid', ...]);
// const { teams, dataFreshness } = recommendTeams(owned, 'bossing', { bossElement: 'Iron' });
