#!/usr/bin/env node
/**
 * 조합 상대 비교기 — "어느 조합이 더 큰가"를 스킬 원문에서 계산한다. (2026-09-02)
 *
 *   node scripts/simulateTeams.mjs --mode=bossing --trials=200
 *   node scripts/simulateTeams.mjs --team="Crown,Naga,Anis: Star,Rapi: Red Hood,Privaty"
 *   node scripts/simulateTeams.mjs --selftest        # 단조성 검사만
 *
 * 왜 만들었나 (유저 목적):
 *   enikk 실사용 목록은 **강한 사람들이 쓴 완성 조합**만 보여준다. 니케가 적은 사람의
 *   미완성 조합은 거기 영원히 안 올라오고, 그래서 그 구간은 데이터가 안 생긴다.
 *   무작위 조합을 돌려 "어느 쪽이 더 큰가"를 쌓으려면 우리 계산이 필요하다.
 *
 * ⚠️⚠️ **이것은 DPS 예측기가 아니다. 절대값을 내지 않는다.** ⚠️⚠️
 *
 *   우리 데이터에 없는 것: 기본 공격력·레벨 스탯·장탄/연사·장비/오버로드/큐브·버프 중첩 규칙.
 *   그걸 가정해서 "1.82M" 같은 숫자를 만들면 그건 근거가 아니라 우리가 만든 가정이다(원칙 2).
 *   그래서 **기본 공격력을 1로 두고 배수만 계산한다.** 조합 A와 B의 비교에만 쓸 수 있고,
 *   "이 조합은 몇 딜이 나온다"에는 쓸 수 없다.
 *
 * ⚠️ **실측으로 검증하지 못했다 — 검증할 데이터가 없다.**
 *   솔로레이드 125조합에 실측 avgDamage가 붙어 있어 처음엔 그걸 정답지로 쓰려 했다.
 *   그런데 어떤 모델도 상관이 없었다(스피어만 평균 0.06~0.15, 시즌마다 부호도 뒤집힘).
 *   지금 쓰는 **티어 합조차 0.10**이다. 범위가 좁아서도 아니다 — 시즌 안에서 데미지가
 *   2.2~3.5배씩 벌어진다. 즉 **그 차이는 조합이 아니라 기록을 남긴 사람의 투자 상태**
 *   (장비·돌파·애장품·스킬레벨)에서 온다. docs/data.md도 같은 취지를 적어뒀다.
 *
 *   그래서 이 계산기는 **실측 대조로 검증된 적이 없다.** 대신 검증할 수 있는 것만 검증한다:
 *     단조성 — 멤버를 더 나쁜 쪽으로 바꾸면 점수가 오르면 안 된다.
 *              버퍼를 넣으면 점수가 내려가면 안 된다.
 *     이건 "맞다"의 증명이 아니라 "앞뒤가 맞다"의 확인이다. 그 이상으로 믿지 말 것.
 *
 * 모델 (전부 스킬 원문에서 읽은 값. 가정은 아래 ASSUMPTIONS에 이름 붙여 모아뒀다)
 *
 *   팀 점수 = Σ_i [ 자체딜_i × (1 + 받는버프_i) ] × (1 + 받는데미지증가)
 *
 *   자체딜_i     : "N% of final ATK as damage" 계수 합. 없으면 평타 기여 BASE_ATTACK.
 *   받는버프_i   : 그 멤버에게 실제로 닿는 공격 계열 버프의 합 × 가동률.
 *                  대상절(Affects ...)을 읽어 전 아군 / 속성 한정 / 자신만을 구분한다.
 *   가동률       : 패시브면 1.0, 버스트 스킬이면 지속시간 / 쿨타임(최대 1.0).
 *   받는데미지증가: 적에게 거는 "Damage Taken ▲" 디버프 합 × 가동률.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TRIGGER_CLASSES } from './analyzeSkillTriggers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = J('characterDatabase.json');
const baseStats = J('baseStats.json');
const weapons = J('weapons.json');
// 캐릭터 → 그의 무기. Fandom 표의 첫 칸 링크에서 왔다(197/198 매칭).
const WEAPON_BY_OWNER = new Map();
Object.entries(weapons.byType || {}).forEach(([type, rows]) =>
  rows.forEach((r) => { if (r.owner) WEAPON_BY_OWNER.set(r.owner, { ...r, type }); }));
// 매칭이 안 된 캐릭터(아마기 유키코 등 최신 캐릭)는 그 타입의 중앙값으로 대신한다.
const medianOf = (type, key) => {
  const v = (weapons.byType?.[type] || []).map((r) => r[key]).filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const byTitle = new Map(cdb.map((c) => [c.title, c]));

// ---------------------------------------------------------------------------
// 가정 — **여기 있는 것이 전부 "우리가 정한 값"이다.** 데이터에서 온 것이 아니다.
// 바꿀 때는 단조성 검사를 다시 돌릴 것.
export const ASSUMPTIONS = {
  // 자체 딜 계수가 하나도 없는 캐릭터(방어형·힐러 등)의 평타 기여.
  // 0으로 두면 "딜 계수 없는 캐릭터 = 기여 0"이 되어 버퍼가 과소평가된다.
  // ⚠️ 이 값 자체가 근거 없는 수치다. 계수 방식의 한계이지 이 상수의 문제가 아니다(아래 참고).
  BASE_ATTACK: 100,
  // 버스트 스킬 버프의 가동률 = 지속시간 / 쿨타임. 패시브는 1.0으로 본다.
  // 실제로는 풀버스트 진입 타이밍·재진입에 따라 달라지지만 그건 데이터에 없다.
  PASSIVE_UPTIME: 1.0,
  // 쿨타임이 있는 비버스트 스킬의 가동률을 `지속 ÷ 쿨`로 깎을 것인가. (2026-09-07)
  // 기본은 true다. false로 두면 2026-09-07 이전처럼 전부 상시(1.0)로 계산한다 —
  // **검사가 이 스위치로 두 계산을 대보고 실제로 갈리는지 확인한다**(selfTest 11번).
  SKILL_CD_UPTIME: true,
  // 평타를 **재장전 시간까지 포함한 지속 발사율**로 계산할 것인가. (2026-09-07)
  // 그전에는 탄창이 무한한 것처럼 계산했다 — 장탄을 다 쏘면 재장전하는 동안은 못 쏘는데
  // 그 시간이 빠져 있었다. weapons.json에 캐릭터별 `capacity`·`reloadSec`가 이미 있어
  // 새 값을 만들지 않는다. 가동률 = (장탄÷연사) ÷ (장탄÷연사 + 재장전).
  // 실측 중앙값: MG 0.706 · SG 0.779 · SR/RL 0.789 · SMG 0.808 · AR 0.857 —
  // **무기마다 21%까지 갈린다.** 전부 1.0으로 두면 MG·SG가 그만큼 부풀어 있었다.
  // false로 두면 이전 계산(재장전 없음)으로 돌아간다 — selfTest 12번이 두 계산을 대본다.
  RELOAD_UPTIME: true,
  // 최대 장탄수 버프를 유효 장탄에 반영할 것인가. (2026-09-08)
  // 반영하면 재장전 가동률이 오르고(장탄이 늘면 재장전 사이가 길어진다) `탄창 소모마다`
  // 계열은 덜 터진다. 두 방향을 같은 값으로 일관되게 쓴다.
  // false로 두면 이전처럼 장탄수 버프를 통째로 무시한다 — selfTest 14번이 두 계산을 대본다.
  AMMO_BUFF: true,
  // 여집합 대상절(두 절이 아군을 남김없이 가르는 경우)의 공통분모를 열 것인가. (2026-09-08)
  // false로 두면 이전처럼 양쪽 다 버린다 — selfTest 15번이 두 계산을 대본다.
  COMPLEMENT_SCOPE: true,
  // `for N round(s)` / `for N shot(s)` 로 끝나는 버프를 셀 것인가. (2026-09-07)
  //
  // **이건 지속시간이 아니라 발수다.** 그런데 `DURATION`이 `for N sec`만 읽어서 이 절들은
  // 지속시간을 못 읽는 것으로 처리됐고, 그 경우 가동률이 `PASSIVE_UPTIME = 1.0`, 즉
  // **상시**가 된다. 스노우 화이트 : 헤비암즈의 `Charge damage ▲ 528% for 1 round(s)`가
  // 통째로 상시 버프로 들어가 자기버프 배수를 **38.75배**로 만들고 있었다.
  //
  // 몇 발 중 1발인지는 **원문에 없다** — 스노우 화이트 쪽은 "Seven Dwarves Fully Active
  // 상태에서만"이고 그 상태의 사용 횟수는 버스트에 달려 있다. 그래서 횟수를 지어내지 않고
  // **버린다**(원칙 2 · 분류 못 한 발동 빈도를 0으로 두는 `freqPerSec`와 같은 방식).
  // 실측 9절 / 8명. false로 두면 이전처럼 상시로 계산한다 — selfTest 13번이 두 계산을 대본다.
  ROUND_BUFF_DROP: true,
  // 풀버스트 한 사이클(초). "사이클마다" 계열 스킬의 초당 발동 횟수를 여기서 나눈다.
  // ⚠️ 게임의 표준 주기이지만 우리가 정한 값이다 — 실제로는 팀 구성·재진입에 따라 달라진다.
  BURST_CYCLE_SEC: 20,
  // 전투 길이(초). "전투 시작 1회" 계열을 초당으로 환산할 때만 쓴다.
  // ⚠️ 솔로레이드는 180초, 캠페인은 훨씬 짧다. 우리가 정한 값이다.
  BATTLE_SEC: 180,
  // 차지 사격의 조준 모션 시간(초). 출처 글이 "모션시간 0.25 포함"이라고 적었다.
  CHARGE_MOTION_SEC: 0.25,
  // 속성 한정 버프는 대상이 맞는 아군에게만 적용한다(계수는 그대로).
  // 대상이 없으면 그 버프는 0이다 — 이건 가정이 아니라 원문 그대로다.
};

// ---------------------------------------------------------------------------
const clauses = (d) => (d || '').split(/(?<=\.)\s+/).map((x) => x.trim());
const sumRe = (s, re) => { let m; let t = 0; re.lastIndex = 0; while ((m = re.exec(s))) t += parseFloat(m[1]); return t; };

// 버프는 **성질별로 통을 나눈다.** 예전엔 전부 더했는데, `ATK ▲ 40%`와 `크리티컬 확률 ▲ 14%`를
// 같은 숫자로 더하는 것은 명백히 틀렸다(성질이 다르다). 통 안에서는 더하고, 통끼리는 곱한다.
// ⚠️ 이 통 나누기 자체는 **우리가 정한 구조다**(게임 내부 공식을 확인한 것이 아니다).
//    다만 "서로 다른 스탯을 한 숫자로 더하지 않는다"는 것만은 명백하므로 이쪽이 낫다.
const BUFF_BUCKETS = {
  atk:          /(?:^|[^\w])ATK\s*▲\s*(\d[\d.]*)%/ig,
  attackDamage: /Attack [Dd]amage\s*▲\s*(\d[\d.]*)%/ig,
  critRate:     /Critical Rate\s*▲\s*(\d[\d.]*)%/ig,
  critDamage:   /Critical Damage\s*▲\s*(\d[\d.]*)%/ig,
  chargeDamage: /Charge Damage\s*▲\s*(\d[\d.]*)%/ig,
  pierceDamage: /Pierce Damage\s*▲\s*(\d[\d.]*)%/ig,
};
const BUCKET_KEYS = Object.keys(BUFF_BUCKETS);
const DMG_TAKEN = /Damage Taken\s*▲\s*(\d[\d.]*)%/ig;

// **최대 장탄수 버프는 통(BUFF_BUCKETS)에 넣지 않는다 — 곱셈 배수가 아니기 때문이다.** (2026-09-08)
//
// 이 스탯은 딜을 몇 % 올리는 게 아니라 **장탄을 늘려 재장전 가동률을 올린다.** 그리고 그
// 가동률은 2026-09-07에 이미 계산에 넣은 값이라(`reloadUptime`) **새 기전을 만들 필요가 없다.**
// 원문의 숫자가 우리가 이미 쓰는 `capacity`에 그대로 들어간다.
//
// 표기가 두 가지다 — 정수(`▲ 3 round(s)` · `▲ 2`)와 백분율(`▲ 40%` · `▲ 787.5%`). 실측 29절/29명.
// ▼도 실제로 있다(프리바티 ▼50.66% · 아니스 : 스파클링 서머 ▼73.92% · K ▼51.13% · 모더니아 ▼5.04%) —
// **자기 페널티를 지금까지 공짜로 넘기고 있었다.** 양방향으로 읽는다.
// 재장전 속도 — `reloadSec`에 그대로 들어간다. 실측 15절 / 13명, 전부 ▲.
// **재장전 시간 = 기본 ÷ (1 + 속도/100).** "속도 ▲ 100%면 시간이 절반"이라는 속도 스탯의
// 일반적인 뜻이고, 값이 100%를 넘어도 음수가 되지 않는다(`기본 × (1 - x)`는 100%에서 0이 된다).
// ⚠️ 이것도 새 상수가 아니다 — 2026-09-07에 넣은 재장전 가동률이 쓰는 `reloadSec`를 바꿀 뿐이다.
const RELOAD_SPD = /Reload(?:ing)? Speed\s*([▲▼])\s*(\d[\d.]*)%/ig;
const AMMO_PCT  = /Max(?:imum)? [Aa]mmunition [Cc]apacity\s*([▲▼])\s*(\d[\d.]*)%/ig;
const AMMO_FLAT = /Max(?:imum)? [Aa]mmunition [Cc]apacity\s*([▲▼])\s*(\d+)(?!\s*[.\d]*%)/ig;
const sumSigned = (str, re) => {
  let m; let t = 0; re.lastIndex = 0;
  while ((m = re.exec(str))) t += (m[1] === '▼' ? -1 : 1) * parseFloat(m[2]);
  return t;
};
const SELF_COEF = /(\d[\d.]*)%\s*of final ATK as (?:damage|Burst Skill damage|Additional Damage)/ig;
const DURATION = /for (\d[\d.]*) sec/i;
// `for 1 round(s)` · `for 2 shot(s)` — **발수다. 지속시간이 아니다.** 위 DURATION이 이걸 못 읽어서
// 지속을 모르는 절로 취급됐고, 그러면 가동률이 1.0(상시)이 된다. 실측 9절인데 그중 하나가
// 528%라 스노우 화이트 : 헤비암즈의 자기버프 배수를 38.75배로 만들고 있었다.
const ROUND_DURATION = /for \d+ (?:round|shot)\(s\)/i;

// 기본 공격력 배수 — data/baseStats.json (game8 「最大ステータス」, A등급).
//
// 유저 지적에서 나왔다: "니케마다 기본 공격력이 다 다를 거 아니냐."
// 재보니 **캐릭터별로는 같고 클래스 × 등급으로 갈린다**(21명 표본, 조합 안 편차 0).
// SSR 기준 공격형 25,554 : 지원형 21,307 : 방어형 17,059 = 1.00 : 0.83 : 0.67.
// 그전에는 전원 동일로 뒀으니 **방어형을 1.5배 과대평가**하고 있었다.
const ATK_REF = baseStats.byClassRarity.attacker.SSR.atk;
function atkFactor(c) {
  const row = baseStats.byClassRarity?.[c.class]?.[c.rarity];
  if (!row) return 1; // 표에 없는 조합(defender/R 등)은 보정하지 않는다 — 없는 값을 만들지 않는다
  return row.atk / ATK_REF;
}

// 그 캐릭터의 초당 발사 수. 차지형(SR·RL)은 연사가 아니라 차지 시간의 역수다.
function shotsPerSec(c) {
  const w0 = WEAPON_BY_OWNER.get(c.title);
  const typeRate = weapons.fireRate?.perSecond?.[c.weapon];
  if (typeRate) {
    // **무기별 연사속도 = 장탄수 ÷ 6초.** (2026-09-03)
    // weapons.json의 _selfCheck가 "장탄수 ÷ 연사속도 = 정확히 6.0초"를 네 타입에서
    // 서로 다른 두 출처로 확인했다. 타입 상수만 쓰면 장탄이 다른 5종이 틀어진다 —
    // 질 발렌타인(AR 9발)에 AR 상수 10발/초를 먹여 **평타를 6.7배 과대평가**하고 있었다.
    //
    // 6초 상수를 이 5종까지 늘려도 되는 근거는 **재장전 가동률**이다.
    //   타입 상수 가정 → 질 발렌타인·스칼렛이 가동률 47%. 기준 장탄 116종은 67~90%다.
    //   장탄÷6초 가정 → 다섯 종 전부 72~86%로 그 띠 안에 들어온다.
    // 기준 장탄 무기에서는 타입 상수와 값이 정확히 같으므로(60÷6=10 …) 일반화일 뿐이다.
    const cap = w0?.capacity;
    const magSec = weapons.derived?.magazineSeconds;
    return cap && magSec ? cap / magSec : typeRate;
  }
  // 차지형(SR·RL): 무기마다 차지 시간이 다르다(1/1.2/1.5/2초). 여기에 조준 모션이 붙는다.
  const ct = w0?.chargeTimeSec ?? medianOf(c.weapon, 'chargeTimeSec');
  if (!ct) return null;
  return 1 / (ct + (ASSUMPTIONS.CHARGE_MOTION_SEC || 0));
}

// 풀차지 배율. **2026-09-03에 이걸 빼먹어서 SR 전체가 2.5배 과소평가됐다** —
// 스노우 화이트: 헤비암즈(보스 SSS)가 모더니아(A)보다 낮게 나왔다(유저 지적).
// Fandom 설명에 "Full Charge Damage: 250% of damage"로 적혀 있었는데 파싱을 안 했다.
// 아카라이브 수치로 역산해도 정확히 2.50배가 나온다(69.04 × 2.5 × 0.8 = 138.08).
function chargeMult(c) {
  const w = WEAPON_BY_OWNER.get(c.title);
  const m = w?.fullChargeMultPct ?? medianOf(c.weapon, 'fullChargeMultPct');
  return m ? m / 100 : 1;
}

// 재장전을 포함한 지속 가동률. (2026-09-07)
//
// 장탄을 다 쏘면 재장전하는 동안은 못 쏜다. 그 시간이 계산에 없어서 **탄창이 무한한 것처럼**
// 평타를 재고 있었다. 값은 전부 weapons.json에 이미 있다(캐릭터별 `capacity`·`reloadSec`) —
// 새 상수를 만들지 않는다.
//
// ⚠️ 무기마다 21%까지 갈린다: MG 0.706 · SG 0.779 · SR/RL 0.789 · SMG 0.808 · AR 0.857.
//    전부 1.0으로 두는 것은 중립이 아니라 **MG·SG 편향**이다. 시뮬레이터가 무작위 로스터에서
//    SG를 2.0배 · MG를 1.8배로 고르던 것(2026-09-04 O4)의 원인 중 하나가 여기다.
//
// 값을 읽지 못하면 1.0을 돌려준다 — 없는 값을 지어내지 않는다(그때는 이전과 같다).
// 최대 장탄수 버프를 반영한 유효 장탄. (2026-09-08)
//
// ⚠️ **가동률로 깎은 값을 그대로 더한다** — `{ pct: 40, flat: 3 }`이 이미 `× 가동률`을 거친
//    기댓값이라는 뜻이다. 이 모델의 다른 모든 버프가 쓰는 것과 **같은 관례**이고
//    (`buffOn`도 `v * uptime`을 더한다), 새 상수를 만들지 않는다.
function effCapacity(c, ammo) {
  const w = WEAPON_BY_OWNER.get(c.title);
  const cap = w?.capacity ?? medianOf(c.weapon, 'capacity');
  if (!cap || !ammo) return cap;
  // 장탄이 0 이하가 되는 일은 없다 — 1발 밑으로는 안 내려간다.
  return Math.max(1, cap * (1 + (ammo.pct || 0) / 100) + (ammo.flat || 0));
}

// 재장전 속도 버프를 반영한 유효 재장전 시간.
function effReload(c, ammo) {
  const w = WEAPON_BY_OWNER.get(c.title);
  const rel = w?.reloadSec ?? medianOf(c.weapon, 'reloadSec');
  if (!rel || !ammo?.reloadPct) return rel;
  return rel / (1 + ammo.reloadPct / 100);
}

function reloadUptime(c, A, ammo) {
  if (A && A.RELOAD_UPTIME === false) return 1;
  const w = WEAPON_BY_OWNER.get(c.title);
  const cap = (A && A.AMMO_BUFF === false) ? (w?.capacity ?? medianOf(c.weapon, 'capacity')) : effCapacity(c, ammo);
  const rel = (A && A.AMMO_BUFF === false) ? (w?.reloadSec ?? medianOf(c.weapon, 'reloadSec')) : effReload(c, ammo);
  const rate = shotsPerSec(c);
  if (!cap || !rel || !rate) return 1;
  const fire = cap / rate;
  return fire / (fire + rel);
}

// 평타 기여(초당). 기본 공격력 × 1발당 계수 × 초당 발사 수 × 재장전 가동률.
// **이것이 없어서 모더니아가 3점이었다** — 그의 딜은 평타에서 나온다(MG 7.71% × 50발/초).
function normalAttackDps(c, A, ammo) {
  const w = WEAPON_BY_OWNER.get(c.title);
  const coef = w?.shotCoefPct ?? medianOf(c.weapon, 'shotCoefPct');
  const rate = shotsPerSec(c);
  if (!coef || !rate) return 0;
  return atkFactor(c) * coef * chargeMult(c) * rate * reloadUptime(c, A, ammo);
}

// 그 절이 초당 몇 번 터지는가. **분류 못 한 계열은 0으로 둔다 — 없는 빈도를 만들지 않는다.**
function freqPerSec(cls, nShots, c, A, ammo) {
  const rate = shotsPerSec(c) || 0;
  const w = WEAPON_BY_OWNER.get(c.title);
  // 장탄이 늘면 `탄창 소모마다` 계열은 **덜** 터진다. 같은 값을 양쪽에 일관되게 쓴다.
  const cap = (A && A.AMMO_BUFF === false) ? (w?.capacity ?? medianOf(c.weapon, 'capacity')) : effCapacity(c, ammo);
  const rel = (A && A.AMMO_BUFF === false) ? (w?.reloadSec ?? medianOf(c.weapon, 'reloadSec')) : effReload(c, ammo);
  const ct = w?.chargeTimeSec ?? medianOf(c.weapon, 'chargeTimeSec');
  const ch = ct ? ct + (A.CHARGE_MOTION_SEC || 0) : (weapons.fireRate?.chargeWeapons?.shortChargeSec || 1.25);
  // 평타에 얹히는 계열(`평타 N발마다`·`풀차지`)은 **평타와 같은 가동률**을 받아야 한다.
  // 재장전 중에는 평타를 못 쏘므로 그 계열도 안 터진다. (2026-09-07)
  const up = reloadUptime(c, A, ammo);
  switch (cls) {
    case 'perCycle':    return 1 / A.BURST_CYCLE_SEC;
    case 'perShots':    return (nShots > 0 ? rate / nShots : rate) * up;
    case 'perCharge':   return up / ch;
    case 'perReload':   return (cap && rate) ? 1 / (cap / rate + (rel || 0)) : 0;
    case 'once':
    case 'battleStart': return 1 / A.BATTLE_SEC;
    default:            return 0;   // onHp·onKill·onHit·미분류 — 빈도를 알 수 없다
  }
}

// 스킬 딜(초당). 계수를 **그 절의 발동 빈도로 곱해서** 더한다.
// 예전에는 그냥 더해서 "평타마다 3.05%"와 "버스트마다 2808%"가 같은 자리에 들어갔다.
function skillDps(c, A, ammo) {
  const skills = c.skills || [];
  let total = 0;
  skills.forEach((sk, si) => {
    const isBurst = si === skills.length - 1;
    let cls = isBurst ? 'perCycle' : null;   // 버스트 스킬의 절은 기본이 사이클마다
    let nShots = 1;
    (sk.desc || '').split(/(?<=\.)\s+/).map((x) => x.trim()).forEach((cl) => {
      const m = cl.match(/^Activates\s+(.+?)\.?$/i);
      if (m) {
        const hit = TRIGGER_CLASSES.find(([, re]) => re.test(m[1]));
        cls = hit ? hit[0] : (isBurst ? 'perCycle' : null);
        // ⚠️ 어순이 두 가지다 — "after landing 30 normal attacks"와
        //    "when normal attacks hits 30 times". 옛 정규식은 `time\(s\)`라는
        //    **리터럴 괄호**를 요구해서 "30 times"를 놓쳤고, 두 번째 어순도 못 잡았다.
        //    그 결과 스노우 화이트의 "30발마다 82.8%"가 **매 발마다**로 계산돼
        //    30배 부풀었고 **그가 198명 중 1위로 올라와 있었다**(2026-09-03).
        //    숫자를 못 읽으면 nShots=1(매 발)이 되는 조용한 과대평가라 아래 검사로 막는다.
        const n = m[1].match(/(\d+)\s*(?:normal attacks?|time\(s\)|times?)/i);
        nShots = n ? Number(n[1]) : 1;
        return;
      }
      const coef = sumRe(cl, SELF_COEF);
      if (!coef) return;
      total += coef * freqPerSec(cls, nShots, c, A, ammo);
    });
  });
  return atkFactor(c) * total;
}

const burstCd = (c) => {
  const s = (c.skills || [])[(c.skills || []).length - 1];
  const n = Number(s?.cd);
  return Number.isFinite(n) && n > 0 ? n : 40;
};

// 절 앞에 붙는 표기 접두어를 벗긴다. (2026-09-07)
//
// 원문이 "Effect 1: Affects all allies." 처럼 번호를 달고 나오면 `^Affects` 앵커에 안 걸려
// **그 절이 통째로 안 보인다.** 실측: 이렇게 가려진 대상절이 67절이고, 접두어만 벗기면
// 그중 29절이 기존 규칙으로 바로 해석된다(self 18 · all allies 11).
//
// 유저 지적에서 드러났다 — "엠마 택티컬업은 동일 스쿼드 아군에게만 적용된다". 확인해 보니
// 엠마 : 택티컬 업의 스킬2는 **15개 절 전부가** 이 앵커에 막혀 안 보이고 있었다.
const CLAUSE_PREFIX = /^(?:Effect \d+:|Stage \d+:)\s*/i;
export const scopeOf = (clause) => {
  const m = String(clause || '').replace(CLAUSE_PREFIX, '').match(/^Affects\s+(.+?)\.?$/i);
  return m ? m[1] : null;
};

