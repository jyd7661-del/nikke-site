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
import soloRaidTeams from '../data/soloRaidTeams.json';
import towerCompositions from '../data/towerCompositions.json';
import characterInvestmentNotes from '../data/characterInvestmentNotes.json';
import { engineText } from './engineReasons';

// --- 근거 문장의 언어 처리 (2026-08-25) ---
//
// 근거 문장의 골격은 lib/engineReasons.js가, 문장 안에 인용되는 자료 원문은 데이터 파일의
// `_en`/`_ja` 필드가 담당한다. 둘 중 하나만 번역하면 문장 절반이 한국어로 남는다.

// 데이터 파일 항목의 언어별 표기. 해당 언어 번역이 없으면 한국어 원문으로 떨어뜨린다
// (문장이 통째로 비는 것보다 낫다 — 없는 필드는 checkData가 따로 잡는다).
const localized = (obj, field, lang) => {
  if (!obj) return '';
  if (lang !== 'ko') return obj[`${field}_${lang}`] || obj[field] || '';
  return obj[field] || '';
};

// 근거 문장에 넣는 캐릭터 이름.
//
// ⚠️ ko/en은 지금까지처럼 영문 title을 쓴다. 이 문장은 화면뿐 아니라 **AI 프롬프트로도**
//    들어가는데, 프롬프트의 멤버 목록이 title로 캐릭터를 식별하기 때문에 여기만 한국어
//    이름으로 바꾸면 같은 캐릭터가 두 이름으로 등장한다. 일본어는 영문이 섞이면 AI가
//    그대로 받아써서 문장이 튀므로 name_ja를 쓴다.
const rName = (m, lang) => (lang === 'ja' ? (m?.name_ja || m?.title || '') : (m?.title || m?.name_kr || ''));

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
export const MODE_TO_TIER_KEY = {
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

// ---------------------------------------------------------------------------
// 자유 슬롯(빈칸) 차감 — 후보 비교용 (2026-08-09 추가)
//
// 빈칸은 "보유 로스터에서 조건에 맞는 최고 티어"로 채워진다. 즉 빈칸이 있는 조합은 고정 5인
// 조합과 달리 **로스터 전체를 뒤져 최댓값을 고르는** 셈이라, 티어 합 비교에서 구조적으로
// 유리하다(빈칸이 많을수록 max-of-N 이득이 커짐). 유저 지적으로 확인된 문제다:
// "베스티: 택티컬 업(story SSS) 하나만 고정이고 빈칸이 4개인 조합이 있는데, 이 니케를
//  보유하면 무조건 그 조합이 선정될 가능성이 너무 크다."
//
// 실측(2026-08-09, 베스티 보유 로스터 49건, campaign):
//   - 로스터 30명: 그 조합이 1위 8/8건(100%). 단 이 구간은 **다른 완전일치가 아예 0건**이라
//     경쟁자가 없어서 이긴 것이고, 차감으로는 바뀌지 않는다(바꿀 대상이 없음).
//   - 로스터 100명 이상: 다른 완전일치가 생기고, 그때 점수차는 **평균 2.8점(1~6)**.
//     빈칸 4칸 × 1점 = 4점이면 이 구간은 대부분 뒤집힌다.
//   → 1점/칸은 임의로 고른 값이 아니라 **실측 격차와 자리수가 맞는 크기**다.
//
// **차감은 후보 비교에만 쓰고 화면 표시 점수(totalScore)에는 반영하지 않는다.**
// 표시 점수는 "이 5명의 실제 티어 합"이라는 의미를 유지해야 사용자가 해석할 수 있다.
//
// ⚠️ 값 1은 잠정입니다. 유저가 "몇 점이 맞는지는 아직 확실히 정하지 못했다"고 했으므로,
// 바꿀 때는 이 상수만 고치고 실측을 다시 돌리세요(0으로 두면 도입 전 동작과 완전히 같습니다).
export const FLEX_SLOT_PENALTY = 1;

// ---------------------------------------------------------------------------
// 기업 타워 편성 자격 (2026-08-08 추가)
//
// 트라이브 타워(일반)는 제조사 제한이 없고 상시 열려 있다. 기업 타워는 요일제로 열리며
// 해당 제조사 니케만 출전할 수 있다(월 전체 / 화·금 엘리시온 / 수·토 미실리스 /
// 목·일 테트라 / 수 필그림).
//
// 예외는 오버스펙이다. 오버스펙은 3대 기업 캐릭터의 파워업 버전으로 **소속 기업을 유지하면서**
// 필그림/오버스펙 타워에도 들어간다 — 즉 원 소속 기업 타워와 필그림 타워 양쪽에서 쓸 수 있다.
// 소속을 유지하므로 원 소속 타워 쪽은 manufacturer 비교로 이미 커버되고, 여기서 따로 봐야
// 하는 건 필그림 타워뿐이다.
//
// 이 예외가 없으면 필그림 타워가 사실상 성립하지 않는다: 필그림 SSR 중 버스트1은 4명뿐이고
// (라푼젤 / 도로시 / 라푼젤: 퓨어 그레이스 / 리틀 머메이드), prydwen의 필그림 타워 조합 2건도
// 전부 오버스펙(라피: 레드 후드, 아니스: 스타, 미하라: 본딩 체인)을 포함한다. 제조사 필터만
// 걸면 그 조합들이 통째로 깨진다.
//
// abnormal(콜라보·특수) 25명은 기업 타워 자체가 없어 일반 타워 전용이다.
export const TOWER_CORPS = ['elysion', 'missilis', 'tetra', 'pilgrim'];

// 기업 타워 이름은 **lib/engineReasons.js가 언어별로** 들고 있다(`tower_elysion` 등).
// 2026-08-25 이전에는 여기에 한국어 전용 TOWER_LABEL이 있었는데, 근거 문장이 3개국어가
// 되면서 같은 이름표가 두 곳에 생기게 됐다. 이름 규칙이 갈라지면 한쪽만 고치고 끝난다
// (.claude/rules/ui-i18n.md의 같은 이유) — 그래서 여기 사본은 지웠다.

export function isTowerEligible(character, tower) {
  if (!tower) return true; // 일반 트라이브 타워: 제한 없음
  if (!character) return false;
  if (tower === 'pilgrim') {
    return character.manufacturer === 'pilgrim' || character.overspec === true;
  }
  return character.manufacturer === tower;
}

// 로스터를 타워 자격으로 거른다.
//
// **걸러진 로스터 하나만 진입점에 흘려보내면 나머지가 전부 따라온다:**
//   - 아키타입 후보 조건이 "멤버 전원 보유"라, 자격 없는 멤버가 낀 조합은 자동으로 빠진다
//   - flexSlots도 이 로스터에서만 채워지므로 빈 자리에 자격 없는 캐릭터가 들어갈 수 없다
//   - recommendTeams의 전체 탐색도 같은 풀을 쓴다
// 그래서 아키타입마다 "이건 무슨 타워 조합인가"를 따로 판별할 필요가 없다. 아키타입 30개에
// 타워 구분 필드가 없다는 게 이 작업의 걸림돌로 보였지만, 자격을 캐릭터 쪽에서 판정하면
// 그 문제 자체가 사라진다.
export function filterRosterByTower(ownedCharacters, tower) {
  if (!tower) return ownedCharacters;
  return (ownedCharacters || []).filter((c) => isTowerEligible(c, tower));
}

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
// 이 캐릭터가 이 모드에서 실제로 받는 티어 등급(SSS~F). 애장품을 장착했고 그 모드의
// treasureTiers가 있으면 그걸 쓰고, 아니면 characterDatabase의 기본 티어를 쓴다.
//
// 화면(CharacterPicker의 티어 배지·정렬)도 이 함수를 쓴다. 예전에는 화면이 기본 티어만
// 읽어서, 애장품을 표시해도 배지가 안 바뀌었다 — 헬름은 기본 B인데 애장품 보스전이 SS라
// 실제 채점과 화면이 크게 어긋났다(2026-08-13 유저 지적). 같은 함수를 공유하면 어긋날 수 없다.
export function effectiveTier(character, mode, treasureIds) {
  const key = MODE_TO_TIER_KEY[mode] || 'story';
  const note = INVESTMENT_NOTE_BY_NAME.get(character?.title);
  const useTreasureTier =
    treasureIds && note?.treasureTiers && treasureIds.has(character?.id);
  return (useTreasureTier ? note.treasureTiers[key] : null) || character?.tiers?.[key] || null;
}

function tierScore(character, mode, treasureIds) {
  return TIER_SCORE[effectiveTier(character, mode, treasureIds)] || 0;
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
// 타입 이름은 lib/engineReasons.js의 `dmg_<key>` 키로 언어별로 갖고 있다.
// 여기서는 key만 들고 다니고, 문장을 만들 때 그 언어의 이름으로 바꾼다.
const DAMAGE_TYPES = [
  { key: 'projectile_explosion', re: /projectile explosion damage/i },
  { key: 'true_damage', re: /true damage/i },
  { key: 'charge_damage', re: /(full charge|charge) damage/i },
  { key: 'piercing_damage', re: /piercing damage/i },
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
          grants.push({ type: dt.key, scope });
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
        found.push({ caster, type: typeKey, receivers });
      }
    });
  });
  return found;
}

