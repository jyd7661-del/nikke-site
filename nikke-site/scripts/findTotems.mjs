/**
 * findTotems.mjs — 실사용 데이터로 '누락된 토템'을 찾아낸다.
 *
 * 실행: node scripts/findTotems.mjs
 *
 * ---------------------------------------------------------------------------
 * 왜 이 스크립트가 필요한가
 *
 * '토템'은 버스트를 쓰지 않는 자리에 놓는 니케다(인벤 2025-07-24 정의). 우리 엔진은
 * characterInvestmentNotes.json의 totemRole 목록에 있는 캐릭터만 낭비 판정에서 면제하는데,
 * 그 목록을 사람이 손으로 채우다 보니 두 가지 방식으로 틀렸다:
 *
 *   1) 근거 없이 넣기 — 레드 후드를 "버스트 단계가 all"이라는 잘못된 전제로 등록했던 사고.
 *   2) 있어야 할 걸 빼먹기 — 마스트: 로망틱 메이드가 캠페인 실사용 조합 20건 중 14건에
 *      들어가는데, 매번 크라운(버스트2·쿨20초)과 같은 버스트2라서 엔진은 마스트를 계속
 *      '낭비'로 깎고 있었다. 유저가 픽률을 보고 지적해서야 발견했다.
 *
 * 2번은 사람 눈으로 196명을 훑어서는 놓칠 수밖에 없다. 하지만 데이터로는 쉽게 잡힌다:
 *
 *   실제 유저들이 높은 픽률로 굴리는 조합에서 우리 엔진이 '이 사람은 버스트를 못 써서
 *   자리를 낭비하고 있다'고 판정한다면, 둘 중 하나다. 유저 수만 명이 틀렸거나,
 *   우리 totemRole 목록이 틀렸거나. 후자일 가능성이 압도적으로 높다.
 *
 * 그래서 이 스크립트는 metaStats.json의 실사용 조합(enikk.app 집계)을 전부 돌려서,
 * '버스트 순번에서 밀리는데도 반복해서 기용되는' 캐릭터를 사용량 가중으로 집계한다.
 * 스킬 원문을 읽어 뒷받침 근거(비버스트 팀 버프 유무)도 함께 붙인다.
 *
 * 이 스크립트는 데이터를 고치지 않는다. 후보만 보고하고, 등록 여부는 사람이 판단한다.
 * (totemRole은 추천 점수를 직접 바꾸는 값이라 자동 반영은 위험하다)
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const cdbRaw = read('characterDatabase.json');
const cdb = Array.isArray(cdbRaw) ? cdbRaw : cdbRaw.characters;
const notes = read('characterInvestmentNotes.json');
const metaStats = read('metaStats.json');
const synergyNotes = read('synergyNotes.json');

const byTitle = new Map(cdb.map((c) => [c.title, c]));
const registered = new Set(notes.characters.filter((n) => n.totemRole).map((n) => n.name));

// ---------------------------------------------------------------------------
// 버스트 순번 계산 — lib/synergyEngine.js의 findWastedBurstMembers와 같은 규칙이다.
// (엔진은 Next.js 전용 import 문법을 써서 여기서 그대로 불러올 수 없어 규칙만 옮겼다.
//  두 곳의 상수가 어긋나면 이 스크립트의 결론도 어긋나므로, 엔진 쪽 FAST_BURST_CD /
//  ALTERNATE_BURST_CD를 고치면 여기도 같이 고칠 것.)
const FAST_BURST_CD = 20;
const ALTERNATE_BURST_CD = 45;
const TIER_SCORE = { SSS: 9, SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };
const MODE_TO_TIER_KEY = { campaign: 'story', pvp: 'pvp', raid: 'bossing' };

function burstCd(c) {
  const sk = c.skills || [];
  const b = sk[sk.length - 1];
  const n = Number(b?.cd);
  return Number.isFinite(n) ? n : null;
}

// 이 조합에서 '버스트 순번에 들지 못하는' 인원을 돌려준다. totemRole 면제는 적용하지 않는다
// — 지금 찾으려는 것이 바로 '면제됐어야 하는데 목록에 없는 사람'이기 때문이다.
function surplusMembers(members, mode) {
  const key = MODE_TO_TIER_KEY[mode] || 'story';
  const out = [];
  ['1', '2', '3'].forEach((burst) => {
    const group = members.filter((m) => String(m.burst) === burst);
    if (group.length <= 1) return;
    const withCd = group.map((m) => ({ m, cd: burstCd(m) }));
    if (withCd.some((x) => x.cd === null)) return;
    const sorted = [...withCd].sort(
      (a, b) => (a.cd - b.cd) ||
        ((TIER_SCORE[b.m.tiers?.[key]] || 0) - (TIER_SCORE[a.m.tiers?.[key]] || 0))
    );
    let needed;
    if (sorted[0].cd <= FAST_BURST_CD) needed = 1;
    else if (sorted.length >= 2 && sorted[1].cd <= ALTERNATE_BURST_CD) needed = 2;
    else needed = Math.min(sorted.length, 2);
    sorted.slice(needed).forEach(({ m }) => out.push({ member: m, coveredBy: sorted.slice(0, needed).map((x) => x.m.title) }));
  });
  return out;
}

// ---------------------------------------------------------------------------
// 스킬 원문 뒷받침: 비버스트 스킬로 전 아군에게 공격 계열 버프를 주는가?
// (실사용 신호가 1차 근거이고, 이건 "그럴 만한 스킬을 실제로 갖고 있는지" 확인용이다)
const OFFENSIVE = /(ATK|Attack Damage|Attack damage|Reloading Speed|Reload Speed|Critical Rate|Critical Damage|Cooldown of Burst Skill|Damage Taken|Damage taken|Hit Rate|Core Damage|Pierce Damage|Charge Damage)\s*▲/;
const OWN_BURST = /using Burst Skill|casting Burst Skill/i;
// 효과 대상절에 "자신이 ○○ 상태일 때"라는 단서가 붙는 경우. 그 상태를 본인 버스트로 얻는
// 캐릭터가 있어서(아르카나의 Wheel of Fortune) 토템 근거로는 쓸 수 없다. 상태의 출처까지
// 기계적으로 추적하기는 어려우므로, 이런 조건부 버프는 아예 근거에서 뺀다 -- 근거를
// 실제보다 세게 잡아 잘못 등록하는 쪽이 놓치는 쪽보다 위험하기 때문이다.
const SELF_STATE_COND = /if self is in|while self is in|when self is in/i;

function nonBurstAllyBuffs(c) {
  const hits = [];
  (c.skills || []).slice(0, -1).forEach((s) => {
    let trig = null;
    let scope = null;
    (s.desc || '').split(/(?<=\.)\s+/).map((x) => x.trim()).forEach((cl) => {
      const a = cl.match(/^Activates\s+(.+?)\.?$/i);
      if (a) { trig = a[1]; scope = null; return; }
      const b = cl.match(/^Affects\s+(.+?)\.?$/i);
      if (b) { scope = b[1]; return; }
      if (!scope || !/all .*allies|all allies/i.test(scope)) return;
      if (!OFFENSIVE.test(cl)) return;
      if (trig && OWN_BURST.test(trig)) return;        // 본인 버스트가 발동 조건
      if (SELF_STATE_COND.test(scope)) return;         // 본인 상태가 전제인 조건부 버프
      if (trig && SELF_STATE_COND.test(trig)) return;
      hits.push(cl);
    });
  });
  return hits;
}

// ---------------------------------------------------------------------------
// 실사용 조합 수집. 출처마다 신뢰도가 달라 가중치를 나눈다.
const samples = [];

(metaStats.campaignCompositions?.list || []).forEach((t) => {
  samples.push({
    src: 'enikk 캠페인 실사용',
    mode: 'campaign',
    members: t.members,
    weight: t.pctOfClears || 0,   // 전체 클리어 중 이 조합이 차지한 비율(%)
    label: `${(t.pctOfClears || 0).toFixed(2)}% / ${t.totalUses || 0}회`,
  });
});

(metaStats.pvp?.topTeams || []).forEach((t) => {
  samples.push({
    src: 'enikk PvP 상위 조합',
    mode: 'pvp',
    members: t.members,
    weight: t.adoption || 0,      // 채택률(%)
    label: `채택률 ${(t.adoption || 0).toFixed(1)}% / 승률 ${t.wr || '-'}%`,
  });
});

// 큐레이션된 조합(prydwen/enikk 공략)은 실사용 통계는 아니지만, 5인이 확정된 조합은
// "이 구성으로 굴리라"는 권장이므로 약한 가중치로 함께 본다.
(synergyNotes.archetypes || []).forEach((a) => {
  const ms = a.members || [];
  if (ms.length !== 5 || (a.flexSlots || []).length) return;
  samples.push({
    src: '공략 권장 조합',
    mode: a.mode === 'pvp' ? 'pvp' : (a.mode === 'raid' || a.mode === 'bossing' ? 'raid' : 'campaign'),
    members: ms,
    weight: 0.5,
    label: a.name,
  });
});

// ---------------------------------------------------------------------------
// title -> { pve, pvp, curated, examples[] }
const agg = new Map();
let skipped = 0;

samples.forEach((s) => {
  const members = s.members.map((t) => byTitle.get(t)).filter(Boolean);
  if (members.length !== s.members.length) { skipped += 1; return; }
  surplusMembers(members, s.mode).forEach(({ member, coveredBy }) => {
    const cur = agg.get(member.title) || { pve: 0, pvp: 0, curated: 0, examples: [] };
    if (s.src === '공략 권장 조합') cur.curated += 1;
    else if (s.mode === 'pvp') cur.pvp += s.weight;
    else cur.pve += s.weight;
    if (cur.examples.length < 3) {
      cur.examples.push(`${s.src}: ${s.label} — ${coveredBy.join('/')}이(가) 버스트${member.burst}를 커버`);
    }
    agg.set(member.title, cur);
  });
});

const rows = [...agg.entries()].map(([title, v]) => {
  const c = byTitle.get(title);
  return {
    title,
    kr: c.name_kr,
    burst: c.burst,
    cd: burstCd(c),
    tiers: [c.tiers?.story, c.tiers?.bossing, c.tiers?.pvp].join('/'),
    registered: registered.has(title),
    buffs: nonBurstAllyBuffs(c),
    ...v,
  };
});

const bar = '─'.repeat(72);
console.log(`\n${bar}\n실사용 데이터 기반 토템 후보 검출\n${bar}`);
console.log(`실사용/권장 조합 ${samples.length}건 분석 (이름을 DB에서 못 찾아 건너뛴 조합 ${skipped}건)`);
console.log(`현재 등록된 토템 ${registered.size}명`);

// 등급을 나누는 이유:
// - PvE(캠페인/보스) 실사용은 "20초마다 풀버스트를 돌린다"는 우리 낭비 판정의 전제와 같은
//   맥락이라 신호가 그대로 유효하다.
// - PvP는 전제가 다르다. 선공 한 방에 승부가 갈리는 판이 많아 '버스트 순환'이 무의미하고,
//   목단/노이즈/라푼젤처럼 도발·힐·부활 같은 생존 유틸로 뽑히는 경우가 대부분이다.
//   그래서 PvP만의 신호는 토템 근거로 보지 않고 참고로만 분리해 보여준다.
// - 스킬 원문에 '비버스트 전 아군 공격 버프'가 없으면, 버스트를 안 써도 되는 이유가
//   버프가 아니라 다른 데 있다는 뜻이므로 1군에서 뺀다.
const tierA = rows.filter((r) => !r.registered && r.pve > 0 && r.buffs.length)
  .sort((a, z) => z.pve - a.pve);
const tierB = rows.filter((r) => !r.registered && r.pve === 0 && r.curated >= 3 && r.buffs.length)
  .sort((a, z) => z.curated - a.curated);
const pvpOnly = rows.filter((r) => !r.registered && r.pve === 0 && r.pvp > 0)
  .sort((a, z) => z.pvp - a.pvp);

const show = (r, metric) => {
  console.log(`■ ${r.title} (${r.kr})  B${r.burst} 쿨${r.cd}초  티어 ${r.tiers}   ${metric}`);
  r.examples.forEach((e) => console.log(`      · ${e}`));
  r.buffs.slice(0, 3).forEach((b) => console.log(`      → 비버스트 아군 버프: ${b}`));
  console.log('');
};

console.log(`\n【1군】 PvE 실사용 조합에서 잉여로 기용 + 비버스트 아군 버프 보유 — ${tierA.length}명`);
console.log('  (실제 유저가 높은 픽률로 굴리는데 우리 엔진은 자리를 낭비한다고 판정 중. 등록 유력)\n');
tierA.length ? tierA.forEach((r) => show(r, `PvE 가중치 ${r.pve.toFixed(2)}`)) : console.log('  없음\n');

console.log(`【2군】 PvE 실사용 기록은 없으나 공략 권장 조합 3개 이상에서 잉여 + 스킬 근거 — ${tierB.length}명`);
console.log('  (근거는 공략뿐이라 1군보다 약함. 사람이 판단할 것)\n');
tierB.length ? tierB.forEach((r) => show(r, `권장 조합 ${r.curated}건`)) : console.log('  없음\n');

console.log(`【참고】 PvP 조합에서만 잉여로 잡힌 캐릭터 — ${pvpOnly.length}명`);
console.log('  PvP는 버스트 순환 전제가 달라(선공 한 방 승부, 도발/힐/부활 유틸 기용) 토템 근거로 쓰지 않는다.');
console.log(`  ${pvpOnly.slice(0, 12).map((r) => `${r.kr}(${r.pvp.toFixed(1)})`).join(', ')}${pvpOnly.length > 12 ? ' 외' : ''}\n`);

const known = rows.filter((r) => r.registered).sort((a, z) => (z.pve + z.curated) - (a.pve + a.curated));
console.log(`${bar}\n[검증] 이미 등록된 토템 중 실사용/권장 조합에서도 잉여로 잡힌 사람 (등록이 옳았다는 방증)`);
known.forEach((r) => {
  console.log(`   ${r.title} — PvE 가중치 ${r.pve.toFixed(2)} / 권장 조합 ${r.curated}건 / PvP ${r.pvp.toFixed(1)}`);
});

// 반대 방향: 등록돼 있는데 실사용 근거가 전혀 없는 경우도 알려준다.
const neverSurplus = [...registered].filter((t) => !agg.has(t));
if (neverSurplus.length) {
  console.log(`\n[참고] 등록돼 있으나 실사용 조합에서 잉여로 잡힌 적이 없는 토템:`);
  console.log(`   ${neverSurplus.join(', ')}`);
  console.log(`   (실사용 데이터가 캠페인/PvP에 치우쳐 있어 보스전 전용 토템은 여기 잡히지 않는다.`);
  console.log(`    근거가 없다는 뜻이 아니라, 이 방법으로는 확인되지 않았다는 뜻이다.)`);
}
console.log(`${bar}\n`);