// 대상절 → 그 버프를 실제로 받는 팀원. (2026-09-07 확장)
//
// ⚠️ **정확 문자열 표를 쓴다. 접두 정규식을 쓰지 않는다.**
//    검증에서 실측된 사고 두 가지 때문이다:
//      - /^all shotgun-wielding allies/ (끝 앵커 없음)는 "(except self)" 변형까지 삼켜
//        아르카나 본인에게 자기 버프 55%를 얹는다.
//      - /^self if there (is|are)/ 는 라피: 레드 후드의 "self if there are Burst Stage 1
//        allies"까지 삼킨다.
//    표는 과매칭이 원리적으로 불가능하고, selfTest가 표의 각 항목이 몇 개 절에 걸리는지 센다.
//
// 무기 명칭 → 코드는 **한국어 원문으로 대조해 확정**했다. 트리나의 EN "rifles"와
// 아크레인저 블랙의 EN "assault rifles"가 KR에서 둘 다 "소총"이라, 더 구체적인 쪽을 따라
// 소총 = 돌격소총 = ar 로 읽는다. 이 해석이 틀렸다면 대상이 좁아질 뿐이라(지금은 0명)
// 부풀려지는 방향은 아니다.
const lc = (v) => String(v || '').toLowerCase();
const SCOPE_RULES = new Map([
  // 같은 스쿼드 — squad는 196/198명에 있다. 없으면 null로 버린다(추측하지 않는다).
  ['all allies from the same squad', (c, ms) => (c.squad ? ms.filter((m) => m.squad === c.squad) : null)],
  // 속성 — 원문에 "code"와 "type" 두 표기가 섞여 있다
  ['all wind type allies', (c, ms) => ms.filter((m) => lc(m.element) === 'wind')],
  ['all iron type allies', (c, ms) => ms.filter((m) => lc(m.element) === 'iron')],
  ['all allies with fire element', (c, ms) => ms.filter((m) => lc(m.element) === 'fire')],
  ['all electric code allies except for self', (c, ms) => ms.filter((m) => lc(m.element) === 'electric' && m.id !== c.id)],
  // 무기
  ['all allies with sniper rifles', (c, ms) => ms.filter((m) => lc(m.weapon) === 'sr')],
  ['all allies with a sniper rifle', (c, ms) => ms.filter((m) => lc(m.weapon) === 'sr')],
  ['all allies with a rocket launcher', (c, ms) => ms.filter((m) => lc(m.weapon) === 'rl')],
  ['all allies with a submachine gun', (c, ms) => ms.filter((m) => lc(m.weapon) === 'smg')],
  ['all shotgun-wielding allies (except self)', (c, ms) => ms.filter((m) => lc(m.weapon) === 'sg' && m.id !== c.id)],
  // (2026-09-08) 재장전·장탄 버프를 넣으면서 버려지던 대상절을 다시 훑다가 나왔다.
  // 표에 `all allies with a submachine gun`·`all shotgun-wielding allies (except self)`가
  // 이미 있는데 **가장 흔한 산탄총 표기(7절)가 빠져 있었다.**
  ['all shotgun-wielding allies', (c, ms) => ms.filter((m) => lc(m.weapon) === 'sg')],
  ['all allies with a shotgun', (c, ms) => ms.filter((m) => lc(m.weapon) === 'sg')],
  // 시전자 제외 — 해석에 애매함이 없다(5절).
  ['all allies (except self)', (c, ms) => ms.filter((m) => m.id !== c.id)],
  // 속성 × 무기
  ['all electric code allies with rifles', (c, ms) => ms.filter((m) => lc(m.element) === 'electric' && lc(m.weapon) === 'ar')],
  ['all wind code allies with assault rifles', (c, ms) => ms.filter((m) => lc(m.element) === 'wind' && lc(m.weapon) === 'ar')],
  // 클래스 인원 지정 — 키리(2기). 방어형이 지정 인원을 넘으면 누구인지 못 정하므로 버린다.
  ['2 defender ally unit(s)', (c, ms) => { const d = ms.filter((m) => lc(m.class) === 'defender'); return d.length <= 2 ? d : null; }],
  // 시전자 — 뒤에 붙은 말은 시점 수식이지 대상 필터가 아니다
  ['self after the stacks are removed', (c) => [c]],
  ['self every 3 sec', (c) => [c]],
  ['self every 2 sec', (c) => [c]],
  // 델타 : 닌자 시프의 배타 분기. 원문이 "해당되는 효과만 적용"이라 둘 중 하나만 성립한다.
  ['self if there are no other defender allies in the squad', (c, ms) => (ms.some((m) => m.id !== c.id && lc(m.class) === 'defender') ? [] : [c])],
  ['self if there is another defender ally in the squad', (c, ms) => (ms.some((m) => m.id !== c.id && lc(m.class) === 'defender') ? [c] : [])],
]);