// ---------------------------------------------------------------------------
// 자유 슬롯 채우기용 시너지 판정 (2026-08-08 추가)
//
// 빈 자리를 티어 합만 보고 채우면, 고정 멤버와 아무 상호작용도 없는 캐릭터가 들어올 수 있다.
// 여기서는 "채워 넣은 캐릭터가 고정 멤버와 실제로 맞물리는가"를 셋으로 나눠 센다:
//   1) 스킬 원문으로 확인되는 데미지 타입 버프 관계 (어느 쪽이 주고 받든)
//   2) synergyNotes.synergyPairs에 등록된 검증된 페어
//   3) 팀 전체에 걸리는 의미 있는 아군 버프 보유 (특정 대상이 없어도 고정 멤버가 다 받는다)
//
// findSkillMechanicSynergies를 조합마다 통째로 부르면 스킬 원문 파싱이 수천 번 반복돼 느리다.
// 관계는 (시전자, 대상) 쌍마다 고정된 값이므로 쌍 단위로 캐시한다.
const DAMAGE_SYNERGY_CACHE = new Map();
function hasDamageTypeSynergy(caster, receiver) {
  if (!caster || !receiver || caster.id === receiver.id) return false;
  const key = `${caster.id}>${receiver.id}`;
  if (DAMAGE_SYNERGY_CACHE.has(key)) return DAMAGE_SYNERGY_CACHE.get(key);
  const grants = extractDamageTypeGrants(caster).filter((g) => g.scope);
  const ok = grants.some(
    (g) => grantAppliesToAlly(caster, g, receiver) && dealsDamageType(receiver, g.type)
  );
  DAMAGE_SYNERGY_CACHE.set(key, ok);
  return ok;
}

const SYNERGY_PAIR_SET = new Set(
  (synergyNotes.synergyPairs || [])
    .filter((p) => (p.members || []).length === 2)
    .map((p) => [...p.members].sort().join('|'))
);

// 두 캐릭터 사이의 상호작용 수. 어느 쪽이 버프를 주든 세고, 검증된 페어면 하나 더 센다.
function pairSynergyCount(a, b) {
  let n = 0;
  if (hasDamageTypeSynergy(a, b)) n += 1;
  if (hasDamageTypeSynergy(b, a)) n += 1;
  if (SYNERGY_PAIR_SET.has([a.title, b.title].sort().join('|'))) n += 1;
  return n;
}

// allyBuffStrength는 스킬 원문을 매번 파싱해서, 조합 탐색처럼 반복 호출되면 비싸다.
const ALLY_BUFF_CACHE = new Map();
function allyBuffStrengthCached(character) {
  const key = character?.id;
  if (key === undefined) return 0;
  if (ALLY_BUFF_CACHE.has(key)) return ALLY_BUFF_CACHE.get(key);
  const v = allyBuffStrength(character);
  ALLY_BUFF_CACHE.set(key, v);
  return v;
}

// ---------------------------------------------------------------------------
// 파트너 의존 캐릭터 판정 (2026-08-08 추가)
//
// prydwen 티어리스트는 일부 캐릭터에 partner(📣) 표시를 붙인다. 원문 정의:
//   "this unit can only shine (or improves dramatically) if a specific unit is in the team
//    or she is in specific teams"
// 즉 "이 캐릭터의 티어는 특정 동료가 함께 있는 상태를 전제로 매겨졌다"는 뜻이다. 문제는
// 표시가 '조건부'라는 사실만 알려줄 뿐 '누가 파트너인지'는 알려주지 않는다는 것.
//
// 그 짝은 우리가 이미 가진 조합 데이터에서 뽑는다. 단순 동시 등장 횟수를 세면 크라운·아니스:
// 스타처럼 아무 조합에나 들어가는 범용 캐릭터가 항상 1등이 되어 무의미하다. 그래서 조건부
// 확률을 쓴다 — "이 캐릭터가 나온 팀들 중 몇 %에 저 캐릭터가 같이 있었는가". 실제로 이렇게
// 계산하면 프리카→민트 100%, 티아→나가 100%, 아르카나↔이자벨 100%처럼 알려진 짝이 그대로 나온다.
//
// 표본이 적으면 100%가 아무 의미도 없으므로(등장 팀이 1~2개면 우연히 100%가 된다) 최소 등장
// 팀 수를 요구하고, 비율도 높게 잡아 '확실한 짝'만 남긴다. 조건을 못 채운 캐릭터는 점수를
// 깎지 않고 -- 티어를 얼마나 깎아야 하는지에 대한 근거 있는 숫자가 없다 -- 자유 슬롯을 채울 때
// 동점이면 뒤로 밀고, 사용자에게 조건을 밝힌다.
const PARTNER_MIN_TEAMS = 5;   // 이만큼은 등장해야 비율을 신뢰한다
const PARTNER_MIN_RATIO = 0.7; // 등장 팀의 70% 이상에 함께 나오면 '확실한 짝'

const DOMINANT_PARTNERS = (() => {
  const teams = [];
  (synergyNotes.archetypes || []).forEach((a) => {
    if ((a.members || []).length >= 3) teams.push(a.members);
  });
  (metaStats.campaignCompositions?.list || []).forEach((t) => teams.push(t.members || []));
  (metaStats.pvp?.topTeams || []).forEach((t) => teams.push(t.members || []));

  const result = new Map();
  characterDatabase.forEach((c) => {
    const tagged = (c.prydwenTags || []).includes('partner') ||
      (c.prydwenTagsTreasure || []).includes('partner');
    if (!tagged) return;
    const mine = teams.filter((t) => t.includes(c.title));
    if (mine.length < PARTNER_MIN_TEAMS) return;
    const count = new Map();
    mine.forEach((t) => t.forEach((x) => {
      if (x !== c.title) count.set(x, (count.get(x) || 0) + 1);
    }));
    const strong = [...count.entries()]
      .filter(([, v]) => v / mine.length >= PARTNER_MIN_RATIO)
      .sort((a, b) => b[1] - a[1])
      .map(([n, v]) => ({ title: n, ratio: v / mine.length }));
    if (strong.length) result.set(c.title, { partners: strong, teams: mine.length });
  });
  return result;
})();

