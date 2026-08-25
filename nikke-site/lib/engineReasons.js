// lib/synergyEngine.js가 만드는 "근거 문장"의 3개국어 표.
//
// ■ 왜 lib/i18n.js가 아니라 여기인가
//
//   lib/i18n.js는 **화면 문구** 사전이고 모든 페이지가 들고 다닌다. 근거 문장은 40개나
//   되는 데다 추천/게시판 두 화면에서만 쓰이므로, UI 사전에 섞으면 사전이 40% 커진다.
//   대신 이 파일은 lib/synergyEngine.js만 import한다(엔진은 이미 그 두 화면에만 실린다).
//
// ■ 왜 문장을 엔진에서 떼어냈는가 (2026-08-25)
//
//   근거 문장은 원래 엔진 안에 한국어로 박혀 있었고, 그래서 화면은 `lang === 'ko'`일
//   때만 근거를 그렸다(영어·일본어에서는 통째로 숨김). 문장 안에 데이터 파일의 한국어
//   원문까지 들어가서 "코드만 번역해도 절반이 한국어로 남는다"는 게 이유였다.
//   데이터 쪽(조합 483 · 투자 노트 241 · 페어/카운터/애장품 37)을 전부 번역해 그 전제가
//   사라졌으므로, 코드 쪽 문장도 여기로 옮기고 화면 가드를 걷어냈다.
//
// ⚠️ 세 언어의 **키 집합이 완전히 같아야 한다.** 하나만 빠뜨리면 그 언어에서 문장이
//    `undefined`가 되는데 화면에는 아무 에러도 안 뜬다(설계 원칙 3 "조용한 누락").
//    scripts/testI18n.mjs가 키 집합 일치와 "엔진이 쓰는 키가 실제로 있는지"를 검사한다.
//
// ⚠️ 한국어 문장은 **가드가 있던 시절과 글자 그대로 같아야 한다.** 지금까지 한국어
//    사용자가 보던 문장이고, AI 프롬프트에도 그대로 들어간다. 옮기면서 다듬지 않았다.

// ⚠️ 확장자를 붙인다. scripts/testI18n.mjs가 이 파일을 **순수 Node ESM으로** import해서
//    키 집합을 검사하는데, 확장자 없는 상대 경로는 Node에서 ERR_MODULE_NOT_FOUND가 난다
//    (webpack/Next는 알아서 붙여주므로 개발 중에는 아무 증상이 없다).
import { dateLocale } from './i18n.js';

// 숫자 천단위 구분. 로케일 태그는 lib/i18n.js 한 곳에서만 정의한다
// (scripts/testI18n.mjs가 로케일 하드코딩을 막는다).
const num = (n, lang) => Number(n || 0).toLocaleString(dateLocale(lang));

// ⚠️ `?? ''`로 감싸지 않는다. 호출부가 인자를 빠뜨리면 문장에 `undefined`가 그대로 박혀야
//    scripts/testEngineReasons.mjs가 잡을 수 있다. 빈 문자열로 삼켜버리면 "가 쿨타임 감소를
//    제공해…"처럼 주어가 사라진 문장이 조용히 나간다(역테스트에서 실제로 놓쳤다).
const join = (list) => (Array.isArray(list) ? list.join(', ') : String(list));