function targetsOf(scope, caster, members) {
  const s = (scope || '').toLowerCase().trim();
  if (/^all allies$/.test(s)) return members;
  if (/^self$/.test(s)) return [caster];
  const el = s.match(/^all (fire|water|wind|iron|electric) code all(?:y|ies)$/);
  if (el) return members.filter((m) => (m.element || '').toLowerCase() === el[1]);
  const cl = s.match(/^all (attacker|defender|supporter) all(?:y|ies)$/);
  if (cl) return members.filter((m) => (m.class || '').toLowerCase() === cl[1]);
  const rule = SCOPE_RULES.get(s);
  if (rule) return rule(caster, members);
  return null; // 해석 못 한 대상절은 **버린다** — 없는 근거를 만들지 않는다
}

export const SCOPE_RULE_KEYS = [...SCOPE_RULES.keys()];

// ---------------------------------------------------------------------------
// **여집합 대상절.** (2026-09-08)
//
// 크라운의 스킬1은 아군을 둘로 가른다:
//   Affects all allies who previously cast their Burst Skills.        Reloading Speed ▲ 44.35%
//   Affects all allies who did not previously cast their Burst Skills. Reloading Speed ▲ 44.35%
// 둘 다 표에 없어 `targetsOf`가 null을 돌려주고 **통째로 버려졌다.** 재장전 속도를 계산에
// 넣은 뒤에도 크라운의 팀 기여가 0이었던 이유다 — 실사용 최상위 서포터인데.
//
// 🔴 **그런데 버스트 순서를 몰라도 되는 값이 있다.** 두 절이 아군을 남김없이 둘로 가르고
//    같은 스탯이 양쪽에 실려 있으면, 누가 어느 쪽이든 **양쪽의 작은 값만큼은 전원이 받는다.**
//    이건 추측이 아니라 원문에서 그대로 따라 나오는 하한이다.
//
// ⚠️ **최솟값을 쓴다. 평균이나 큰 쪽이 아니다.** 값이 다르면(A 60% · B 44%) 확정인 것은 44%뿐이고,
//    나머지는 누가 어느 분기인지 알아야 정해진다. 부풀리지 않는 쪽으로만 연다.
// ⚠️ 값이 한쪽에만 있으면 최솟값이 0이라 **아무것도 안 열린다.** 리버렐리오 s2가 그 경우다
//    (한쪽은 Attack Damage ▲231%, 다른 쪽은 Charge Time 고정 — 공통분모가 없다). 의도한 결과다.
//
// 실측: 여집합 쌍이 성립하는 스킬은 **2개**(크라운 s1 · 리버렐리오 s2)이고 값이 실제로 열리는
// 것은 크라운뿐이다. 표를 정확 문자열로 두는 이유는 SCOPE_RULES와 같다 — 과매칭이 원리적으로 불가능하다.
const COMPLEMENT_PAIRS = [
  {
    a: 'all allies who previously cast their burst skills',
    b: 'all allies who did not previously cast their burst skills',
    union: (c, ms) => ms,
  },
  {
    a: 'self if the enemy hit is the stage target',
    b: 'self if the enemy hit is a rapture that is not the stage target',
    union: (c) => [c],
  },
];
export const COMPLEMENT_SCOPES = new Set(COMPLEMENT_PAIRS.flatMap((p) => [p.a, p.b]));

