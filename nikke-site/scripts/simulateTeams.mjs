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
  // 풀버스트 한 사이클(초). "사이클마다" 계열 스킬의 초당 발동 횟수를 여기서 나눈다.
  // ⚠️ 게임의 표준 주기이지만 우리가 정한 값이다 — 실제로는 팀 구성·재진입에 따라 달라진다.
  BURST_CYCLE_SEC: 20,
  // 전투 길이(초). "전투 시작 1회" 계열을 초당으로 환산할 때만 쓴다.
  // ⚠️ 솔로레이드는 180초, 캠페인은 훨씬 짧다. 우리가 정한 값이다.
  BATTLE_SEC: 180,
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
const SELF_COEF = /(\d[\d.]*)%\s*of final ATK as (?:damage|Burst Skill damage|Additional Damage)/ig;
const DURATION = /for (\d[\d.]*) sec/i;

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
  const t = c.weapon;
  const rate = weapons.fireRate?.perSecond?.[t];
  if (rate) return rate;
  const ch = weapons.fireRate?.chargeWeapons?.shortChargeSec;
  return ch ? 1 / ch : null;   // sr·rl
}

// 평타 기여(초당). 기본 공격력 × 1발당 계수 × 초당 발사 수.
// **이것이 없어서 모더니아가 3점이었다** — 그의 딜은 평타에서 나온다(MG 7.71% × 50발/초).
function normalAttackDps(c) {
  const w = WEAPON_BY_OWNER.get(c.title);
  const coef = w?.shotCoefPct ?? medianOf(c.weapon, 'shotCoefPct');
  const rate = shotsPerSec(c);
  if (!coef || !rate) return 0;
  return atkFactor(c) * coef * rate;
}

// 그 절이 초당 몇 번 터지는가. **분류 못 한 계열은 0으로 둔다 — 없는 빈도를 만들지 않는다.**
function freqPerSec(cls, nShots, c, A) {
  const rate = shotsPerSec(c) || 0;
  const w = WEAPON_BY_OWNER.get(c.title);
  const cap = w?.capacity ?? medianOf(c.weapon, 'capacity');
  const rel = w?.reloadSec ?? medianOf(c.weapon, 'reloadSec');
  const ch = weapons.fireRate?.chargeWeapons?.shortChargeSec || 1.25;
  switch (cls) {
    case 'perCycle':    return 1 / A.BURST_CYCLE_SEC;
    case 'perShots':    return nShots > 0 ? rate / nShots : rate;
    case 'perCharge':   return 1 / ch;
    case 'perReload':   return (cap && rate) ? 1 / (cap / rate + (rel || 0)) : 0;
    case 'once':
    case 'battleStart': return 1 / A.BATTLE_SEC;
    default:            return 0;   // onHp·onKill·onHit·미분류 — 빈도를 알 수 없다
  }
}

// 스킬 딜(초당). 계수를 **그 절의 발동 빈도로 곱해서** 더한다.
// 예전에는 그냥 더해서 "평타마다 3.05%"와 "버스트마다 2808%"가 같은 자리에 들어갔다.
function skillDps(c, A) {
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
        const n = m[1].match(/(\d+)\s*time\(s\)|(\d+)\s*normal attacks?/i);
        nShots = n ? Number(n[1] || n[2]) : 1;
        return;
      }
      const coef = sumRe(cl, SELF_COEF);
      if (!coef) return;
      total += coef * freqPerSec(cls, nShots, c, A);
    });
  });
  return atkFactor(c) * total;
}

const burstCd = (c) => {
  const s = (c.skills || [])[(c.skills || []).length - 1];
  const n = Number(s?.cd);
  return Number.isFinite(n) && n > 0 ? n : 40;
};

// 그 절의 대상이 누구인가 → 팀에서 실제로 받는 멤버 목록
function targetsOf(scope, caster, members) {
  const s = (scope || '').toLowerCase().trim();
  if (/^all allies$/.test(s)) return members;
  if (/^self$/.test(s)) return [caster];
  const el = s.match(/^all (fire|water|wind|iron|electric) code all(?:y|ies)$/);
  if (el) return members.filter((m) => (m.element || '').toLowerCase() === el[1]);
  const cl = s.match(/^all (attacker|defender|supporter) all(?:y|ies)$/);
  if (cl) return members.filter((m) => (m.class || '').toLowerCase() === cl[1]);
  return null; // 해석 못 한 대상절은 **버린다** — 없는 근거를 만들지 않는다
}

/**
 * 조합 점수. 절대값에 의미 없음 — 같은 모드끼리의 비교에만 쓴다.
 * detail:true 면 어떤 항이 얼마나 기여했는지 함께 돌려준다.
 */
export function scoreComposition(members, opts = {}) {
  const A = { ...ASSUMPTIONS, ...(opts.assumptions || {}) };
  // 멤버별 · 통별 버프 합(%)
  const buffOn = new Map(members.map((m) => [m.id, Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0]))]));
  let dmgTaken = 0;
  const notes = [];

  members.forEach((caster) => {
    (caster.skills || []).forEach((sk, idx) => {
      const isBurst = idx === (caster.skills || []).length - 1;
      const dur = (sk.desc || '').match(DURATION);
      // 가동률: 버스트 스킬이면 지속/쿨, 패시브면 1.0
      const uptime = isBurst
        ? Math.min(1, (dur ? parseFloat(dur[1]) : 10) / burstCd(caster))
        : A.PASSIVE_UPTIME;
      let scope = null;
      clauses(sk.desc).forEach((cl) => {
        const aff = cl.match(/^Affects\s+(.+?)\.?$/i);
        if (aff) { scope = aff[1]; return; }
        if (!scope) return;
        let anyBuff = false;
        BUCKET_KEYS.forEach((k) => {
          const v = sumRe(cl, BUFF_BUCKETS[k]);
          if (!v) return;
          anyBuff = true;
          const tg = targetsOf(scope, caster, members);
          if (tg) tg.forEach((m) => { buffOn.get(m.id)[k] += v * uptime; });
          else notes.push(`대상절 해석 못 함(버림): "${scope}"`);
        });
        void anyBuff;
        const dt = sumRe(cl, DMG_TAKEN);
        if (dt) dmgTaken += dt * uptime;
      });
    });
  });

  let total = 0;
  const parts = members.map((m) => {
    // 초당 기여 = 평타 + 스킬(빈도 반영). 둘 다 기본 공격력 보정이 들어가 있다.
    const na = normalAttackDps(m);
    const sd = skillDps(m, A);
    const self = na + sd;
    const b = buffOn.get(m.id);
    // 통 안에서는 더하고, 통끼리는 곱한다.
    const mult = BUCKET_KEYS.reduce((a, k) => a * (1 + b[k] / 100), 1);
    const v = self * mult;
    total += v;
    return { title: m.title, kr: m.name_kr || m.title, self, normal: na, skill: sd, buckets: b, mult, value: v };
  });
  total *= (1 + dmgTaken / 100);

  return opts.detail ? { total, dmgTaken, parts, notes } : { total };
}

// ---------------------------------------------------------------------------
// 단조성 검사 — 실측이 없으니 "앞뒤가 맞는가"만 확인한다.
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
      const aff = cl.match(/^Affects\s+(.+?)\.?$/i); if (aff) { scope = aff[1]; return; }
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
      const aff = cl.match(/^Affects\s+(.+?)\.?$/i); if (aff) { scope = aff[1]; return; }
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
if (process.argv.includes('--selftest')) {
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