const KO = {
  // --- scoreTeam ---
  no_members: '조합원이 없습니다.',
  burst_incomplete: ({ stages }) =>
    `버스트 ${join(stages)} 단계 캐릭터가 없어 풀버스트(전체 버스트)에 도달할 수 없습니다. ` +
    `이 조합은 자동전투 효율이 크게 떨어집니다.`,
  skill_mechanic: ({ caster, label, receivers }) =>
    `[스킬 근거] ${caster}의 스킬에 '${label} ▲' 버프 효과가 있고, ${join(receivers)}의 ` +
    `공격은 스킬 문구상 ${label}로 분류되어 있어 이 버프를 그대로 받습니다.`,
  wasted: ({ names }) =>
    `⚠️ ${join(names)}는(은) 같은 버스트 단계를 다른 캐릭터가 ` +
    `이미 쿨타임 기준으로 충분히 커버하고 있어 실제로 버스트를 발동할 기회가 거의 없고, 상시 ` +
    `버프/유틸리티로 기여하는 토템 역할도 아니라서 이 조합에서는 사실상 자리를 낭비하고 있습니다. ` +
    `이 자리를 다른 버스트 단계 보강이나 다른 캐릭터로 바꾸는 것을 추천합니다.`,
  real_s_tier: ({ names }) =>
    `[실사용 데이터] ${join(names)}는(은) enikk.app 실제 플레이어 ` +
    `기록에서도 이 모드 S등급 픽률을 보이는 검증된 채용 캐릭터입니다.`,
  element_usage_high: ({ entries, element, season, boss }) =>
    `[실전 기록] ${join(entries)}는(은) ${element} ` +
    `약점 보스(시즌${season} '${boss}' 기준) 상대 실사용률이 매우 높은 픽입니다. (출처: enikk.app)`,
  element_usage_low: ({ entries, element }) =>
    `[실전 기록] ${join(entries)}는(은) ${element} ` +
    `속성이지만 실제로는 이 약점 보스전에 잘 채용되지 않는 편입니다. (출처: enikk.app)`,
  usage_entry: ({ name, usage }) => `${name}(${usage}%)`,
  treasure_suffix: '(애장품)',
  archetype_full: ({ name, note }) => `'${name}' 조합으로 알려진 구성입니다. ${note}`,
  source_caveat: ({ text }) => `[조건 확인] ${text}`,
  archetype_partial: ({ name, have, missing }) =>
    `'${name}' 조합의 일부(${join(have)})가 포함되어 있습니다. ` +
    `${join(missing)}를(을) 보유하면 이 조합의 완성도가 더 올라갑니다.`,
  synergy_pair: ({ members, reason }) => `${join(members)} 페어 시너지: ${reason}`,
  cdr_present: ({ names }) => `${join(names)}가 쿨타임 감소를 제공해 풀버스트 순환이 빨라집니다.`,
  cdr_missing: '쿨타임 감소(CDR) 제공 캐릭터가 없어 풀버스트 진입 빈도가 낮을 수 있습니다.',
  tag_label_invest: '충분한 투자(스킬 레벨/오버로드 등)가 갖춰졌을 때 제 성능이 나오는 캐릭터',
  tag_caveat_invest: '아직 육성이 덜 됐다면 등급만큼의 성능이 나오지 않습니다. 다른 캐릭터를 먼저 키우는 편이 나을 수 있습니다.',
  tag_label_expert: '수동 조작 숙련이 있어야 제 성능이 나오는 캐릭터',
  tag_caveat_expert: '오토 전투 위주로 플레이한다면 기대만큼의 결과가 안 나올 수 있습니다.',
  conditional_tag: ({ names, label, caveat }) =>
    `[조건 확인] ${join(names)}은(는) ${label}입니다. ` +
    `이 조합의 티어 평가는 그 조건이 갖춰진 상태를 기준으로 매겨진 값입니다 — ${caveat} ` +
    `(출처: prydwen.gg 티어리스트 특수 표시)`,
  partner_ratio: ({ name, pct }) => `${name}(함께 쓰인 비율 ${pct}%)`,
  partner_present: ({ title, partners }) =>
    `${title}은(는) 특정 동료가 있어야 제 성능이 나오는 캐릭터인데, 이 조합에는 ` +
    `${join(partners)}이(가) ` +
    `있어 조건이 충족됩니다.`,
  partner_missing: ({ title, teams, partners }) =>
    `[조건 확인] ${title}은(는) 특정 동료가 있어야 제 성능이 나오는 캐릭터입니다 ` +
    `(prydwen.gg 티어리스트 표시). 실제 조합 ${teams}건을 보면 거의 항상 ` +
    `${partners.join(' 또는 ')}와(과) 함께 쓰이는데 이 조합에는 없어, ` +
    `티어 등급만큼의 성능이 안 나올 수 있습니다.`,
  counter_info: ({ unit, reason }) => `${unit} 보유: ${reason} (상대 조합에 따라 카운터로 활용 가능)`,
  label_pair: '페어',
  label_trio: '트리오',
  label_quad: '4인 코어',
  real_pvp_subset: ({ combo, sourceLabel, wr, n, adoption }) =>
    `[실전 기록] ${combo.join(' + ')} (${sourceLabel}) 조합은 챔피언 아레나 실제 대전에서 ` +
    `승률 ${wr}%(${n}전, 채택률 ${adoption}%)를 기록했습니다. (출처: enikk.app)`,
  real_pvp_exact: ({ wr, n, adoption }) =>
    `[실전 기록] 이 5인 조합은 챔피언 아레나에서 실제로 승률 ${wr}%(${n}전, ` +
    `채택률 ${adoption}%)로 기록된 완전 일치 구성입니다. (출처: enikk.app)`,
  real_campaign_exact: ({ uses, pct, lang }) =>
    `[실전 기록] 이 5인 조합은 enikk.app 캠페인 클리어 기록에서 실제로 ${num(uses, lang)}회 ` +
    `사용되어 분석된 전체 클리어의 ${pct}%를 차지하는, 플레이어들이 가장 많이 쓰는 캠페인 조합 ` +
    `중 하나입니다. (출처: enikk.app)`,
  real_campaign_partial: ({ combo, missing, uses, pct, lang }) =>
    `[실전 기록] ${join(combo)}는(은) enikk.app에서 ${missing}와(과) 함께 쓰였을 때 ` +
    `가장 많이 기록된 캠페인 조합(${num(uses, lang)}회, 전체의 ${pct}%)의 ` +
    `핵심 4인입니다. ${missing}를(을) 보유하면 이 실전 검증 조합을 완성할 수 있습니다. (출처: enikk.app)`,
  treasure_equipped: ({ title, effect }) =>
    `${title}는(은) 애장품을 장착한 상태입니다(가정이 아니라 현재 보유). ` +
    `장착 효과: ${effect}`,
  treasure_synergy: ({ title, target, reason }) => `${title}(애장품 장착 중) + ${target} 궁합: ${reason}`,
  treasure_gap_known: ({ title, base, withTreasure }) =>
    ` 지금은 애장품이 없어 공략의 ${withTreasure} 평가가 아니라 ${base} 성능으로 계산했습니다. ` +
    `이 조합에서 ${title}의 기여는 ${base} 수준까지로 보고 판단해야 합니다.`,
  treasure_gap_unknown: ({ base }) => ` 이 조합에서는 애장품 없는 기본 티어(${base}) 기준으로 계산했습니다.`,
  treasure_required: ({ title, gap, note }) =>
    `[투자 참고] ${title}는(은) 공략 기준 애장품(Treasure) 의존도가 높은 캐릭터인데 애장품을 ` +
    `장착하지 않은 상태입니다.${gap} ${note}`,
  totem_role: ({ burst, others, needed, title, note }) =>
    `[토템 활용] 버스트${burst} 단계는 ${join(others)}가 돌리면 매 사이클 커버되므로 ` +
    `(쿨타임 기준 ${needed}명이면 충분), ${title}는(은) 매 사이클 버스트 순번에는 들어가지 않습니다. ` +
    `그래도 이 자리는 낭비가 아닙니다. ${note}`,

  // --- recommendTeams ---
  tower_missing_burst: ({ tower, stages, pilgrim }) =>
    `${tower} 타워에 출전할 수 있는 버스트 ${join(stages)} 캐릭터가 없어 ` +
    `풀버스트 조합을 만들 수 없습니다. 기업 타워는 해당 제조사 니케만 출전할 수 있습니다` +
    `${pilgrim ? '(오버스펙 니케 포함)' : ''}.`,
  roster_missing_burst: ({ stages }) =>
    `버스트 ${join(stages)} 캐릭터를 보유하고 있지 않아 완전한 풀버스트 조합을 만들 수 없습니다. ` +
    `해당 버스트 단계의 캐릭터를 육성하는 것을 추천합니다.`,

  // --- findRealUsageTeamMatch ---
  headline_campaign: ({ uses, pct, lang }) =>
    `[실전 기록] 이 5인 조합은 enikk.app 캠페인 클리어 기록에서 실제로 ` +
    `${num(uses, lang)}회 사용되어 분석된 전체 클리어의 ${pct}%를 ` +
    `차지합니다. 플레이어들이 실제로 가장 많이 쓰는 조합이라 시너지가 이미 검증된 구성입니다.`,
  headline_soloraid: ({ raid, boss, parses, maxDamage, avgDamage, lang }) =>
    `[실전 기록] 이 5인 조합은 enikk.app 솔로 레이드 시즌 ${raid}` +
    `(${boss}) 기록에서 ${num(parses, lang)}회 사용됐습니다. ` +
    `최고 ${maxDamage} / 평균 ${avgDamage}의 데미지 기록이 남아 있는 구성입니다.`,
  headline_tower: ({ uses, pct, floors, lang }) =>
    `[실전 기록] 이 5인 조합은 enikk.app 타워 클리어 기록에서 ` +
    `${num(uses, lang)}회 사용되어 분석된 전체 클리어의 ${pct}%를 차지합니다. ` +
    `${num(floors, lang)}개 층에서 관측된 구성입니다.`,
  headline_pvp: ({ wr, n, adoption }) =>
    `[실전 기록] 이 5인 조합은 챔피언 아레나 실제 대전에서 승률 ${wr}%(${n}전, ` +
    `채택률 ${adoption}%)를 기록한 구성입니다. 실제로 이긴 기록이라 시너지가 검증된 조합입니다.`,
  source_limit_treasure: ({ names }) =>
    '[출처 한계] 이 조합은 enikk.app의 실제 사용 기록이지만 그 기록에는 애장품 정보가 없습니다. ' +
    `위 애장품 안내에 해당하는 ${join(names)}을(를) 이 기록의 주인이 애장품과 함께 ` +
    '썼는지는 알 수 없습니다 — 많이 쓰인다는 사실이 애장품 없이도 된다는 뜻은 아닙니다.',

  // --- findExactTeamMatch ---
  flex_slots: ({ fixed, slots, filled }) =>
    `[자유 슬롯] 이 조합은 원래 ${join(fixed)}만 고정이고 나머지 ` +
    `${join(slots)} 자리는 비어 있는 구성입니다. ` +
    `보유 캐릭터 중 조건에 맞고 이 모드 티어가 가장 높은 ${join(filled)}로 채웠습니다. ` +
    `이 자리는 같은 조건을 만족하는 다른 캐릭터로 바꿔도 조합이 성립합니다.`,

  // --- 기업 타워 이름 ---
  tower_elysion: '엘리시온',
  tower_missilis: '미실리스',
  tower_tetra: '테트라',
  tower_pilgrim: '필그림/오버스펙',

  // --- 스킬 메커니즘 데미지 타입 이름 ---
  dmg_projectile_explosion: '발사체 폭발 데미지',
  dmg_true_damage: '고정(트루) 데미지',
  dmg_charge_damage: '차지 데미지',
  dmg_piercing_damage: '관통 데미지',
};