/**
 * 조합 점수. 절대값에 의미 없음 — 같은 모드끼리의 비교에만 쓴다.
 * detail:true 면 어떤 항이 얼마나 기여했는지 함께 돌려준다.
 */
export function scoreComposition(members, opts = {}) {
  const A = { ...ASSUMPTIONS, ...(opts.assumptions || {}) };
  // 멤버별 · 통별 버프 합(%)
  const buffOn = new Map(members.map((m) => [m.id, Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0]))]));
  // 최대 장탄수는 배수가 아니라 **장탄 자체**를 바꾸므로 통과 따로 모은다. (2026-09-08)
  const ammoOn = new Map(members.map((m) => [m.id, { pct: 0, flat: 0, reloadPct: 0 }]));
  let dmgTaken = 0;
  const notes = [];

  members.forEach((caster) => {
    (caster.skills || []).forEach((sk, idx) => {
      const isBurst = idx === (caster.skills || []).length - 1;
      const dur = (sk.desc || '').match(DURATION);
      // 비버스트 스킬도 **쿨타임이 있으면** 그 사이에는 효과가 꺼져 있다. (2026-09-07)
      //
      // 그전에는 버스트가 아닌 스킬을 전부 PASSIVE_UPTIME=1.0, 즉 **상시**로 계산했다.
      // 그래서 히메노의 skill2(Active 쿨 20초 / 지속 10초, ATK ▲10.98%)가 실제의 2배로
      // 들어갔다. 대상절 검증에서 탈락한 규칙 11건의 공통 원인도 이것이다 — 대상이 자명해도
      // 조건부 효과가 상시로 붙어버려 열 수가 없었다.
      //
      // ⚠️ **새 상수를 만들지 않았다.** 버스트 스킬에 이미 쓰던 `지속 ÷ 쿨타임`을 쿨타임이
      //    있는 비버스트 스킬에도 그대로 적용할 뿐이다. 쿨타임이 없는 진짜 패시브(350개)는
      //    1.0 그대로다. 비버스트 396개 중 쿨타임이 있는 것은 46개(12%)다.
      const skillCd = Number(sk.cd);
      const hasCd = Number.isFinite(skillCd) && skillCd > 0;
      // 절마다 지속시간이 다를 수 있어 그 절의 값을 먼저 본다(없으면 스킬 전체의 첫 값).
      const uptimeFor = (cl) => {
        // `for N round(s)`·`for N shot(s)`는 **발수지 지속시간이 아니다.** 몇 발 중 몇 발인지는
        // 원문에 없으므로 횟수를 만들지 않고 버린다. (2026-09-07)
        if (A.ROUND_BUFF_DROP !== false && ROUND_DURATION.test(cl) && !DURATION.test(cl)) return 0;
        if (isBurst) return Math.min(1, (dur ? parseFloat(dur[1]) : 10) / burstCd(caster));
        if (!hasCd || A.SKILL_CD_UPTIME === false) return A.PASSIVE_UPTIME;
        // `continuously`는 원문이 "안 꺼진다"고 말하는 것이다 — 쿨타임과 무관하다.
        if (/continuously/i.test(cl)) return A.PASSIVE_UPTIME;
        const d = cl.match(DURATION) || dur;
        // 지속시간을 못 읽으면 예전과 같게 둔다(임의로 깎지 않는다).
        return d ? Math.min(1, parseFloat(d[1]) / skillCd) : A.PASSIVE_UPTIME;
      };
      let scope = null;
      // 여집합 대상절의 두 분기에 실린 값을 분기별로 모아 둔다. 스킬을 다 읽은 뒤에
      // **양쪽에 다 있는 값의 최솟값**만 전원에게 연다. (2026-09-08)
      const branch = new Map();
      const noteBranch = (sc0, key, v) => {
        // ⚠️ `scopeOf`는 원문 그대로(대문자 포함)를 돌려준다. 표는 소문자다 —
        //    `targetsOf`가 내부에서 소문자로 바꾸는 것과 같이 여기서도 맞춰야 한다.
        const sc = String(sc0 || '').toLowerCase().trim();
        if (!COMPLEMENT_SCOPES.has(sc)) return;
        if (!branch.has(sc)) branch.set(sc, {});
        branch.get(sc)[key] = (branch.get(sc)[key] || 0) + v;
      };
      clauses(sk.desc).forEach((cl) => {
        const aff = scopeOf(cl) === null ? null : [null, scopeOf(cl)];
        if (aff) { scope = aff[1]; return; }
        if (!scope) return;
        const uptime = uptimeFor(cl);
        let anyBuff = false;
        BUCKET_KEYS.forEach((k) => {
          const v = sumRe(cl, BUFF_BUCKETS[k]);
          if (!v) return;
          anyBuff = true;
          const tg = targetsOf(scope, caster, members);
          if (tg) tg.forEach((m) => { buffOn.get(m.id)[k] += v * uptime; });
          else { noteBranch(scope, `buf:${k}`, v * uptime); notes.push(`대상절 해석 못 함(버림): "${scope}"`); }
        });
        void anyBuff;
        // 최대 장탄수 — 정수 표기와 백분율 표기가 섞여 있다. ▼도 읽는다(자기 페널티).
        const aPct = sumSigned(cl, AMMO_PCT);
        const aFlat = sumSigned(cl, AMMO_FLAT);
        const aRel = sumSigned(cl, RELOAD_SPD);
        if (aPct || aFlat || aRel) {
          const tg = targetsOf(scope, caster, members);
          if (tg) tg.forEach((m) => {
            const a = ammoOn.get(m.id);
            a.pct += aPct * uptime; a.flat += aFlat * uptime; a.reloadPct += aRel * uptime;
          });
          else {
            noteBranch(scope, 'ammo:pct', aPct * uptime);
            noteBranch(scope, 'ammo:flat', aFlat * uptime);
            noteBranch(scope, 'ammo:reloadPct', aRel * uptime);
            notes.push(`대상절 해석 못 함(버림): "${scope}"`);
          }
        }
        const dt = sumRe(cl, DMG_TAKEN);
        if (dt) dmgTaken += dt * uptime;
      });

      // --- 여집합 대상절 정산 (2026-09-08) ---
      // 두 분기가 아군을 남김없이 가르므로, **양쪽에 다 실린 값의 최솟값**은 누가 어느 쪽이든
      // 전원이 받는다. 최솟값만 연다 — 나머지는 분기를 알아야 정해지므로 버린 채로 둔다.
      if (A.COMPLEMENT_SCOPE !== false && branch.size) {
        COMPLEMENT_PAIRS.forEach((pair) => {
          const A2 = branch.get(pair.a); const B2 = branch.get(pair.b);
          if (!A2 || !B2) return;
          const tg = pair.union(caster, members);
          if (!tg || !tg.length) return;
          Object.keys(A2).forEach((key) => {
            if (!(key in B2)) return;            // 한쪽에만 있으면 확정인 몫이 없다
            const v = Math.min(A2[key], B2[key]);
            if (!v) return;
            const [kind, name] = key.split(':');
            if (kind === 'buf') tg.forEach((m) => { buffOn.get(m.id)[name] += v; });
            else tg.forEach((m) => { ammoOn.get(m.id)[name] += v; });
          });
        });
      }
    });
  });

  let total = 0;
  const parts = members.map((m) => {
    // 초당 기여 = 평타 + 스킬(빈도 반영). 둘 다 기본 공격력 보정이 들어가 있다.
    const ammo = ammoOn.get(m.id);
    const na = normalAttackDps(m, A, ammo);
    const sd = skillDps(m, A, ammo);
    const self = na + sd;
    const b = buffOn.get(m.id);
    // 통 안에서는 더하고, 통끼리는 곱한다.
    const mult = BUCKET_KEYS.reduce((a, k) => a * (1 + b[k] / 100), 1);
    const v = self * mult;
    total += v;
    return { title: m.title, kr: m.name_kr || m.title, self, normal: na, skill: sd, buckets: b, ammo, mult, value: v };
  });
  total *= (1 + dmgTaken / 100);

  return opts.detail ? { total, dmgTaken, parts, notes } : { total };
}