// 이 캐릭터가 파트너 의존형인데 팀에 그 짝이 하나도 없는가.
function partnerConditionUnmet(character, members) {
  const req = DOMINANT_PARTNERS.get(character?.title);
  if (!req) return null;
  const present = req.partners.filter((p) => members.some((m) => m.title === p.title));
  return present.length ? null : req;
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
  // (부분일치 점수는 상수가 아니라 완성도 비례식이다 — 아래 archetypePartialPoints 참고.
  //  2026-08-25에 ARCHETYPE_PARTIAL_MATCH: 5를 없앴다. 자유 상수가 하나 줄었다.)
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

// 아키타입 부분일치의 점수 = **완전일치 점수 × 완성도**.
//
// ■ 부분일치는 무엇인가 (오해하기 쉽다)
//
//   채점 대상 팀은 항상 5명이 차 있다. 4/5 부분일치라는 건 "한 자리가 비었다"가 아니라
//   **그 자리를 다른 캐릭터로 바꿔 넣은 변형**이라는 뜻이다. 유저 지적 그대로다 —
//   "부분 일치도 어느 정도 완성된 조합이고 남은 칸은 사용자의 선택이 자유롭다."
//   그래서 부분일치는 깎아내릴 대상이 아니라 **완성도만큼 인정할** 근거다.
//
// ■ 왜 비례식인가 (2026-08-25, 세 번 고쳤다)
//
//   원래: `ARCHETYPE_PARTIAL_MATCH(5) × 일치인원`
//     (a) 4/5가 20점이라 완전일치(14)를 넘겼다 -> 완전일치 이름이 근거의 73.2%에서 사라짐
//     (b) 아키타입 크기를 무시했다. 1/2(완성도 50%)와 1/5(20%)가 똑같이 5점
//   1차 수정: 천장을 완전일치로 -> `min(5 × 인원, 14)`
//     (c) 3/5도 4/5도 14점으로 **뭉개졌다.** 게다가 4/5가 완전일치와 동점이라
//         "완전일치가 더 강하다"는 원래 목적도 절반만 달성했다
//   지금: `완전일치 × (일치인원 / 전체인원)`
//     - 등급이 살아난다        2.8 · 5.6 · 8.4 · 11.2 (5인 기준)
//     - 항상 완전일치 미만이다  (일치인원 < 전체인원이므로 수학적으로 보장)
//     - 아키타입 크기를 반영한다 1/2 = 7점 > 1/5 = 2.8점
//     - **자유 상수가 없다.** ARCHETYPE_PARTIAL_MATCH(5)라는 임의값이 사라졌다
//
//   실측 비교는 docs/engine.md 4-3에 있다. 세 안 모두 근거 문장 유지율은 94.3%로 같다
//   (그건 정렬이 결정하지 점수가 아니다). 차이는 등급 유지와 완전일치 미만 보장뿐이다.
//
// ⚠️ 검사 가능하도록 밖으로 뺐다. scripts/testEngineReasons.mjs가 불변식을 직접 확인한다 —
//    이 식을 되돌려도 근거 문장은 멀쩡하고 점수만 조용히 뒤집히므로 문장 검사로는 못 잡는다
//    (역테스트에서 실제로 놓쳤다).
export const ARCHETYPE_FULL_POINTS = WEIGHTS.ARCHETYPE_FULL_MATCH;
export function archetypePartialPoints(haveCount, needCount) {
  if (!needCount || haveCount >= needCount) return WEIGHTS.ARCHETYPE_FULL_MATCH;
  return WEIGHTS.ARCHETYPE_FULL_MATCH * (haveCount / needCount);
}

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

// 유연 버스트 캐릭터가 실제로 채울 수 있는 단계.
//
// `burstFlex`는 "단계가 고정이 아니다"라는 뜻일 뿐이고, **어느 단계까지 되는지는 캐릭터마다
// 다르다.** 레드 후드는 게임 표기가 Λ라 1·2·3 전부지만, 라피: 레드 후드는 본인 스킬 원문이
// Stage I과 Stage 3만 말한다. 근거가 없는 단계를 열어 주면 없는 조합이 성립해 버리므로
// `burstStages`에 적힌 것만 인정한다(없으면 보수적으로 셋 다 — 기존 동작).
function flexStagesOf(character) {
  const s = character?.burstStages;
  return Array.isArray(s) && s.length ? s.map(String) : ['1', '2', '3'];
}

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
  // 유연 버스트 멤버(레드 후드)는 낭비 판정에서 제외한다 — 같은 단계에 다른 캐릭터가 몰려도
  // 본인이 빈 단계로 옮겨 가면 되므로 "버스트를 못 쓰는 인원"이 아니다.
  const flexIds = new Set(members.filter((m) => m.burstFlex).map((m) => m.id));
  ['1', '2', '3'].forEach((burst) => {
    const group = members.filter((m) => String(m.burst) === burst && !flexIds.has(m.id));
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
  // 근거 문장을 어느 언어로 조립할지. 지정하지 않으면 한국어(기존 동작).
  const lang = opts.lang || 'ko';
  const R = engineText(lang);
  if (!members || members.length === 0) {
    return { totalScore: 0, valid: false, reasons: [R.no_members] };
  }
  const treasureIds = opts.treasureIds || new Set();
  // 솔로 레이드/보스전 전용: 이번에 상대할 보스의 약점 속성 (예: 'Iron', 'Wind', 'Water',
  // 'Electronic', 'Fire'). bossing/raid 모드에서만 의미가 있고, 지정하지 않으면 이 보정은 생략된다.
  const bossElement = opts.bossElement || null;

  const titles = members.map((m) => m.title);
  const reasons = [];
  let score = 0;

  // --- 하드 제약: 버스트 I/II/III 각 1명 이상 (mechanics.burstPhase) ---
  //
  // ⚠️ **버스트 단계가 고정이 아닌 캐릭터가 있다**(`burstFlex`). 레드 후드는 게임 내 표기가
  //    Λ라 1·2·3 어느 자리든 채운다. 우리 DB의 burst:"3"은 표시·정렬용 기본값일 뿐이다.
  //    이걸 반영하지 않아 **PvP 채택률 1위 조합(나유타·헬름·에밀리아·레드후드·스노우화이트:HA)이
  //    "버스트 1이 없다"며 통째로 탈락하고 있었다**(2026-08-21 실측: 실사용 조합 214건 중
  //    29건이 무효였고 그중 9건이 이 이유였다. 9건 전부 유연 버스트를 반영하면 성립한다).
  //
  //    판정 방법: 고정 버스트 멤버만으로 단계를 세고, 비어 있는 단계 수를 유연 멤버 수가
  //    메울 수 있으면 성립. 유연 멤버 하나가 한 단계를 맡는다.
  //    2026-09-01: **유연 멤버가 아무 단계나 채우는 것은 아니다.** 라피: 레드 후드는 본인
  //    스킬 원문이 Stage I과 Stage 3만 말한다(II는 근거가 없다). 그래서 캐릭터마다
  //    `burstStages`로 채울 수 있는 단계를 적고, 여기서는 "빈 단계마다 그 단계를 채울 수
  //    있는 유연 멤버를 하나씩 배정할 수 있는가"를 실제로 풀어 본다. 예전처럼
  //    `emptyStages.slice(flexMembers.length)`로 개수만 세면 II밖에 못 채우는 사람에게
  //    II를 맡기고 성립시켜 버린다.
  const flexMembers = members.filter((m) => m.burstFlex);
  const burstCounts = { 1: 0, 2: 0, 3: 0 };
  members.forEach((m) => {
    if (m.burstFlex) return;                       // 유연 멤버는 아래에서 빈 자리에 배정한다
    if (burstCounts[m.burst] !== undefined) burstCounts[m.burst] += 1;
  });
  const emptyStages = ['1', '2', '3'].filter((b) => burstCounts[b] === 0);
  // 빈 단계는 최대 3개, 유연 멤버도 실제로는 한둘이라 완전 탐색으로 충분하다.
  // 못 채우는 단계가 남으면 **그 단계를 그대로** 돌려준다 — 개수만 빼면
  // "II밖에 못 채우는 사람이 I을 메웠다"는 식으로 조용히 성립해 버린다.
  const bestCover = (stages, pool) => {
    if (!stages.length) return [];
    let best = [];
    for (let i = 0; i < pool.length; i += 1) {
      if (!flexStagesOf(pool[i]).includes(stages[0])) continue;
      const rest = bestCover(stages.slice(1), pool.filter((_, k) => k !== i));
      if (rest.length + 1 > best.length) best = [stages[0], ...rest];
    }
    const skip = bestCover(stages.slice(1), pool); // 이 단계는 포기하고 나머지를 최대한 채운다
    return skip.length > best.length ? skip : best;
  };
  const covered = new Set(bestCover(emptyStages, flexMembers));
  const missingBursts = emptyStages.filter((b) => !covered.has(b));
  const validBurstChain = missingBursts.length === 0;
  if (!validBurstChain) {
    reasons.push(R.burst_incomplete({ stages: missingBursts }));
  }

  // --- 스킬 메커니즘 기반 데미지 타입 시너지 (가장 먼저 배치: "왜 강한지"의 핵심 근거) ---
  const skillSynergies = findSkillMechanicSynergies(members);
  skillSynergies.forEach((syn) => {
    score += WEIGHTS.SKILL_MECHANIC_SYNERGY;
    reasons.push(R.skill_mechanic({
      caster: rName(syn.caster, lang),
      label: R['dmg_' + syn.type],
      receivers: syn.receivers.map((m) => rName(m, lang)),
    }));
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
    reasons.push(R.wasted({ names: wastedMembers.map((m) => rName(m, lang)) }));
  }

  // --- 실사용 픽률 등급 합산 (enikk.app) ---
  const realTierTotal = members.reduce((sum, m) => sum + realUsageTierScore(m, mode), 0);
  score += realTierTotal * WEIGHTS.REAL_USAGE_TIER_SUM;
  const sTierRealMembers = members.filter((m) => realUsageTierScore(m, mode) >= REAL_TIER_SCORE.S);
  if (sTierRealMembers.length > 0) {
    reasons.push(R.real_s_tier({ names: sTierRealMembers.map((m) => rName(m, lang)) }));
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
      reasons.push(R.element_usage_high({
        entries: highUsage.map((x) => R.usage_entry({ name: rName(x.m, lang), usage: x.usage })),
        element: bossElement,
        season: table.season,
        boss: table.boss,
      }));
    }
    const lowUsage = elementUsageMembers.filter((x) => x.usage < 10);
    if (lowUsage.length > 0) {
      reasons.push(R.element_usage_low({
        entries: lowUsage.map((x) => R.usage_entry({ name: rName(x.m, lang), usage: x.usage })),
        element: bossElement,
      }));
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
    list.map((n) => ((need || []).includes(n) ? n + R.treasure_suffix : n));

  // --- 아키타입 매칭 ---
  // 2026-08-07 수정: 매칭되는 아키타입을 전부 더하지 않고, 일단 후보로만 모아뒀다가
  // 점수가 큰 상위 ARCHETYPE_MATCH_CAP개만 실제 점수/근거에 반영한다. (다 같이 고쳐야지 —
  // findExactTeamMatch와 free-form AI 경로가 모두 이 scoreTeam()을 공유하므로 여기서 고치면
  // 두 경로 전부에 적용된다.)
  //
  // 2026-08-25 수정: **부분일치가 완전일치를 밀어내고 있었다.**
  //
  //   ARCHETYPE_PARTIAL_MATCH(5)는 아키타입이 2인 페어이던 시절에 잡은 값이고 주석에도
  //   "절반 수준의 보너스"라고 적혀 있다. 그런데 아키타입이 5인 조합으로 커지면서
  //   `5 × have.length`가 4명일 때 20점이 되어 완전일치(14)를 넘겼다. 캡이 3이라
  //   "X 조합의 일부가 있다" 세 줄이 슬롯을 다 먹고, 정작 **5명이 정확히 일치하는
  //   조합의 이름이 근거에서 통째로 사라졌다.**
  //
  //   실측(2026-08-25, 완전일치 아키타입 265건): 자기 조합 이름이 남은 비율 **26.8%**.
  //   나머지 73.2%는 부분일치 3개에 밀려 사라졌다.
  //
  //   유저 판단 — "완성된 조합이 아무래도 버프 연결성이 더 좋을 테니까." 즉 완전일치는
  //   부분일치보다 **항상 강한 근거**다. 그래서 두 가지를 고쳤다.
  //     (1) 정렬에서 완전일치를 항상 앞에 둔다   -> 근거 문장 26.8% → 94.3%
  //     (2) 부분일치 점수를 완성도 비례식으로    -> 점수 역전 제거 (archetypePartialPoints)
  //   점수까지 고치는 이유는 이 값이 커뮤니티 게시판의 "AI 점수" 배지로 사용자에게 그대로
  //   보이기 때문이다(app/combos/page.js). 문장만 고쳐서는 끝나지 않는다.
  //
  //   ⚠️ (2)의 1차 시도는 `min(5 × 인원, 14)`였는데, **3/5와 4/5가 둘 다 14점으로
  //      뭉개졌고 4/5는 완전일치와 동점**이 됐다. 유저 지적 — "부분 일치도 어느 정도
  //      완성된 조합이고 남은 칸은 사용자의 선택이 자유로운데, 부분조합도 충분히 좋을 수
  //      있다." 맞는 지적이라 완성도 비례식으로 다시 고쳤다. 자세한 내력은
  //      archetypePartialPoints의 주석에 있다.
  //
  //   실측 비교 — 이름 유지 / 점수 변화(평균·최악):
  //     고치기 전       26.8%  /   ±0
  //     정렬만          94.3%  /  -4.2 · -18
  //     정렬+비례(채택)  94.3%  /  -4.7 · -18
  //   추천 1위는 무작위 로스터 30개에서 **한 건도 바뀌지 않았다**(표시 점수는 tierTotal이라
  //   아키타입 점수가 순위에 관여하지 않는다).
  //
  //   남는 5.7%는 그 팀이 완전일치하는 아키타입이 3개(캡)를 넘는 경우다. 이때는 자기
  //   이름 대신 자매 변형의 이름이 나올 수 있지만 "알려진 조합이다"라는 사실은 전달된다.
  //
  // ⚠️ sourceCaveat는 완전일치 항목에 **같이 실어** 보낸다. 예전처럼 points:0으로 따로
  //    push하면 점수 정렬에서 맨 뒤로 밀려 캡에 잘린다 — 출처가 "주 용도가 다르다"고
  //    밝힌 경고가 조용히 사라지는 것이라, 지금 걸리는 자료가 1건뿐이어도 구조를 고친다.
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
        // 출처가 스스로 비권장이라 밝힌 조합은 아예 인정하지 않는다.
        // 2026-08-15: prydwen이 "Highly NOT recommended, just putting them here as a tribute
        // to the past"라고 적은 조합이 캠페인 추천 후보에 정상 등록돼 있었다. 출처가 쓰지
        // 말라고 한 것을 추천하는 것은 기능이 아니라 틀린 정보다.
        if (a.notRecommended) return;
        // 쓸 수는 있으나 **주 용도가 다르다**고 출처가 밝힌 경우: 제외하지 않고 고지한다.
        // "[조건 확인]" 접두사는 AI 프롬프트가 "반드시 설명에 포함하라"고 지시하는 표식이라
        // (app/api/ai-recommend/route.js), 이 문장을 붙이면 화면 설명까지 자동으로 따라온다.
        // 설계 원칙 2 — 조건을 밝히고 판단은 사용자에게 넘긴다.
        // 2026-09-01: "완전일치"의 정의가 엔진 안에서 두 개였다.
        //
        //   findExactTeamMatch  — members + flexSlots === 5 인 것만 후보로 인정 (360/483)
        //   여기(scoreTeam)     — 등록 멤버가 다 있으면 크기와 무관하게 full 취급
        //
        // 그래서 멤버가 5명이 아닌 아키타입 123개(1인 11 · 2인 20 · 3인 41 · 4인 51)가
        // "'X' 조합으로 알려진 구성입니다"를 달고 나갔다. 크라운 한 명만 있으면 티어 합으로
        // 조립한 5명에 그 문장이 붙는 식이다 — 나머지 4명은 그 근거와 아무 상관이 없다.
        // 실측: 무작위 로스터 40회 기준 10~30명 구간의 60~85%가 이 폴백 경로로 떨어지므로,
        // 하필 니케가 적어 근거가 가장 필요한 사용자가 가장 부풀려진 문장을 받고 있었다.
        //
        // 점수(ARCHETYPE_FULL_MATCH)는 건드리지 않는다 — 게시판 "AI 점수" 배지와 추천 순위가
        // 같이 움직이는 값이라 별도 실측이 필요하다(docs/open-items.md에 열어둠). 문장만
        // 사실에 맞춘다.
        const specSize = need.length + (a.flexSlots || []).length;
        const headline =
          specSize === 5
            ? R.archetype_full({
                name: localized(a, 'name', lang),
                note: localized(a, 'note', lang),
              })
            : R.archetype_core({
                name: localized(a, 'name', lang),
                have,
                count: need.length,
                rest: 5 - need.length,
                note: localized(a, 'note', lang),
              });
        archetypeMatches.push({
          points: WEIGHTS.ARCHETYPE_FULL_MATCH,
          full: true,
          reasons: [
            headline,
            ...(a.sourceCaveat
              ? [R.source_caveat({ text: localized(a, 'sourceCaveat', lang) })]
              : []),
          ],
        });
      } else if (have.length > 0) {
        const missing = need.filter((n) => !titles.includes(n));
        archetypeMatches.push({
          points: archetypePartialPoints(have.length, need.length),
          full: false,
          reasons: [R.archetype_partial({
            name: localized(a, 'name', lang),
            have,
            missing,
          })],
        });
      }
    });
  archetypeMatches
    // 완전일치를 항상 앞에 둔다. 그 다음에만 점수로 겨룬다.
    //
    // ⚠️ 지금의 비례식에서는 부분일치가 수학적으로 항상 완전일치 미만이라 **이 정렬이 없어도
    //    순서는 맞다**(역테스트에서 정렬만 빼봤더니 검사가 안 걸렸다). 그래도 남겨둔다 —
    //    "완전일치가 먼저"는 점수식과 **독립적인** 규칙이고, 나중에 누가 부분일치 점수를
    //    올리더라도 근거 문장만은 지켜준다. 이중 안전장치다.
    .sort((x, y) => (Number(y.full) - Number(x.full)) || (y.points - x.points))
    .slice(0, WEIGHTS.ARCHETYPE_MATCH_CAP)
    .forEach((m) => {
      score += m.points;
      reasons.push(...m.reasons);
    });

  // --- 시너지 페어 ---
  synergyNotes.synergyPairs.forEach((p) => {
    const have = p.members.filter((n) => titles.includes(n));
    if (have.length !== p.members.length) return;
    if (!treasureSatisfied(p.requiresTreasure)) return;
    score += WEIGHTS.SYNERGY_PAIR;
    reasons.push(R.synergy_pair({
      members: [withTreasureMark(p.members, p.requiresTreasure).join(' + ')],
      reason: localized(p, 'reason', lang),
    }));
  });

  // --- CDR 보유 여부 ---
  const cdrMembers = members.filter(providesCDR);
  if (cdrMembers.length > 0) {
    score += WEIGHTS.CDR_PRESENT;
    reasons.push(R.cdr_present({ names: cdrMembers.map((m) => rName(m, lang)) }));
  } else {
    score += WEIGHTS.CDR_MISSING_PENALTY;
    reasons.push(R.cdr_missing);
  }

  // --- 버스트 쿨타임 20초 캐릭터 ---
  const fastBurstMembers = members.filter((m) => (m.burst === '1' || m.burst === '2') && hasFastBurstCooldown(m));
  score += fastBurstMembers.length * WEIGHTS.FAST_BURST_CD;

  // --- 조건부 성능 캐릭터 안내 (2026-08-08 추가) ---
  //
  // prydwen 티어리스트는 캐릭터 아이콘에 "$ = 고투자 전제", "🌀 = 높은 수동 조작 필요" 같은
  // 표시를 달아둔다. 우리 티어 등급은 그 조건이 충족된 상태를 전제로 매겨진 값이라, 조건을
  // 못 갖춘 사용자에게는 등급만큼의 성능이 안 나온다.
  //
  // 유저 지적 — "추천을 받는 건 보통 초보 유저일 가능성이 큰데, 고투자가 선행돼야 좋은
  // 캐릭터를 그냥 추천하면 난감해진다". 실제로 이 표시가 붙은 아니스: 스파클링 서머와
  // 모더니아를 우리가 토템으로 등록해 아무 단서 없이 추천하고 있었다.
  //
  // 점수는 깎지 않는다. 사용자의 실제 투자 수준을 우리가 모르는 상태에서 감점하면, 이미
  // 키운 사람에게 오히려 틀린 추천을 하게 된다. 대신 조건을 밝혀서 판단은 사용자가 하게 한다.
  // ('limited'는 이미 보유한 캐릭터에게는 의미가 없으므로 조합 설명에서는 다루지 않는다)
  ['invest', 'expert'].forEach((tag) => {
    const hit = members.filter((m) => (m.prydwenTags || []).includes(tag));
    if (!hit.length) return;
    reasons.push(R.conditional_tag({
      names: hit.map((m) => rName(m, lang)),
      label: R[`tag_label_${tag}`],
      caveat: R[`tag_caveat_${tag}`],
    }));
  });

  // --- 파트너 조건 (2026-08-08 추가) ---
  // 짝이 함께 있으면 그 사실을 근거로 밝히고, 없으면 조건이 빠졌다고 알린다.
  members.forEach((m) => {
    const req = DOMINANT_PARTNERS.get(m.title);
    if (!req) return;
    const present = req.partners.filter((p) => members.some((x) => x.title === p.title));
    if (present.length) {
      reasons.push(R.partner_present({
        title: rName(m, lang),
        partners: present.map((p) => R.partner_ratio({
          name: p.title,
          pct: Math.round(p.ratio * 100),
        })),
      }));
    } else {
      reasons.push(R.partner_missing({
        title: rName(m, lang),
        teams: req.teams,
        partners: req.partners.map((p) => p.title),
      }));
    }
  });

  // --- 원소 다양성 ---
  const distinctElements = new Set(members.map((m) => normalizeElement(m.element)).filter(Boolean));
  score += (distinctElements.size - 1) * WEIGHTS.ELEMENT_DIVERSITY;

  // --- 카운터 정보 (PvP일 때만 참고 정보로 추가) ---
  if (mode === 'pvp') {
    synergyNotes.counters.forEach((c) => {
      if (titles.includes(c.unit)) {
        reasons.push(R.counter_info({ unit: c.unit, reason: localized(c, 'reason', lang) }));
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
          reasons.push(R.real_pvp_subset({
            combo, sourceLabel, wr: entry.wr, n: entry.n, adoption: entry.adoption,
          }));
        }
      });
    };
    addRealMatch(REAL_PAIR_INDEX, 2, WEIGHTS.REAL_PVP_PAIR_SCALE, R.label_pair);
    addRealMatch(REAL_TRIO_INDEX, 3, WEIGHTS.REAL_PVP_TRIO_SCALE, R.label_trio);
    addRealMatch(REAL_QUAD_INDEX, 4, WEIGHTS.REAL_PVP_QUAD_SCALE, R.label_quad);
    if (titles.length === 5) {
      const exact = REAL_TEAM_INDEX.get(titleSetKey(titles));
      if (exact) {
        score += wrBonus(exact.wr, WEIGHTS.REAL_PVP_TEAM_SCALE);
        reasons.push(R.real_pvp_exact({ wr: exact.wr, n: exact.n, adoption: exact.adoption }));
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
        reasons.push(R.real_campaign_exact({
          uses: exact.totalUses, pct: exact.pctOfClears, lang,
        }));
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
        reasons.push(R.real_campaign_partial({
          combo,
          missing: hit.missing,
          uses: hit.comp.totalUses,
          pct: hit.comp.pctOfClears,
          lang,
        }));
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
    // ⚠️ 이 블록은 **애장품을 실제로 장착한 경우에만** 돈다(위의 treasureIds 검사).
    //    그런데 treasureEffects.json의 원문은 "애장품을 장착하면 ~ 새로 생깁니다"처럼
    //    조건형으로 쓰여 있어서, 그대로 넘기면 설명을 쓰는 AI가 "헬름의 애장품이 있다면 ~"
    //    으로 받아써서 **보유 중인데 미보유처럼 읽힌다**(2026-08-13 유저 제보로 재현 확인).
    //    자료 원문은 건드리지 않고, 앞에 현재 상태를 못박아 붙인다.
    reasons.push(R.treasure_equipped({
      title: rName(m, lang),
      effect: localized(effect, 'treasureEffect', lang),
    }));
    (effect.synergyWith || []).forEach((sw) => {
      if (titles.includes(sw.target)) {
        score += sw.bonus || 0;
        reasons.push(R.treasure_synergy({
          title: rName(m, lang),
          target: sw.target,
          reason: localized(sw, 'reason', lang),
        }));
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
        ? R.treasure_gap_known({ title: rName(m, lang), base, withTreasure })
        : R.treasure_gap_unknown({ base });
      reasons.push(R.treasure_required({
        title: rName(m, lang),
        gap,
        note: localized(note, 'treasureNote', lang),
      }));
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
      .map((o) => rName(o, lang));
    // 2026-08-08 수정: "버스트를 쓰지 않아도 발동하는" 이라고 단정하던 문장을 고쳤다.
    // 유저 지적 — 마스트: 로망틱 메이드는 버스트를 아예 안 쓰는 게 아니라, 취기 스택이 3까지
    // 쌓이는 3번째 사이클에 버스트를 쓴다(커뮤니티에서 '크크마'라 부르는 로테이션).
    // 즉 "매 사이클 버스트 순번에 들어가지 않는다"는 맞지만 "버스트를 안 쓴다"는 틀리다.
    // 왜 낭비가 아닌지는 캐릭터마다 다르므로 totemNote에 맡긴다.
    reasons.push(R.totem_role({
      burst: m.burst,
      others,
      needed,
      title: rName(m, lang),
      note: localized(note, 'totemNote', lang),
    }));
  });
  // 2026-08-09 삭제: 여기 있던 두 번째 토템 설명 경로를 없앴습니다.
  //
  // 유저 지적 — **"토템은 토템으로도 쓸 수 있다는 뜻이지 토템으로만 써야 한다는 게 아니다."**
  // 예를 들어 드레이크는 샷건덱에서 딜러로 활약합니다.
  //
  // 옛 경로는 `같은 버스트 단계에 쿨 20초짜리 동료가 있는가`만 보고, 정작 **이 캐릭터가
  // 버스트 순번에서 밀렸는지를 확인하지 않았습니다.** 그래서 자기가 버스트를 돌리는
  // 쪽인데도 "매 사이클 버스트를 쓰지는 못하지만"이라고 설명했습니다.
  //
  // 실측(2026-08-09): 나유타(B2 쿨20) + 디젤(B2 쿨20) 조합에서 티어가 높은 나유타가 남고
  // 디젤이 밀리는데, 결과 안에 "Diesel은 낭비"와 "Nayuta는 버스트를 못 쓴다"가 **동시에**
  // 나왔습니다. 같은 문제가 생길 수 있는 토템은 루주 / 나가 / D: 킬러 와이프 / 나유타 /
  // 에이드: 에이전트 바니 5명(전부 쿨 20초)이었습니다.
  //
  // 위의 totemExempted 경로가 "실제로 버스트 순번에서 밀린 멤버"만 설명하므로 이 경로는
  // 필요 없습니다. 토템 설명은 **밀렸을 때만** 나와야 합니다.

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
  const lang = opts.lang || 'ko';
  const R = engineText(lang);
  const topN = opts.topN || 5;
  const treasureIds = opts.treasureIds || new Set();
  const bossElement = opts.bossElement || null;
  const tower = opts.tower || null;
  ownedCharacters = filterRosterByTower(ownedCharacters, tower);

  const buckets = { 1: [], 2: [], 3: [] };
  ownedCharacters.forEach((c) => {
    if (buckets[c.burst]) buckets[c.burst].push(c);
  });

  const missing = ['1', '2', '3'].filter((b) => buckets[b].length === 0);
  if (missing.length > 0) {
    return {
      teams: [],
      // 기업 타워는 제조사로 로스터가 잘리므로 "보유하지 않았다"는 표현이 사실과 다르다.
      // 보유는 하고 있는데 그 타워에 못 나가는 것이라, 문구를 나눠야 오해가 없다.
      error: tower
        ? R.tower_missing_burst({
            tower: R[`tower_${tower}`] || tower,
            stages: missing,
            pilgrim: tower === 'pilgrim',
          })
        : R.roster_missing_burst({ stages: missing }),
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
          const result = scoreTeam(members, mode, { treasureIds, bossElement, lang });
          candidateTeams.push({
            members: orderMembersForDisplay(members, mode, treasureIds).map((m) => ({ id: m.id, title: m.title, name_kr: m.name_kr, name_ja: m.name_ja || null, burst: m.burst, img: m.img || null })),
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
  // 2026-08-19 추가. 그전까지 "보스전은 5인 조합 단위 실사용 기록이 없다"고 적혀 있었는데
  // **틀린 결론이었다.** enikk 솔로레이드 시즌 페이지의 Teams 탭에 조합·사용 횟수가 그대로
  // 있다(시즌 39만 1,015팀). 화면 기본 탭에 안 보였을 뿐이다.
  // data/soloRaidTeams.json = 시즌 5개(원소 5종) × 사용 횟수 상위 25팀.
  bossing: 'soloraid',
  raid: 'soloraid',
  // 2026-08-20 추가. enikk 타워 > Compositions 탭에서 옮겼다(data/towerCompositions.json).
  // 지금은 Tribe 풀(제한 없음)만 있다. 기업 타워(elysion/missilis/tetra/pilgrim)는 풀을 더
  // 옮기면 자동으로 살아난다 — 없는 동안에는 후보가 비어 조용히 아키타입 갈래만 남는다.
  tribe_tower: 'tower',
};

export function findRealUsageTeamMatch(ownedCharacters, mode = 'campaign', opts = {}) {
  const lang = opts.lang || 'ko';
  const R = engineText(lang);
  const source = REAL_TEAM_SOURCE[mode];
  if (!source) return null;

  const treasureIds = opts.treasureIds || new Set();
  const bossElement = opts.bossElement || null;
  const excludeTitles = new Set(opts.excludeTitles || []);
  ownedCharacters = filterRosterByTower(ownedCharacters, opts.tower || null);
  const byTitle = new Map(ownedCharacters.map((c) => [c.title, c]));
  const ownedTitles = new Set(ownedCharacters.map((c) => c.title));

  // 캠페인은 "얼마나 많이 쓰였는가"(pctOfClears), PvP는 "얼마나 이겼는가"(승률),
  // 보스전은 "그 보스에서 몇 번 쓰였는가"(parses)를 기준으로 삼는다.
  //
  // ⚠️ 보스전은 **속성이 맞는 시즌만** 본다. 솔로레이드는 시즌마다 보스 약점 속성이 다르고,
  //    조합이 그 속성에 맞춰 짜이기 때문에 다른 시즌의 조합을 섞으면 근거가 아니라 잡음이 된다.
  //    (예: 작열 시즌의 모더니아 조합을 철갑 보스에 추천하면 안 된다)
  //    속성을 안 고른 경우에만 전 시즌을 본다 — 그때는 "어느 보스에서 쓰였는지"를 함께 밝힌다.
  const soloRaidEntries = () => {
    const seasons = (soloRaidTeams.seasons || []).filter(
      (s) => !bossElement || s.weakness === bossElement,
    );
    return seasons.flatMap((s) => (s.teams || []).map((t) => ({ e: { ...t, season: s }, rank: t.parses || 0 })));
  };
  // 타워는 **그 타워의 풀만** 본다. 기업 타워는 애초에 로스터가 그 기업으로 걸러지므로
  // 다른 풀의 조합은 어차피 매칭되지 않지만, 근거 문장이 엉뚱한 타워를 가리키면 안 된다.
  const towerEntries = () => {
    const want = opts.tower || null;
    const pool = (towerCompositions.pools || []).find((p) => (p.tower || null) === want);
    return (pool?.teams || []).map((t) => ({ e: { ...t, pool }, rank: t.uses || 0 }));
  };
  const entries =
    source === 'campaign'
      ? (metaStats.campaignCompositions?.list || []).map((e) => ({ e, rank: e.pctOfClears || 0 }))
      : source === 'soloraid'
        ? soloRaidEntries()
        : source === 'tower'
          ? towerEntries()
          : (metaStats.pvp?.topTeams || []).map((e) => ({ e, rank: e.wr || 0 }));

  let best = null;
  entries.forEach(({ e, rank }) => {
    const titles = e.members || [];
    if (titles.length !== 5 || new Set(titles).size !== 5) return;
    if (!titles.every((t) => ownedTitles.has(t))) return;
    if (titles.some((t) => excludeTitles.has(t))) return;

    const members = titles.map((t) => byTitle.get(t));
    const scored = scoreTeam(members, mode, { treasureIds, bossElement, lang });
    if (!scored.valid) return; // 버스트 I/II/III 조건을 못 갖추면 제외
    if (!best || rank > best.rank) best = { entry: e, rank, members, scored };
  });

  if (!best) return null;

  const e = best.entry;
  let headline;
  if (source === 'campaign') {
    headline = R.headline_campaign({ uses: e.totalUses, pct: e.pctOfClears, lang });
  } else if (source === 'soloraid') {
    // 표본 수는 "한 서버에서의 기록"이다(전 서버 합계가 아니다). 그 사정을 문장에 담는다.
    headline = R.headline_soloraid({
      raid: e.season.raid,
      boss: e.season.boss,
      parses: e.parses,
      maxDamage: e.maxDamage,
      avgDamage: e.avgDamage,
      lang,
    });
  } else if (source === 'tower') {
    headline = R.headline_tower({ uses: e.uses, pct: e.pctOfClears, floors: e.floors, lang });
  } else {
    headline = R.headline_pvp({ wr: e.wr, n: e.n, adoption: e.adoption });
  }

  // --- 애장품 공백 메우기 (2026-08-21) ---
  //
  // enikk 실사용 기록에는 **애장품(Favorite Item) 정보가 없다.** 멤버별 돌파/코어와 CP는
  // 화면에 있지만 그건 그 기록을 남긴 플레이어의 상태이지 조합의 필요 조건이 아니다.
  // 그래서 "이 조합이 애장품 보유자의 기록인지"는 출처만으로는 알 수 없다.
  //
  // 그런데 우리에겐 이미 근거가 있다 — characterInvestmentNotes의 treasureTiers는 애장품
  // 보유 시 실제 평가다(헬름 PvP A→SSS 처럼 최대 5등급까지 벌어진다). 실사용 조합 194건에
  // 이런 캐릭터가 헬름 34 · 프리바티 32 · 목단 28 · 미란다 14회로 실제 들어 있다.
  //
  // 그러니 없는 정보를 지어내지 말고 **모르는 것을 모른다고 밝힌다**(설계 원칙 2).
  //
  // ⚠️ scoreTeam은 이미 "애장품이 없어 공략의 S가 아니라 B로 계산했다"는 안내를 낸다.
  //    처음엔 여기서 티어 차이(B→S)를 다시 적었다가 **같은 말을 두 번 하는 꼴**이라 지웠다.
  //    이 경로에만 있는 사실은 하나다 — 출처가 애장품 보유 여부를 알려주지 않는다는 것.
  // 점수는 건드리지 않는다. 애장품을 체크한 사용자에겐 이미 scoreTeam이 상향 티어로 계산했고,
  // 안 한 사용자에게 감점하면 실제로 키운 사람에게 틀린 추천을 하게 된다(기존 방침과 동일).
  const tierKey = MODE_TO_TIER_KEY[mode] || 'story';
  const treasureGaps = best.members.map((m) => {
    if (treasureIds.has(m.id)) return null;            // 보유 → 이미 상향 티어로 채점됨
    const withTreasure = INVESTMENT_NOTE_BY_NAME.get(m.title)?.treasureTiers?.[tierKey];
    const base = m.tiers?.[tierKey];
    if (!withTreasure || !base || withTreasure === base) return null;
    return lang === 'ko' ? (m.name_kr || m.title) : rName(m, lang);
  }).filter(Boolean);
  const treasureReasons = [];
  if (treasureGaps.length) {
    // scoreTeam이 이미 "애장품이 없어 B로 계산했다"는 안내를 낸다. 그걸 되풀이하지 않고,
    // **이 경로에만 있는 사실**(출처에 애장품 정보가 없다)만 한 줄로 덧붙인다.
    treasureReasons.push(R.source_limit_treasure({ names: treasureGaps }));
  }


  return {
    members: orderMembersForDisplay(best.members, mode, treasureIds).map((m) => ({
      id: m.id, title: m.title, name_kr: m.name_kr, name_ja: m.name_ja || null, burst: m.burst, img: m.img || null,
    })),
    // 표시 점수는 다른 경로와 동일하게 티어 합을 쓴다(경로마다 점수 의미가 달라지면 혼란).
    totalScore: best.scored.tierTotal,
    reasons: [headline, ...best.scored.reasons, ...treasureReasons],
    realUsage: source === 'campaign'
      ? { kind: 'campaign', totalUses: e.totalUses, pctOfClears: e.pctOfClears }
      : source === 'soloraid'
        ? { kind: 'soloraid', parses: e.parses, raid: e.season.raid, boss: e.season.boss, weakness: e.season.weakness }
        : source === 'tower'
          ? { kind: 'tower', uses: e.uses, pctOfClears: e.pctOfClears, pool: e.pool.pool }
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
  const lang = opts.lang || 'ko';
  const R = engineText(lang);
  const treasureIds = opts.treasureIds || new Set();
  const bossElement = opts.bossElement || null;
  const excludeTitles = new Set(opts.excludeTitles || []);
  ownedCharacters = filterRosterByTower(ownedCharacters, opts.tower || null);
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
  //   "flex"          -> 버프/유틸 담당 자리
  // 이미 고정 멤버로 들어간 캐릭터는 후보에서 제외한다.
  //
  // 2026-08-08 수정: flex에만 아무 조건이 없어서 사실상 '아무나'였다. 유저 지적 —
  // "각 칸의 용도에 맞는 조건으로 최고 티어를 넣어야 한다. B3면 3버스트 중 최고,
  //  FLEX면 버프류 중 최고." prydwen 조합에서 이 자리는 실제로 버퍼/토템이 들어가는 곳이다.
  // 그래서 flex는 '전 아군에게 의미 있는 버프를 주는 캐릭터'로 좁힌다(196명 중 74명).
  // 다만 로스터가 좁아 버퍼가 하나도 없으면 조합 자체가 성립 불가가 되어버리므로,
  // 그때는 조건을 풀어 아무나 채운다 — 자리를 못 채워 추천이 사라지는 쪽이 더 나쁘다.
  const slotCandidates = (slot, used) => {
    const pool = ownedCharacters.filter(
      (c) => !used.has(c.title) && !excludeTitles.has(c.title)
    );
    const m = String(slot).match(/^B([123])/);
    let filtered = m ? pool.filter((c) => String(c.burst) === m[1]) : pool;
    if (/-CDR$/i.test(String(slot))) filtered = filtered.filter(providesCDR);
    if (/^flex$/i.test(String(slot))) {
      const buffers = filtered.filter((c) => allyBuffStrengthCached(c) >= MEANINGFUL_ALLY_BUFF);
      if (buffers.length) filtered = buffers;
    }
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
  // 채우는 기준의 변천(같은 실수를 반복하지 않기 위해 기록):
  //
  // (1) 2026-08-07 이전: "개인 티어가 가장 높은 캐릭터". 슬롯 조건이 B1/B2/B3/CDR뿐이라
  //     flex는 사실상 아무나였고, 낭비 여부를 안 봐서 God Comp #2에서 레드후드(SSS)를 골라
  //     35점을 만들었다(모더니아를 넣으면 41점).
  // (2) 2026-08-07: "넣었을 때 tierTotal이 얼마나 오르는가"(= 낭비 반영 기여도)로 변경.
  //     팀 점수는 좋아졌지만, 낭비 판정이 0점 아니면 전부라 '버스트 못 쓰는 SSS'와
  //     '버스트 못 쓰는 D'를 같게 취급해 저티어가 자주 뽑혔다(무작위 133조합 중 260슬롯).
  // (3) 2026-08-08(현재): 유저 지시 — "각 칸의 용도에 맞는 조건으로 최고 티어를 넣어야 한다.
  //     B3면 3버스트 중 최고, FLEX면 버프류 중 최고." 즉 걸러내기는 슬롯 조건이 하고,
  //     그 안에서는 티어 순으로 고른다. 티어가 높다는 건 범용성이 높다는 뜻이고, 조합을
  //     찾아보는 사람은 대개 니케 풀이 좁아 지금뿐 아니라 나중까지 쓸 캐릭터가 중요하다.
  //     그래서 flex에 버퍼 조건을 붙이고(slotCandidates 참고), 정렬 1순위를 티어로 되돌렸다.
  //     기여도는 동점일 때의 판단 근거로만 남는다.
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
        .map((c) => ({ c, t: tierScore(c, mode, treasureIds), v: teamTierTotal([...base, c]) }))
        // 슬롯 조건을 이미 통과한 후보들이므로, 그 안에서는 티어가 높은 순이 우선이다.
        .sort((a, z) => (z.t - a.t) || (z.v - a.v))
        .map((x) => x.c)
    );

    // 시너지 점수는 조합마다 다시 계산하면 스킬 원문 파싱이 수천 번 반복돼 느려진다(실측 14배).
    // 값은 (후보, 고정 멤버) 또는 (후보, 후보) 쌍마다 고정이므로 처음 볼 때만 계산하고 캐시한다.
    // 후보 풀 전체를 미리 계산하지는 않는다 — 풀이 수십 명이라 대부분은 탐색에 쓰이지도 않는다.
    const selfCache = new Map();
    const selfScore = (c) => {
      if (selfCache.has(c.title)) return selfCache.get(c.title);
      let n = base.reduce((sum, f) => sum + pairSynergyCount(c, f), 0);
      if (allyBuffStrengthCached(c) >= MEANINGFUL_ALLY_BUFF) n += 1; // 팀 전체에 걸리는 버프
      // 파트너 의존 캐릭터는 그 짝이 고정 멤버에 있으면 크게 우대하고, 없으면 감점한다.
      // 빈 자리에 "특정 동료가 있어야 빛나는 캐릭터"를 그 동료 없이 넣는 건 그 자체로 잘못된
      // 채움이다. (고정 멤버 기준으로만 판단하므로 후보끼리의 조합과 무관하게 값이 고정된다)
      const req = DOMINANT_PARTNERS.get(c.title);
      if (req) n += req.partners.some((p) => base.some((f) => f.title === p.title)) ? 2 : -2;
      selfCache.set(c.title, n);
      return n;
    };
    const pairCache = new Map();
    const pairScore = (x, y) => {
      const k = x.title < y.title ? `${x.title}|${y.title}` : `${y.title}|${x.title}`;
      if (pairCache.has(k)) return pairCache.get(k);
      const n = pairSynergyCount(x, y);
      pairCache.set(k, n);
      return n;
    };
    const synergyOf = (picked) => picked.reduce(
      (sum, c, i) => sum + selfScore(c) +
        picked.slice(i + 1).reduce((s2, d) => s2 + pairScore(c, d), 0),
      0
    );

    // 슬롯 조합 전체를 시도해 최선의 구성을 고른다. 비교 순서:
    //   1) 채워 넣은 캐릭터들의 티어 합  — 슬롯 조건은 이미 통과했으므로 그 안에서는 티어가 기준
    //   2) 팀 tierTotal(낭비 반영)       — 티어가 같으면 실제로 버스트를 돌릴 수 있는 배치를 선호
    //   3) 고정 멤버와의 상호작용 수      — 그것도 같으면 맞물리는 쪽
    // 상호작용을 점수로 환산할 근거 있는 가중치가 없어서, 근거 없는 숫자를 만들기보다
    // 순위 비교에만 쓴다.
    const search = (pools) => {
      let best = null;
      let bestT = -Infinity;
      let bestV = -Infinity;
      let bestS = -Infinity;
      const usedTitles = new Set(fixed);
      const acc = [];
      const rec = (i) => {
        if (i === pools.length) {
          const t = acc.reduce((s2, c) => s2 + tierScore(c, mode, treasureIds), 0);
          const v = teamTierTotal([...base, ...acc]);
          const s = synergyOf(acc);
          if (t > bestT ||
              (t === bestT && v > bestV) ||
              (t === bestT && v === bestV && s > bestS)) {
            bestT = t; bestV = v; bestS = s; best = [...acc];
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
    // 출처가 스스로 비권장이라 밝힌 조합은 완전일치 후보에서도 뺀다(위 scoreTeam과 같은 이유).
    if (a.notRecommended) return false;
    return true;
  });

  let best = null;
  candidates.forEach((a) => {
    const filled = fillTeam(a);
    if (!filled) return;
    const members = filled.members;
    const scored = scoreTeam(members, mode, { treasureIds, bossElement, lang });
    if (!scored.valid) return;
    // scoreTeam()이 이미 낭비 인원을 제외하고 계산한 tierTotal을 그대로 후보 비교 기준으로
    // 쓴다 — 아키타입 개수와 무관하게 안정적이고, 같은 버스트 단계 낭비 인원도 반영된다.
    const tierSum = scored.tierTotal;
    // 비교용 점수에서만 빈칸 수만큼 차감한다(FLEX_SLOT_PENALTY 주석 참고).
    // tierSum 자체는 그대로 남겨 화면 표시 점수로 쓴다.
    const cmpScore = tierSum - FLEX_SLOT_PENALTY * filled.filledCount;
    // 차감 후에도 동점이면 자유 슬롯을 덜 채운 쪽(= prydwen이 더 구체적으로 지정한 조합)을 택한다.
    if (!best || cmpScore > best.cmpScore ||
        (cmpScore === best.cmpScore && filled.filledCount < best.filledCount)) {
      best = { archetype: a, members, scored, tierSum, cmpScore, filledCount: filled.filledCount };
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
      R.flex_slots({
        fixed: [...fixedTitles],
        slots: best.archetype.flexSlots,
        filled: filledTitles,
      })
    );
  }

  return {
    members: orderMembersForDisplay(best.members, mode, treasureIds).map((m) => ({ id: m.id, title: m.title, name_kr: m.name_kr, name_ja: m.name_ja || null, burst: m.burst, img: m.img || null })),
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