const EN = {
  no_members: 'This team has no members.',
  burst_incomplete: ({ stages }) =>
    `There is no character for Burst stage ${join(stages)}, so this team cannot reach Full Burst. ` +
    `Its auto-battle efficiency drops sharply.`,
  skill_mechanic: ({ caster, label, receivers }) =>
    `[Skill evidence] ${caster}'s skill carries a '${label} up' buff, and the attacks of ${join(receivers)} ` +
    `are classified as ${label} in their own skill text, so they receive that buff directly.`,
  wasted: ({ names }) =>
    `⚠️ ${join(names)} share a burst stage that another character already covers well enough on cooldown, ` +
    `so they will almost never get to fire their burst, and they are not totems contributing a permanent ` +
    `buff or utility either — in this team they are effectively wasting a slot. ` +
    `Consider swapping that slot for another burst stage or a different character.`,
  real_s_tier: ({ names }) =>
    `[Real usage data] ${join(names)} also show S-grade pick rates for this mode in enikk.app's actual ` +
    `player records — proven picks that people really field.`,
  element_usage_high: ({ entries, element, season, boss }) =>
    `[Field record] ${join(entries)} are very heavily used against ${element}-weak bosses ` +
    `(as of season ${season}, '${boss}'). (Source: enikk.app)`,
  element_usage_low: ({ entries, element }) =>
    `[Field record] ${join(entries)} are ${element} element, but in practice they are rarely fielded ` +
    `against this weakness boss. (Source: enikk.app)`,
  usage_entry: ({ name, usage }) => `${name} (${usage}%)`,
  treasure_suffix: ' (Treasure)',
  archetype_full: ({ name, note }) => `This is the composition known as '${name}'. ${note}`,
  source_caveat: ({ text }) => `[Check the conditions] ${text}`,
  archetype_partial: ({ name, have, missing }) =>
    `Part of the '${name}' composition (${join(have)}) is present here. ` +
    `Getting ${join(missing)} would complete it.`,
  synergy_pair: ({ members, reason }) => `${join(members)} pair synergy: ${reason}`,
  cdr_present: ({ names }) => `${join(names)} provide cooldown reduction, so the Full Burst rotation comes around faster.`,
  cdr_missing: 'No character here provides cooldown reduction (CDR), so you may enter Full Burst less often.',
  tag_label_invest: 'a character who only performs once enough investment (skill levels, overload, and so on) is in place',
  tag_caveat_invest: 'If she is not built up yet, she will not perform at the level her grade suggests. You may be better off raising a different character first.',
  tag_label_expert: 'a character who only performs with skilled manual control',
  tag_caveat_expert: 'If you play mostly on auto, the result may fall short of what you expect.',
  conditional_tag: ({ names, label, caveat }) =>
    `[Check the conditions] ${join(names)} is ${label}. ` +
    `This team's tier rating is a value assigned assuming that condition is met — ${caveat} ` +
    `(Source: prydwen.gg tier list special markers)`,
  partner_ratio: ({ name, pct }) => `${name} (used together ${pct}% of the time)`,
  partner_present: ({ title, partners }) =>
    `${title} only performs when a specific teammate is present, and this team has ` +
    `${join(partners)}, ` +
    `so the condition is satisfied.`,
  partner_missing: ({ title, teams, partners }) =>
    `[Check the conditions] ${title} only performs when a specific teammate is present ` +
    `(marked on the prydwen.gg tier list). Across ${teams} real team records she is almost always used with ` +
    `${partners.join(' or ')}, and this team has none of them, so she may not perform at the level her tier suggests.`,
  counter_info: ({ unit, reason }) => `You have ${unit}: ${reason} (usable as a counter depending on the opposing team)`,
  label_pair: 'pair',
  label_trio: 'trio',
  label_quad: '4-unit core',
  real_pvp_subset: ({ combo, sourceLabel, wr, n, adoption }) =>
    `[Field record] The ${combo.join(' + ')} (${sourceLabel}) combination recorded a ` +
    `${wr}% win rate in real Champion Arena matches (${n} matches, ${adoption}% adoption). (Source: enikk.app)`,
  real_pvp_exact: ({ wr, n, adoption }) =>
    `[Field record] This exact five-unit team is recorded in Champion Arena with a ${wr}% win rate ` +
    `(${n} matches, ${adoption}% adoption). (Source: enikk.app)`,
  real_campaign_exact: ({ uses, pct, lang }) =>
    `[Field record] This five-unit team appears ${num(uses, lang)} times in enikk.app's campaign clear ` +
    `records, accounting for ${pct}% of all analysed clears — one of the campaign teams players use most. ` +
    `(Source: enikk.app)`,
  real_campaign_partial: ({ combo, missing, uses, pct, lang }) =>
    `[Field record] ${join(combo)} are the core four of the most-recorded campaign team when paired with ` +
    `${missing} on enikk.app (${num(uses, lang)} uses, ${pct}% of all clears). ` +
    `Getting ${missing} would complete that field-proven team. (Source: enikk.app)`,
  treasure_equipped: ({ title, effect }) =>
    `${title} has her Treasure equipped (this is your current roster, not an assumption). ` +
    `Equipped effect: ${effect}`,
  treasure_synergy: ({ title, target, reason }) => `${title} (Treasure equipped) + ${target} fit: ${reason}`,
  treasure_gap_known: ({ title, base, withTreasure }) =>
    ` Without the Treasure she is calculated at ${base} performance rather than the guides' ${withTreasure} rating. ` +
    `Judge ${title}'s contribution to this team as capped around ${base}.`,
  treasure_gap_unknown: ({ base }) => ` This team is calculated on her base tier without the Treasure (${base}).`,
  treasure_required: ({ title, gap, note }) =>
    `[Investment note] Guides rate ${title} as heavily dependent on her Treasure, and you do not have it ` +
    `equipped.${gap} ${note}`,
  totem_role: ({ burst, others, needed, title, note }) =>
    `[Totem use] Burst stage ${burst} is covered every cycle by ${join(others)} ` +
    `(${needed} is enough on cooldown), so ${title} does not enter the burst order every cycle. ` +
    `Even so, this slot is not wasted. ${note}`,

  tower_missing_burst: ({ tower, stages, pilgrim }) =>
    `You have no Burst ${join(stages)} character eligible for the ${tower} tower, so a Full Burst team ` +
    `cannot be formed. Corporation towers only admit Nikkes from that manufacturer` +
    `${pilgrim ? ' (Overspec Nikkes included)' : ''}.`,
  roster_missing_burst: ({ stages }) =>
    `You do not own a Burst ${join(stages)} character, so a complete Full Burst team cannot be formed. ` +
    `Consider raising a character of that burst stage.`,

  headline_campaign: ({ uses, pct, lang }) =>
    `[Field record] This five-unit team appears ${num(uses, lang)} times in enikk.app's campaign clear ` +
    `records, accounting for ${pct}% of all analysed clears. It is the team players actually use most, ` +
    `so its synergy is already proven.`,
  headline_soloraid: ({ raid, boss, parses, maxDamage, avgDamage, lang }) =>
    `[Field record] This five-unit team was used ${num(parses, lang)} times in enikk.app's Solo Raid ` +
    `season ${raid} (${boss}) records, with a best of ${maxDamage} and an average of ${avgDamage} damage.`,
  headline_tower: ({ uses, pct, floors, lang }) =>
    `[Field record] This five-unit team appears ${num(uses, lang)} times in enikk.app's tower clear records, ` +
    `accounting for ${pct}% of all analysed clears. It was observed across ${num(floors, lang)} floors.`,
  headline_pvp: ({ wr, n, adoption }) =>
    `[Field record] This five-unit team recorded a ${wr}% win rate in real Champion Arena matches ` +
    `(${n} matches, ${adoption}% adoption). These are actual wins, so the synergy is proven.`,
  source_limit_treasure: ({ names }) =>
    '[Source limitation] This team comes from enikk.app usage records, and those records carry no Treasure ' +
    `information. There is no way to tell whether the player behind this record ran ${join(names)} — the ` +
    'characters covered by the Treasure notes above — with their Treasures. Being widely used does not mean ' +
    'it works without them.',

  flex_slots: ({ fixed, slots, filled }) =>
    `[Open slots] In the original composition only ${join(fixed)} are fixed; the ` +
    `${join(slots)} slots are left open. ` +
    `They were filled with ${join(filled)} — the highest-tier characters for this mode among the ones you own ` +
    `that meet each slot's condition. Any other character meeting the same condition also works here.`,

  tower_elysion: 'Elysion',
  tower_missilis: 'Missilis',
  tower_tetra: 'Tetra',
  tower_pilgrim: 'Pilgrim/Overspec',

  dmg_projectile_explosion: 'projectile explosion damage',
  dmg_true_damage: 'true damage',
  dmg_charge_damage: 'charge damage',
  dmg_piercing_damage: 'piercing damage',
};