// ---------------------------------------------------------------------------
// 단조성 검사 — 실측이 없으니 "앞뒤가 맞는가"만 확인한다.
// 보스 티어 순위상관의 기준선. 올라가면 이 값을 함께 올린다(검사가 알려준다).
// 🔴 2026-09-07에 **재는 값을 바꿨다.** 옛 0.40은 `parts[].self`(자기 버프가 빠진 값) 기준이다.
// 같은 코드에서 `parts[].value`(자기 버프 포함)로 재면 0.579가 나온다 — 계산이 좋아진 게 아니라
// 계측기가 그동안 버프 축을 안 재고 있었던 것이다. 경위는 아래 (6)번 주석.
const TIER_RHO_BASELINE = 0.55;

// SCOPE_RULES가 실제로 해석하는 절의 수. 줄면 표기가 어긋난 것이라 실패시킨다.
const SCOPE_CLAUSE_BASELINE = 35;

// 여집합 규칙으로 크라운이 낀 팀이 오르는 최소 폭(%). 실측 6.6%라 여유를 두고 5%로 잡는다.
const COMPLEMENT_CROWN_MIN = 5;

// 장탄·재장전 버프가 혼자 있을 때 점수를 바꾸는 캐릭터 수 / 그중 ▼로 내려가는 수.
const AMMO_MOVED_BASELINE = 34;  // 2026-09-08 여집합 규칙으로 크라운이 합류해 33 → 34
// ▼로 내려가는 것은 2명이다(K · 모더니아). 아니스 : 스파클링 서머는 장탄 ▼73.92%를 갖고 있지만
// 같은 스킬의 재장전 속도 ▲77%가 그걸 넘어서 순증이 된다 — 두 스탯을 함께 읽은 결과다.
const AMMO_PENALTY_BASELINE = 2;

// `for N round(s)` 버프를 버렸을 때 자기버프 배수가 실제로 내려가는 캐릭터 수.
const ROUND_BUFF_BASELINE = 8;

// 재장전을 반영했을 때 평타가 실제로 낮아지는 캐릭터 수. 줄면 재장전 반영이 되돌려진 것이다.
const RELOAD_LOWERED_BASELINE = 198;

// 쿨타임 가동률을 켰을 때 팀 점수가 실제로 낮아지는 캐릭터 수. 줄면 계산이 되돌려진 것이다.
const UPTIME_LOWERED_BASELINE = 6;

function selfTest() {
  const TIER = { SSS: 9, SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };
  const pick = (t) => byTitle.get(t);
  const problems = [];
  let checked = 0;

  // (1) 더 나쁜 멤버로 바꾸면 점수가 오르면 안 된다.
  //     같은 버스트·같은 클래스에서 자체 딜 계수가 확실히 낮은 쪽으로 바꿔 본다.
  const pool = cdb.filter((c) => (c.skills || []).length);
  const coef = (c) => (c.skills || []).reduce((a, s) => a + sumRe(s.desc || '', SELF_COEF), 0);
  for (const burst of ['1', '2', '3']) {
    const g = pool.filter((c) => String(c.burst) === burst && coef(c) > 0).sort((a, b) => coef(b) - coef(a));
    if (g.length < 6) continue;
    const base = [pool.find((c) => String(c.burst) === '1'), pool.find((c) => String(c.burst) === '2'),
      pool.find((c) => String(c.burst) === '3')].filter(Boolean);
    if (base.length < 3) continue;
    const strong = g[0]; const weak = g[g.length - 1];
    const filler = pool.filter((c) => ![strong, weak, ...base].includes(c)).slice(0, 2);
    const teamS = [...base, strong, ...filler].slice(0, 5);
    const teamW = teamS.map((c) => (c === strong ? weak : c));
    if (teamS.length !== 5) continue;
    checked += 1;
    const a = scoreComposition(teamS).total; const b = scoreComposition(teamW).total;
    if (b > a + 1e-9) {
      problems.push(`B${burst}: 딜 계수가 낮은 ${weak.name_kr || weak.title}(${coef(weak).toFixed(0)}%)로 바꿨는데 ` +
        `점수가 올랐다 ${a.toFixed(0)} → ${b.toFixed(0)} (원래 ${strong.name_kr || strong.title} ${coef(strong).toFixed(0)}%)`);
    }
  }

  // (2) 전 아군 버퍼를 넣으면 점수가 내려가면 안 된다.
  const buffers = cdb.filter((c) => {
    let scope = null; let has = false;
    (c.skills || []).slice(0, -1).forEach((s) => clauses(s.desc).forEach((cl) => {
      const sc = scopeOf(cl); if (sc !== null) { scope = sc; return; }
      if (scope && /^all allies$/i.test(scope.trim()) && BUCKET_KEYS.some((k) => sumRe(cl, BUFF_BUCKETS[k]) > 0)) has = true;
    }));
    return has;
  });
  const plain = cdb.filter((c) => !buffers.includes(c) && coef(c) === 0);
  if (buffers.length && plain.length) {
    const base = cdb.filter((c) => coef(c) > 0).slice(0, 4);
    if (base.length === 4) {
      checked += 1;
      const withBuf = scoreComposition([...base, buffers[0]]).total;
      const without = scoreComposition([...base, plain[0]]).total;
      if (withBuf < without - 1e-9) {
        problems.push(`전 아군 버퍼 ${buffers[0].name_kr || buffers[0].title}를 넣었는데 점수가 내려갔다 ` +
          `${without.toFixed(0)} → ${withBuf.toFixed(0)}`);
      }
    }
  }

  // (3) 속성 한정 버프는 대상이 맞는 아군에게만 붙어야 한다.
  //
  //     ⚠️ 이 검사를 **두 번 잘못 짰다.**
  //        1차: "같은 속성 팀 vs 다른 속성 팀" — 채우는 인원이 달라 그들 버프까지 섞였다.
  //        2차: 한 팀 안에서 비교 — 그래도 채우는 인원끼리 서로 버프를 줘서 섞였다.
  //        결국 **버프를 전혀 안 주는 인원으로만 채워야** 시전자 한 명의 기여가 남는다.
  //        판정 단위가 고장의 단위와 맞아야 한다는 원칙 4를 여기서도 두 번 밟았다.
  const givesAnyBuff = (c) => {
    let scope = null; let has = false;
    (c.skills || []).forEach((s) => clauses(s.desc).forEach((cl) => {
      const sc = scopeOf(cl); if (sc !== null) { scope = sc; return; }
      if (scope && BUCKET_KEYS.some((k) => sumRe(cl, BUFF_BUCKETS[k]) > 0)) has = true;
    }));
    return has;
  };
  const elBuffer = cdb.find((c) => (c.skills || []).some((s) => /Affects all (Fire|Water|Wind|Iron|Electric) Code all(y|ies)\./i.test(s.desc || '')));
  if (elBuffer) {
    const m = (elBuffer.skills || []).map((s) => (s.desc || '').match(/Affects all (Fire|Water|Wind|Iron|Electric) Code/i)).find(Boolean);
    const el = m[1].toLowerCase();
    const inert = cdb.filter((c) => c !== elBuffer && !givesAnyBuff(c));
    const same = inert.filter((c) => (c.element || '').toLowerCase() === el).slice(0, 2);
    const diff = inert.filter((c) => (c.element || '').toLowerCase() !== el).slice(0, 2);
    if (same.length === 2 && diff.length === 2) {
      checked += 1;
      const r = scoreComposition([elBuffer, ...same, ...diff], { detail: true });
      const get = (t) => r.parts.find((p) => p.title === t);
      const tot = (c) => BUCKET_KEYS.reduce((x, k) => x + get(c.title).buckets[k], 0);
      const sameB = same.reduce((a, c) => a + tot(c), 0);
      const diffB = diff.reduce((a, c) => a + tot(c), 0);
      if (!(sameB > 0 && diffB === 0)) {
        problems.push(`${elBuffer.name_kr || elBuffer.title}의 ${el} 한정 버프가 속성을 안 가린다 ` +
          `(무버프 인원으로만 채운 팀에서 — 속성 맞는 2명 ${sameB.toFixed(0)}% vs 아닌 2명 ${diffB.toFixed(0)}%)`);
      }
    } else {
      problems.push('속성 한정 버프 검사를 못 했다 — 버프를 안 주는 인원을 충분히 못 찾음');
    }
  }

  // (4) 평타 딜러가 무딜 캐릭터보다 높아야 한다. **이게 뒤집혀 있던 것이 이번 작업의 출발점이다.**
  //     모더니아는 자체 딜 계수 합이 3%뿐이라 예전 모델에서 무딜 필러(일괄 100)보다 낮았다.
  //     그의 딜은 평타(MG 7.71% × 50발/초)에서 나온다.
  {
    const carrier = byTitle.get('Modernia');
    const inert = cdb.find((c) => c !== carrier
      && (c.skills || []).every((s) => !sumRe(s.desc || '', SELF_COEF))
      && (c.class === 'defender' || c.class === 'supporter'));
    if (carrier && inert) {
      checked += 1;
      const a = scoreComposition([carrier], { detail: true }).parts[0];
      const b = scoreComposition([inert], { detail: true }).parts[0];
      if (!(a.self > b.self)) {
        problems.push(`평타 딜러 ${carrier.name_kr}(${a.self.toFixed(0)})가 무딜 ` +
          `${inert.name_kr || inert.title}(${b.self.toFixed(0)})보다 높지 않다 — 평타 계산이 죽었을 수 있다`);
      }
      if (!(a.normal > 0)) problems.push(`${carrier.name_kr}의 평타 기여가 0이다 — 무기 매칭을 확인할 것`);
    }
  }

  // (5) 무기 매칭이 대부분 살아 있어야 한다. 끊기면 평타가 조용히 중앙값으로 대체된다.
  {
    checked += 1;
    const mapped = cdb.filter((c) => WEAPON_BY_OWNER.has(c.title)).length;
    if (mapped < cdb.length - 5) {
      problems.push(`무기 매칭이 ${mapped}/${cdb.length}명뿐이다 — Fandom 표의 캐릭터 링크 파싱을 확인할 것`);
    }
  }

  // (8) **"평타 N발마다"의 N을 실제로 읽었는가.** (2026-09-03)
  //     못 읽으면 nShots=1로 떨어져 조용히 N배 부풀린다. 에러가 안 나고 순위만 틀어진다 —
  //     실제로 스노우 화이트가 이 버그로 1위였다. 판정 단위를 **조건절**로 잡는다:
  //     발동 조건에 숫자가 있는데 N을 못 뽑았으면 실패.
  {
    checked += 1;
    const PER_SHOTS = TRIGGER_CLASSES.find(([k]) => k === 'perShots')[1];
    const missed = [];
    cdb.forEach((c) => (c.skills || []).forEach((sk) => (sk.desc || '').split(/(?<=\.)\s+/).forEach((cl) => {
      const m = cl.trim().match(/^Activates\s+(.+?)\.?$/i);
      if (!m || !PER_SHOTS.test(m[1])) return;
      if (!/\d/.test(m[1])) return;                        // 숫자가 없으면 "매 발마다"가 맞다
      if (!/(\d+)\s*(?:normal attacks?|time\(s\)|times?)/i.test(m[1])) {
        missed.push(`${c.name_kr || c.title}: "${m[1].slice(0, 60)}"`);
      }
    })));
    if (missed.length) {
      problems.push(`"평타 N발마다"의 N을 못 읽은 조건절 ${missed.length}건 — N배 과대평가된다: ${missed.slice(0, 3).join(' / ')}`);
    }
  }

  // (10) **대상절 규칙표가 실제 원문에 걸리는가.** (2026-09-07)
  //      SCOPE_RULES는 원문 문자열과 **글자 그대로** 맞아야 동작한다. 위키가 표기를 조금
  //      고치거나 우리가 오타를 내면 그 규칙은 조용히 0절이 되고, 버프가 다시 사라진다 —
  //      에러도 안 나고 점수만 틀린다(원칙 3). 그래서 규칙마다 몇 절에 걸리는지 센다.
  //      반대로 총합이 늘면 새 캐릭터가 같은 표기를 쓴 것이니 그건 알리기만 한다.
  {
    checked += 1;
    const seen = new Map(SCOPE_RULE_KEYS.map((k) => [k, 0]));
    cdb.forEach((c) => (c.skills || []).forEach((sk) => {
      (sk.desc || '').split(/(?<=\.)\s+/).forEach((cl) => {
        const sc = scopeOf(cl.trim());
        if (sc === null) return;
        const k = sc.toLowerCase().trim();
        if (seen.has(k)) seen.set(k, seen.get(k) + 1);
      });
    }));
    const dead = [...seen.entries()].filter(([, n]) => n === 0).map(([k]) => k);
    if (dead.length) {
      problems.push(`대상절 규칙 ${dead.length}종이 아무 절에도 안 걸린다 — 원문 표기가 바뀌었거나 오타다: ${dead.slice(0, 3).join(' / ')}`);
    }
    const total = [...seen.values()].reduce((a, b) => a + b, 0);
    if (total < SCOPE_CLAUSE_BASELINE) {
      problems.push(`대상절 규칙이 걸리는 절이 ${SCOPE_CLAUSE_BASELINE} → ${total}로 줄었다 — 원문이 바뀌었을 수 있다`);
    } else if (total > SCOPE_CLAUSE_BASELINE) {
      console.log(`  ℹ️ 대상절 규칙이 걸리는 절이 ${SCOPE_CLAUSE_BASELINE} → ${total}로 늘었다(새 캐릭터로 보인다). 기준선을 올릴 것.`);
    }
    console.log(`  대상절 규칙 ${SCOPE_RULE_KEYS.length}종이 ${total}절을 해석한다`);
  }

  // (11) **쿨타임 있는 비버스트 스킬의 가동률이 실제로 깎이는가.** (2026-09-07)
  //      그전에는 버스트가 아닌 스킬을 전부 상시(1.0)로 계산했다. 히메노 skill2는
  //      Active 쿨 20초 / 지속 10초인데 ATK ▲10.98%가 통째로 들어가 실제의 2배였다.
  //
  //      ⚠️ 처음에는 "지속 < 쿨인 절의 개수"를 셌는데 **그건 데이터를 재는 것이라
  //         코드를 되돌려도 같은 값이 나왔다.** 판정 단위가 고장의 단위와 달랐다(원칙 4).
  //         지금은 `SKILL_CD_UPTIME` 스위치로 **두 계산을 실제로 돌려 비교한다.**
  //
  //      실측: 실사용 조합 175팀 중 11팀이 갈렸고 **전부 하락**했다(-0.8% ~ -8.1%,
  //      평균 -4.9%). 부풀림만 걷어내고 없던 값을 더하지 않았다는 뜻이다.
  {
    checked += 1;
    // 쿨타임 있는 비버스트 스킬로 버프를 주는 캐릭터를 찾아 그 사람이 낀 팀을 만든다.
    const gated = cdb.filter((c) => {
      const n = (c.skills || []).length;
      return (c.skills || []).some((sk, i) => {
        if (i === n - 1) return false;
        const cd = Number(sk.cd);
        if (!Number.isFinite(cd) || cd <= 0) return false;
        return (sk.desc || '').split(/(?<=\.)\s+/).some((cl) => !/continuously/i.test(cl)
          && BUCKET_KEYS.some((k) => sumRe(cl, BUFF_BUCKETS[k]) > 0)
          && (cl.match(DURATION) ? parseFloat(cl.match(DURATION)[1]) < cd : false));
      });
    });
    const filler = cdb.filter((c) => !gated.includes(c)).slice(0, 4);
    let lower = 0; let higher = 0;
    gated.forEach((c) => {
      const team = [c, ...filler];
      if (team.length !== 5) return;
      const on = scoreComposition(team).total;
      const off = scoreComposition(team, { assumptions: { SKILL_CD_UPTIME: false } }).total;
      if (on < off - 1e-9) lower += 1;
      else if (on > off + 1e-9) higher += 1;
    });
    if (higher > 0) {
      problems.push(`가동률을 깎았는데 점수가 **오른** 팀이 ${higher}건 있다 — 계산 방향이 뒤집혔다`);
    }
    if (lower < UPTIME_LOWERED_BASELINE) {
      problems.push(`쿨타임 가동률이 점수를 낮추는 캐릭터가 ${UPTIME_LOWERED_BASELINE} → ${lower}명으로 줄었다`
        + ' — 가동률 계산이 되돌려졌을 수 있다. 되돌아가면 조건부 효과가 상시로 계산된다');
    } else if (lower > UPTIME_LOWERED_BASELINE) {
      console.log(`  ℹ️ 가동률이 점수를 낮추는 캐릭터가 ${UPTIME_LOWERED_BASELINE} → ${lower}명으로 늘었다. 기준선을 올릴 것.`);
    }
    console.log(`  쿨타임 가동률이 실제로 점수를 낮추는 캐릭터 ${lower}명 (오르는 경우 ${higher}명)`);
  }

  // (12) **평타에서 재장전 시간이 빠져 있던 것.** (2026-09-07)
  //      `shotsPerSec`는 **발사 중 연사속도**(장탄 ÷ 6초)라 재장전이 안 들어 있다. 그대로
  //      쓰면 탄창이 무한한 것처럼 계산된다. 무기마다 가동률이 21% 갈리므로 전부 1.0으로
  //      두는 것은 중립이 아니라 **MG·SG 편향**이다.
  //
  //      ⚠️ 판정 단위를 데이터가 아니라 **계산**에 뒀다(원칙 4). "재장전 시간이 있는 무기 수"를
  //         세면 코드를 되돌려도 같은 값이 나온다. 그래서 `RELOAD_UPTIME` 스위치로 두 계산을
  //         실제로 돌리고, 그 비율을 **다른 출처와 대조**한다.
  //
  //      대조 상대: `weapons.json`의 `derived.normalAttackDpsPct`에 `raw`와 `withReload`가
  //      **이미 따로 계산돼 있었다.** 그 둘의 비가 우리가 계산한 가동률과 6개 타입 전부
  //      소수 셋째 자리까지 같다(ar .857 · smg .808 · sg .779 · sr/rl .789 · mg .706).
  //      즉 데이터 파일은 재장전을 반영한 값을 갖고 있었는데 시뮬레이터가 `raw` 쪽을
  //      쓰고 있었던 것이다.
  {
    checked += 1;
    const ref = weapons.derived?.normalAttackDpsPct;
    const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    const byType = {};
    let lowered = 0; let raised = 0;
    cdb.filter((c) => (c.skills || []).length).forEach((c) => {
      // ⚠️ **장탄수 버프를 양쪽에서 끈다.** 이 검사가 재는 것은 재장전 공식이지 장탄 버프가
      //    아니고, 대조 상대인 weapons.json의 표도 **기본 장탄** 기준이다. 안 끄면 자기
      //    장탄 버프를 가진 캐릭터가 섞여 SMG 중앙값이 0.808 → 0.833으로 밀린다(실제로 겪었다).
      const on = scoreComposition([c], { detail: true, assumptions: { AMMO_BUFF: false } }).parts[0].normal;
      const off = scoreComposition([c], { detail: true, assumptions: { AMMO_BUFF: false, RELOAD_UPTIME: false } }).parts[0].normal;
      if (!off) return;
      if (on < off - 1e-9) lowered += 1; else if (on > off + 1e-9) raised += 1;
      (byType[c.weapon] = byType[c.weapon] || []).push(on / off);
    });
    if (raised > 0) {
      problems.push(`재장전을 반영했는데 평타가 **오른** 캐릭터가 ${raised}명 있다 — 계산 방향이 뒤집혔다`);
    }
    if (lowered < RELOAD_LOWERED_BASELINE) {
      problems.push(`재장전 가동률이 평타를 낮추는 캐릭터가 ${RELOAD_LOWERED_BASELINE} → ${lowered}명으로 줄었다`
        + ' — 재장전 반영이 되돌려졌을 수 있다. 되돌아가면 MG·SG가 20~30% 부풀어 오른다');
    } else if (lowered > RELOAD_LOWERED_BASELINE) {
      console.log(`  ℹ️ 재장전 가동률이 평타를 낮추는 캐릭터가 ${RELOAD_LOWERED_BASELINE} → ${lowered}명으로 늘었다. 기준선을 올릴 것.`);
    }
    // 타입별 가동률이 weapons.json이 따로 계산해 둔 값과 맞는가 — **다른 출처와의 대조**다.
    const off6 = [];
    Object.entries(byType).forEach(([w, arr]) => {
      const want = ref?.raw?.[w] && ref?.withReload?.[w] ? ref.withReload[w] / ref.raw[w] : null;
      if (want == null) return;
      const got = med(arr);
      if (Math.abs(got - want) > 0.01) off6.push(`${w} ${got.toFixed(3)} ≠ ${want.toFixed(3)}`);
    });
    if (off6.length) {
      problems.push(`재장전 가동률이 weapons.json의 withReload÷raw와 어긋난다: ${off6.join(' / ')}`);
    }
    console.log(`  재장전 가동률이 평타를 낮추는 캐릭터 ${lowered}명 (오르는 경우 ${raised}명) · `
      + `타입별 가동률이 weapons.json과 일치 ${Object.keys(byType).length - off6.length}/${Object.keys(byType).length}`);
  }

  // (13) **`for N round(s)` 버프가 상시로 들어가던 것.** (2026-09-07)
  //      이건 발수지 지속시간이 아닌데 `DURATION`이 `for N sec`만 읽어서 "지속을 모르는 절"이
  //      됐고, 그러면 가동률이 1.0(상시)이 된다. 스노우 화이트 : 헤비암즈의
  //      `Charge damage ▲ 528% for 1 round(s)`가 통째로 들어가 자기버프 배수가 **38.75배**였다.
  //      2026-09-07 오전에 `parts[].value`로 ρ를 재기 시작하면서 드러났다 — 그전에는
  //      자기 버프를 아예 안 재고 있었으니 이 고장이 어떤 지표에도 안 나타났다.
  //
  //      실측 9절 / 8명. 등록 조합 214팀 중 81팀이 갈렸고 **전부 하락**(최대 -86%).
  {
    checked += 1;
    let lowered = 0; let raised = 0; const carriers = [];
    cdb.filter((c) => (c.skills || []).length).forEach((c) => {
      const on = scoreComposition([c], { detail: true }).parts[0];
      const off = scoreComposition([c], { detail: true, assumptions: { ROUND_BUFF_DROP: false } }).parts[0];
      if (on.mult < off.mult - 1e-9) { lowered += 1; carriers.push(`${c.name_kr || c.title} x${off.mult.toFixed(2)}→x${on.mult.toFixed(2)}`); }
      else if (on.mult > off.mult + 1e-9) raised += 1;
    });
    if (raised > 0) {
      problems.push(`발수 버프를 버렸는데 자기버프 배수가 **오른** 캐릭터가 ${raised}명 있다 — 방향이 뒤집혔다`);
    }
    if (lowered < ROUND_BUFF_BASELINE) {
      problems.push(`발수(\`for N round(s)\`) 버프가 걸리는 캐릭터가 ${ROUND_BUFF_BASELINE} → ${lowered}명으로 줄었다`
        + ' — 되돌려졌거나 원문 표기가 바뀌었다. 되돌아가면 528% 버프가 상시로 계산된다');
    } else if (lowered > ROUND_BUFF_BASELINE) {
      console.log(`  ℹ️ 발수 버프가 걸리는 캐릭터가 ${ROUND_BUFF_BASELINE} → ${lowered}명으로 늘었다. 기준선을 올릴 것.`);
    }
    // 값이 아니라 **계산**을 재는 부분: 되돌렸을 때 실제로 얼마나 부풀었는지.
    const worst = carriers.length ? carriers.sort((a, b) => parseFloat(b.split('x')[1]) - parseFloat(a.split('x')[1]))[0] : '없음';
    console.log(`  발수 버프를 버려서 자기버프 배수가 내려간 캐릭터 ${lowered}명 (오르는 경우 ${raised}명) · 최대 ${worst}`);
  }

  // (14) **최대 장탄수·재장전 속도 버프가 통째로 버려지던 것.** (2026-09-08)
  //      둘 다 딜 배수가 아니라 **재장전 가동률**을 바꾸는 스탯이라 BUFF_BUCKETS에 자리가
  //      없었고, 그래서 0으로 사라지고 있었다. 새 기전은 만들지 않았다 — 2026-09-07에 넣은
  //      `reloadUptime`이 쓰는 `capacity`·`reloadSec`를 원문의 숫자로 바꿀 뿐이다.
  //
  //      🔴 **양방향이라는 것이 중요하다.** 프리바티는 아군 전체의 최대 장탄을 ▼50.66%로
  //      깎고(대신 재장전 속도 ▲51.16%) 자기 skill2가 `마지막 탄환 명중 시` 터진다 —
  //      장탄을 줄여 재장전을 자주 하는 것이 그의 기전이다. 이걸 반영하니 혼자 있을 때
  //      점수가 +37% 올랐다. 모더니아·아니스 : 스파클링 서머·K의 자기 페널티는 반대로 내려간다.
  //      **지금까지 페널티를 공짜로 넘기고 있었다.**
  {
    checked += 1;
    let moved = 0; let pen = 0;
    cdb.filter((c) => (c.skills || []).length).forEach((c) => {
      const on = scoreComposition([c], { detail: true }).parts[0].self;
      const off = scoreComposition([c], { detail: true, assumptions: { AMMO_BUFF: false } }).parts[0].self;
      if (!off) return;
      if (Math.abs(on - off) > 1e-9) moved += 1;
      if (on < off - 1e-9) pen += 1;
    });
    if (moved < AMMO_MOVED_BASELINE) {
      problems.push(`장탄·재장전 버프가 점수를 바꾸는 캐릭터가 ${AMMO_MOVED_BASELINE} → ${moved}명으로 줄었다`
        + ' — 되돌려졌거나 원문 표기가 바뀌었다');
    } else if (moved > AMMO_MOVED_BASELINE) {
      console.log(`  ℹ️ 장탄·재장전 버프가 점수를 바꾸는 캐릭터가 ${AMMO_MOVED_BASELINE} → ${moved}명으로 늘었다. 기준선을 올릴 것.`);
    }
    // **내려가는 쪽이 있어야 한다.** 전부 오르기만 하면 ▼를 안 읽고 있다는 뜻이다.
    if (pen < AMMO_PENALTY_BASELINE) {
      problems.push(`장탄 ▼(자기 페널티)로 점수가 내려가는 캐릭터가 ${AMMO_PENALTY_BASELINE} → ${pen}명으로 줄었다`
        + ' — ▼를 안 읽고 버프만 읽으면 페널티를 공짜로 넘기게 된다');
    }
    console.log(`  장탄·재장전 버프가 점수를 바꾸는 캐릭터 ${moved}명 (그중 ▼로 내려가는 ${pen}명)`);
  }

  // (15) **여집합 대상절 규칙 자체를 시험한다 — 데이터가 아니라 규칙을.** (2026-09-08)
  //      크라운의 재장전 속도 ▲44.35%는 대상절이 "previously cast" / "did not previously cast"로
  //      갈려 둘 다 표에 없어 통째로 버려지고 있었다. 두 절은 여집합이고 값이 같으므로
  //      버스트 순서를 몰라도 아군 전원이 받는 것이 확정이다(실측: 등록 조합 214건 중
  //      크라운이 든 61건이 정확히 그만큼만 올랐다).
  //
  //      🔴 **처음에 실제 캐릭터로만 쟀다가 두 가지 고장을 놓쳤다.**
  //         ① 최솟값 대신 두 분기를 더하기 ② "양쪽에 다 있어야 한다"는 조건 없애기.
  //         ①은 크라운이 6.6% → 10.6%로 오를 뿐 리버렐리오는 그대로 0이라 안 걸렸고,
  //         ②는 `Math.min(x, undefined) = NaN`이 falsy라 조용히 아무것도 안 열려서 안 걸렸다.
  //         **두 안전장치가 서로를 가리고 있었다.**
  //      그래서 지금은 **합성 스킬 원문으로 규칙을 직접 시험한다.** 실제 데이터에 그 조합이
  //      없어도 규칙이 틀리면 잡힌다(원칙 4 — 판정 단위를 고장의 단위에 맞춘다).
  {
    checked += 1;
    const base = cdb.find((c) => c.title === 'Crown') || cdb[0];
    const mk = (descA, descB) => ({
      ...base, id: 'zz-fixture', title: 'ZZ Fixture',
      // ⚠️ **마지막 스킬은 버스트로 취급된다.** 스킬을 하나만 두면 가동률이 10/40 = 0.25로
      //    깎여 40%가 10%로 나온다(실제로 여기서 한 번 틀렸다). 더미 버스트를 뒤에 붙인다.
      skills: [{ name: 'f', type: 'Passive', cd: 'N/A',
        desc: `Affects all allies who previously cast their Burst Skills. ${descA} `
            + `Affects all allies who did not previously cast their Burst Skills. ${descB}` },
      { name: 'dummy', type: 'Active', cd: '40', desc: 'Affects self.' }],
    });
    const filler = cdb.filter((c) => c.title !== base.title && (c.skills || []).length).slice(0, 4);
    const reloadOf = (c) => scoreComposition([c, ...filler], { detail: true })
      .parts.find((x) => x.title === 'ZZ Fixture').ammo.reloadPct;

    // ① 값이 다르면 **작은 쪽만** 열려야 한다. 더하거나(100) 큰 쪽(60)이면 틀린 것이다.
    const both = reloadOf(mk('Reloading Speed ▲ 40% continuously.', 'Reloading Speed ▲ 60% continuously.'));
    if (Math.abs(both - 40) > 1e-6) {
      problems.push(`여집합 규칙이 최솟값을 안 쓴다 — 40%와 60%가 실린 두 분기에서 ${both.toFixed(2)}%가 나왔다(40이어야 한다)`);
    }
    // ② 한쪽에만 있으면 **아무것도** 열려선 안 된다.
    const oneSide = reloadOf(mk('Reloading Speed ▲ 40% continuously.', 'ATK ▲ 10% continuously.'));
    if (Math.abs(oneSide) > 1e-6) {
      problems.push(`여집합 규칙이 한쪽 분기에만 있는 값을 열었다(${oneSide.toFixed(2)}%) — 어느 분기인지 모르므로 확정인 몫이 없다`);
    }
    // ③ 두 분기가 다 있어야 한다. 한쪽 대상절만 나오면 여집합이 성립하지 않는다.
    const solo = { ...base, id: 'zz-fixture', title: 'ZZ Fixture',
      skills: [{ name: 'f', type: 'Passive', cd: 'N/A',
        desc: 'Affects all allies who previously cast their Burst Skills. Reloading Speed ▲ 40% continuously.' },
      { name: 'dummy', type: 'Active', cd: '40', desc: 'Affects self.' }] };
    const one = scoreComposition([solo, ...filler], { detail: true }).parts.find((x) => x.title === 'ZZ Fixture').ammo.reloadPct;
    if (Math.abs(one) > 1e-6) {
      problems.push(`여집합 짝이 하나뿐인데 규칙이 열렸다(${one.toFixed(2)}%) — 여집합이 성립하지 않으면 버려야 한다`);
    }

    // 실제 데이터에서의 크기 — 판정이 아니라 관측이다(위 ①②③가 판정).
    const gain = (t) => {
      const c = byTitle.get(t); if (!c) return null;
      const f = cdb.filter((x) => x.title !== t && (x.skills || []).length).slice(0, 4);
      const on = scoreComposition([c, ...f]).total;
      const off = scoreComposition([c, ...f], { assumptions: { COMPLEMENT_SCOPE: false } }).total;
      return (on / off - 1) * 100;
    };
    const gc = gain('Crown'); const gl = gain('Liberalio');
    if (gc == null || gc < COMPLEMENT_CROWN_MIN) {
      problems.push(`여집합 규칙으로 크라운 팀이 오르는 폭이 ${COMPLEMENT_CROWN_MIN}% → ${gc == null ? '측정 불가' : gc.toFixed(1) + '%'}로 줄었다`);
    }
    console.log(`  여집합 대상절 — 합성 시험 3종 통과 · 크라운 팀 +${gc == null ? '?' : gc.toFixed(1)}%`
      + ` · 리버렐리오(공통분모 없음) ${gl == null ? '?' : gl.toFixed(1)}%`);
  }

  // (6) **prydwen 보스 티어와의 순위상관 래칫.** (2026-09-03 · 2026-09-07 재는 값을 바꿈)
  //     ⚠️ 팀 버프는 여전히 안 본다(캐릭터 1명으로 점수를 내므로 남이 걸어주는 버프가 없다).
  //        **자기 버프는 이제 본다.**
  //
  //     🔴 2026-09-07까지 이 값은 `parts[].self`(평타+스킬)를 재고 있었다 — **자기 버프 배수가
  //        통째로 빠진 값이다.** 그래서 대상절 규칙 18종과 쿨타임 가동률을 넣었는데도 ρ가
  //        0.382에서 미동도 안 했다. 검사가 통과해서가 아니라 그 축을 안 재기 때문이었다.
  //        재는 값을 `parts[].value`(= self × 자기버프 배수)로 바꾸자 **ρ 0.382 → 0.579**로
  //        올랐다. 계산을 바꾼 게 아니라 **계측기를 고친 것**이다 — 같은 코드, 다른 측정.
  //
  //     그 덕에 버프를 건드리는 변경도 이제 ρ로 확인할 수 있다. 다만 **남이 걸어주는 버프는
  //     여전히 안 잡히므로** 순수 버퍼(자기 버프가 없는 서포터)는 이 지표에서 낮게 나온다.
  //     이 비교기에는 오랫동안 정답지가 없었다 — 솔로레이드 실측 avgDamage는 투자 상태가
  //     지배해 상관이 0.01이라 못 쓴다. 그런데 보스 티어와는 0.400이 나온다. 완벽한 정답은
  //     아니지만(사람의 종합 판단이다) **0에서 멀다는 것 자체가 신호**라 래칫으로 고정한다.
  //     이 값이 떨어지면 비교기를 나쁘게 바꾼 것이다.
  {
    checked += 1;
    const rows = cdb.filter((c) => TIER[c.tiers?.bossing])
      .map((c) => {
        const p = scoreComposition([c], { detail: true }).parts[0];
        return { s: p.value, self: p.self, t: TIER[c.tiers.bossing] };
      });
    const rank = (v) => {
      const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
      const out = Array(v.length);
      idx.forEach(([, i], k) => { out[i] = k + 1; });
      return out;
    };
    const n = rows.length;
    const ry = rank(rows.map((r) => r.t));
    const spearman = (xs) => {
      const rx = rank(xs);
      return 1 - (6 * rx.reduce((a, _, i) => a + (rx[i] - ry[i]) ** 2, 0)) / (n * (n * n - 1));
    };
    const rho = spearman(rows.map((r) => r.s));
    const rhoSelf = spearman(rows.map((r) => r.self));
    console.log(`  보스 티어 순위상관 ρ = ${rho.toFixed(3)} (${n}명, 기준선 ${TIER_RHO_BASELINE})`
      + ` · 자기버프를 뺀 옛 지표는 ${rhoSelf.toFixed(3)}`);
    if (rho < TIER_RHO_BASELINE - 0.03) {
      problems.push(`보스 티어 순위상관이 ${TIER_RHO_BASELINE} → ${rho.toFixed(3)}로 떨어졌다 — 비교기를 나쁘게 바꾼 것이다`);
    }
    if (rho > TIER_RHO_BASELINE + 0.03) {
      console.log(`  ✅ ρ가 올랐다. TIER_RHO_BASELINE을 ${rho.toFixed(2)}로 높일 것.`);
    }
  }

  // (7) 무기 타입 편향을 **매번 눈에 보이게** 찍는다. 실패시키지는 않는다 —
  //     이건 고칠 방법이 없는 알려진 결함이라(코어히트 적중률·락온 대상 수가 우리에게 없다)
  //     래칫으로 잠그면 오탐만 난다. 대신 숨기지 않는다. `docs/open-items.md` 참고.
  {
    const med = (a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
    const byW = ['sg', 'mg', 'smg', 'ar', 'sr', 'rl'].map((w) => {
      const g = cdb.filter((c) => c.weapon === w).map((c) => scoreComposition([c], { detail: true }).parts[0].self);
      return `${w.toUpperCase()} ${Math.round(med(g))}`;
    });
    console.log(`  무기 타입별 중앙값: ${byW.join(' · ')}  ⚠️ 타입이 다르면 비교 금지`);
  }

  const line = '─'.repeat(84);
  console.log(line);
  console.log(`단조성 검사 — ${checked}건`);
  console.log('  ⚠️ 이건 "맞다"의 증명이 아니라 "앞뒤가 맞다"의 확인이다.');
  console.log(line);
  if (problems.length) {
    console.log(`문제 ${problems.length}건\n`);
    problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    console.log('');
    process.exit(1);
  }
  console.log('문제 0건\n');
}

// ---------------------------------------------------------------------------
const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  return m ? m.split('=')[1] : d;
};