const JA = {
  no_members: '編成メンバーがいません。',
  burst_incomplete: ({ stages }) =>
    `バースト${join(stages)}段階のキャラクターがいないため、フルバーストに到達できません。` +
    `この編成はオート戦闘の効率が大きく落ちます。`,
  skill_mechanic: ({ caster, label, receivers }) =>
    `［スキル根拠］${caster}のスキルに「${label}▲」のバフ効果があり、${join(receivers)}の` +
    `攻撃はスキル文面上${label}に分類されているため、このバフをそのまま受けられます。`,
  wasted: ({ names }) =>
    `⚠️ ${join(names)}は、同じバースト段階を他のキャラクターがすでにクールタイム的に十分カバーしており、` +
    `実際にバーストを発動する機会がほとんどありません。常時バフやユーティリティで貢献するトーテム役でもないため、` +
    `この編成では事実上その枠を無駄にしています。` +
    `この枠は別のバースト段階の補強か、他のキャラクターに変えることをおすすめします。`,
  real_s_tier: ({ names }) =>
    `［実使用データ］${join(names)}は、enikk.appの実際のプレイヤー記録でもこのモードのS等級の採用率を示す、` +
    `実績のある採用キャラクターです。`,
  element_usage_high: ({ entries, element, season, boss }) =>
    `［実戦記録］${join(entries)}は、${element}弱点のボス（シーズン${season}「${boss}」基準）に対する` +
    `実使用率が非常に高いピックです。（出典：enikk.app）`,
  element_usage_low: ({ entries, element }) =>
    `［実戦記録］${join(entries)}は${element}属性ですが、実際にはこの弱点ボス戦であまり採用されていません。` +
    `（出典：enikk.app）`,
  usage_entry: ({ name, usage }) => `${name}（${usage}%）`,
  treasure_suffix: '（宝もの）',
  archetype_full: ({ name, note }) => `「${name}」として知られる構成です。${note}`,
  source_caveat: ({ text }) => `［条件の確認］${text}`,
  archetype_partial: ({ name, have, missing }) =>
    `「${name}」編成の一部（${join(have)}）が含まれています。` +
    `${join(missing)}を所持していれば、この編成の完成度がさらに上がります。`,
  synergy_pair: ({ members, reason }) => `${join(members)} ペアシナジー：${reason}`,
  cdr_present: ({ names }) => `${join(names)}がクールタイム短縮を提供するため、フルバーストの循環が速くなります。`,
  cdr_missing: 'クールタイム短縮（CDR）を提供するキャラクターがいないため、フルバーストに入る頻度が低くなる可能性があります。',
  tag_label_invest: '十分な投資（スキルレベル・オーバーロードなど）が整って初めて本来の性能が出るキャラクター',
  tag_caveat_invest: 'まだ育成が足りていない場合、等級どおりの性能は出ません。他のキャラクターを先に育てたほうがよいかもしれません。',
  tag_label_expert: '手動操作の習熟があって初めて本来の性能が出るキャラクター',
  tag_caveat_expert: 'オート戦闘中心でプレイするなら、期待どおりの結果にならない可能性があります。',
  conditional_tag: ({ names, label, caveat }) =>
    `［条件の確認］${join(names)}は${label}です。` +
    `この編成のティア評価は、その条件が整った状態を基準に付けられた値です — ${caveat}` +
    `（出典：prydwen.gg ティアリストの特殊表示）`,
  partner_ratio: ({ name, pct }) => `${name}（同時採用率${pct}%）`,
  partner_present: ({ title, partners }) =>
    `${title}は特定の相方がいて初めて本来の性能が出るキャラクターですが、この編成には` +
    `${join(partners)}がいるため、条件を満たしています。`,
  partner_missing: ({ title, teams, partners }) =>
    `［条件の確認］${title}は特定の相方がいて初めて本来の性能が出るキャラクターです` +
    `（prydwen.gg ティアリストの表示）。実際の編成${teams}件を見るとほぼ常に` +
    `${partners.join('または')}と一緒に使われていますが、この編成にはいないため、` +
    `ティア等級どおりの性能が出ない可能性があります。`,
  counter_info: ({ unit, reason }) => `${unit}を所持：${reason}（相手の編成によってはカウンターとして活用可能）`,
  label_pair: 'ペア',
  label_trio: 'トリオ',
  label_quad: '4人コア',
  real_pvp_subset: ({ combo, sourceLabel, wr, n, adoption }) =>
    `［実戦記録］${combo.join(' + ')}（${sourceLabel}）の組み合わせは、チャンピオンアリーナの実際の対戦で` +
    `勝率${wr}%（${n}戦、採用率${adoption}%）を記録しました。（出典：enikk.app）`,
  real_pvp_exact: ({ wr, n, adoption }) =>
    `［実戦記録］この5人編成は、チャンピオンアリーナで実際に勝率${wr}%（${n}戦、採用率${adoption}%）を` +
    `記録した完全一致の構成です。（出典：enikk.app）`,
  real_campaign_exact: ({ uses, pct, lang }) =>
    `［実戦記録］この5人編成は、enikk.appのキャンペーンクリア記録で実際に${num(uses, lang)}回使用され、` +
    `分析対象の全クリアの${pct}%を占める、プレイヤーが最もよく使うキャンペーン編成の一つです。` +
    `（出典：enikk.app）`,
  real_campaign_partial: ({ combo, missing, uses, pct, lang }) =>
    `［実戦記録］${join(combo)}は、enikk.appで${missing}と一緒に使われたときに最も多く記録された` +
    `キャンペーン編成（${num(uses, lang)}回、全体の${pct}%）の中核4人です。` +
    `${missing}を所持すれば、この実戦で検証された編成を完成させられます。（出典：enikk.app）`,
  treasure_equipped: ({ title, effect }) =>
    `${title}は宝ものを装備した状態です（仮定ではなく現在の所持状況）。` +
    `装備効果：${effect}`,
  treasure_synergy: ({ title, target, reason }) => `${title}（宝もの装備中）＋${target}の相性：${reason}`,
  treasure_gap_known: ({ title, base, withTreasure }) =>
    ` 今は宝ものがないため、攻略記事の${withTreasure}評価ではなく${base}の性能として計算しています。` +
    `この編成での${title}の貢献は${base}程度までと見て判断すべきです。`,
  treasure_gap_unknown: ({ base }) => ` この編成では、宝ものなしの基本ティア（${base}）を基準に計算しています。`,
  treasure_required: ({ title, gap, note }) =>
    `［投資の参考］${title}は攻略記事の基準では宝もの（Treasure）への依存度が高いキャラクターですが、` +
    `宝ものを装備していない状態です。${gap} ${note}`,
  totem_role: ({ burst, others, needed, title, note }) =>
    `［トーテム活用］バースト${burst}段階は${join(others)}が回せば毎サイクルカバーされるため` +
    `（クールタイム基準で${needed}人いれば十分）、${title}は毎サイクルのバースト順には入りません。` +
    `それでもこの枠は無駄ではありません。${note}`,

  tower_missing_burst: ({ tower, stages, pilgrim }) =>
    `${tower}タワーに出撃できるバースト${join(stages)}のキャラクターがいないため、` +
    `フルバースト編成を組めません。企業タワーには該当メーカーのニケしか出撃できません` +
    `${pilgrim ? '（オーバースペックのニケを含む）' : ''}。`,
  roster_missing_burst: ({ stages }) =>
    `バースト${join(stages)}のキャラクターを所持していないため、完全なフルバースト編成を組めません。` +
    `そのバースト段階のキャラクターを育成することをおすすめします。`,

  headline_campaign: ({ uses, pct, lang }) =>
    `［実戦記録］この5人編成は、enikk.appのキャンペーンクリア記録で実際に${num(uses, lang)}回使用され、` +
    `分析対象の全クリアの${pct}%を占めます。プレイヤーが実際に最もよく使う編成なので、` +
    `シナジーはすでに検証済みの構成です。`,
  headline_soloraid: ({ raid, boss, parses, maxDamage, avgDamage, lang }) =>
    `［実戦記録］この5人編成は、enikk.appのソロレイド シーズン${raid}（${boss}）の記録で` +
    `${num(parses, lang)}回使用されました。最高${maxDamage}／平均${avgDamage}のダメージ記録が残る構成です。`,
  headline_tower: ({ uses, pct, floors, lang }) =>
    `［実戦記録］この5人編成は、enikk.appのタワークリア記録で${num(uses, lang)}回使用され、` +
    `分析対象の全クリアの${pct}%を占めます。${num(floors, lang)}の階層で観測された構成です。`,
  headline_pvp: ({ wr, n, adoption }) =>
    `［実戦記録］この5人編成は、チャンピオンアリーナの実際の対戦で勝率${wr}%（${n}戦、採用率${adoption}%）を` +
    `記録した構成です。実際に勝った記録なので、シナジーが検証された編成です。`,
  source_limit_treasure: ({ names }) =>
    '［出典の限界］この編成はenikk.appの実際の使用記録ですが、その記録には宝ものの情報がありません。' +
    `上の宝ものの案内に該当する${join(names)}を、この記録の主が宝ものと一緒に使っていたかどうかは分かりません` +
    ' — よく使われているという事実は、宝ものなしでも通用するという意味ではありません。',

  flex_slots: ({ fixed, slots, filled }) =>
    `［自由枠］この編成はもともと${join(fixed)}だけが固定で、残りの${join(slots)}の枠は空いている構成です。` +
    `所持キャラクターのうち条件に合い、このモードのティアが最も高い${join(filled)}で埋めました。` +
    `この枠は同じ条件を満たす他のキャラクターに変えても編成は成立します。`,

  tower_elysion: 'エリシオン',
  tower_missilis: 'ミシリス',
  tower_tetra: 'テトラ',
  tower_pilgrim: 'ピルグリム／オーバースペック',

  dmg_projectile_explosion: '発射体の爆発ダメージ',
  dmg_true_damage: '固定（トゥルー）ダメージ',
  dmg_charge_damage: 'チャージダメージ',
  dmg_piercing_damage: '貫通ダメージ',
};

export const ENGINE_REASONS = { ko: KO, en: EN, ja: JA };

// 엔진에서 쓰는 진입점. 모르는 언어는 한국어로 떨어뜨린다(문장이 사라지는 것보다 낫다).
export function engineText(lang) {
  return ENGINE_REASONS[lang] || ENGINE_REASONS.ko;
}