// 아래 CLI는 **직접 실행할 때만** 돈다. 가드가 없으면 scoreComposition을 import하는 것만으로
// selfTest가 통째로 돌고, 실패하면 process.exit(1)까지 한다 — 부르는 쪽이 죽는다.
// analyzeSkillTriggers.mjs에서 이미 한 번 밟은 함정이다(2026-09-02). 탐침이 이 모듈을
// 관측용으로 import하면서 다시 드러났다(2026-09-04).
const RUN_CLI = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (!RUN_CLI) { /* import 용도 — 아래 CLI를 건너뛴다 */ } else if (process.argv.includes('--selftest')) {
  selfTest();
} else if (arg('team', null)) {
  const members = arg('team', '').split(',').map((t) => byTitle.get(t.trim()));
  if (members.some((m) => !m)) {
    console.error('이름을 못 찾음:', arg('team', '').split(',').filter((t) => !byTitle.get(t.trim())).join(', '));
    process.exit(1);
  }
  const r = scoreComposition(members, { detail: true });
  console.log(`상대 점수 ${r.total.toFixed(0)}  (절대값에 의미 없음 — 조합끼리 비교용)`);
  console.log(`적 받는 데미지 ▲ 합: ${r.dmgTaken.toFixed(1)}%`);
  r.parts.forEach((p) => {
    const nz = Object.entries(p.buckets).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v.toFixed(0)}%`).join(' · ');
    console.log(`  ${p.kr.padEnd(22)} 평타 ${String(p.normal.toFixed(0)).padStart(7)}  스킬 ${String(p.skill.toFixed(0)).padStart(6)}  배수 ${p.mult.toFixed(2)}  → ${String(p.value.toFixed(0)).padStart(7)}`);
    if (nz) console.log(`  ${' '.repeat(22)} ${nz}`);
  });
  if (r.notes.length) { console.log('\n해석 못 해 버린 대상절:'); [...new Set(r.notes)].slice(0, 8).forEach((n) => console.log('  ·', n)); }
} else {
  selfTest();
}
