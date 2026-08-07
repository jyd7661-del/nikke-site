#!/usr/bin/env node
/**
 * 니케 사이트 데이터 정합성 검사기
 *
 * 사용법: nikke-site/scripts/checkData.js 로 저장 후
 *   node scripts/checkData.js
 *
 * 왜 필요한가:
 * 2026-08-07, characterInvestmentNotes.json의 레드 후드 항목에 "characterDatabase.json 기준
 * 버스트 단계가 'all'이다"라는 근거로 totemRole:true가 등록돼 있었는데, 실제 DB에는 burst가
 * '3'으로 되어 있어 근거 자체가 사실과 달랐다. 유저가 게임 지식으로 직접 지적해서야 발견됐다.
 *
 * 이런 유형의 오류는 런타임에 에러를 내지 않고 "조용히 잘못된 결과"를 만들기 때문에 가장 위험하다.
 * 특히 데이터 파일 사이의 '이름 불일치'는 그 데이터가 통째로 무시되는데도 아무 경고가 없다.
 *
 * 이 스크립트는 사람 판단 없이 기계적으로 확인 가능한 것만 검사한다.
 *   ERROR = 기능이 조용히 죽어 있음. 반드시 고쳐야 함 (exit code 1)
 *   WARN  = 사람이 눈으로 확인해야 하는 의심 항목
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const cdb = read('characterDatabase.json');
const notes = read('characterInvestmentNotes.json');
const syn = read('synergyNotes.json');
const meta = read('metaStats.json');
const treasure = read('treasureEffects.json');

const errors = [];
const warns = [];
const err = (code, msg) => errors.push({ code, msg });
const warn = (code, msg) => warns.push({ code, msg });

const TITLES = new Set(cdb.map((c) => c.title));
const IDS = new Set(cdb.map((c) => c.id));
const BY_TITLE = new Map(cdb.map((c) => [c.title, c]));

// 이름이 안 맞을 때 "혹시 이걸 의도했나"를 제안 (레벤슈타인 거리 기반)
function suggest(name) {
  const dist = (a, b) => {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j += 1) m[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return m[a.length][b.length];
  };
  let best = null;
  let bestD = Infinity;
  TITLES.forEach((t) => {
    const d = dist(name.toLowerCase(), t.toLowerCase());
    if (d < bestD) { bestD = d; best = t; }
  });
  // 너무 동떨어진 제안은 오히려 혼란을 주므로 억제
  return bestD <= Math.max(3, Math.floor(name.length * 0.5)) ? ` (혹시 '${best}'?)` : '';
}

// ---------------------------------------------------------------------------
// 1. characterDatabase.json 자체 건전성
// ---------------------------------------------------------------------------
cdb.forEach((c) => {
  if (!(c.skills || []).length) {
    err('NO_SKILLS',
      `${c.title}(${c.name_kr})의 스킬 데이터가 비어 있음 — 버스트 쿨타임을 못 읽어서 ` +
      `findWastedBurstMembers()가 이 캐릭터가 속한 버스트 단계 전체의 낭비 판정을 스킵함`);
  }
  if (!['1', '2', '3'].includes(String(c.burst))) {
    err('BAD_BURST', `${c.title}의 burst 값이 '${c.burst}' — 1/2/3 중 하나여야 함`);
  }
});

const dupIds = cdb.map((c) => c.id).filter((v, i, a) => a.indexOf(v) !== i);
if (dupIds.length) err('DUP_ID', `characterDatabase.json에 중복 id: ${[...new Set(dupIds)].join(', ')}`);

// ---------------------------------------------------------------------------
// 2. 다른 파일들이 참조하는 캐릭터 이름이 실재하는가
//    (여기서 걸리는 항목은 전부 "그 데이터가 통째로 무시되고 있다"는 뜻)
// ---------------------------------------------------------------------------
notes.characters.forEach((n) => {
  if (!TITLES.has(n.name)) {
    err('NOTE_ORPHAN',
      `characterInvestmentNotes.json의 '${n.name}'(${n.name_kr || '?'})이 characterDatabase.json에 없음` +
      `${suggest(n.name)} — 이 캐릭터의 투자/토템 정보가 전혀 적용되지 않음`);
  }
});

(syn.synergyPairs || []).forEach((p) => {
  (p.members || []).forEach((m) => {
    if (!TITLES.has(m)) {
      err('PAIR_ORPHAN',
        `synergyNotes.json synergyPairs의 '${m}'이 characterDatabase.json에 없음${suggest(m)}` +
        ` — 이 페어 시너지는 절대 발동하지 않음`);
    }
  });
});

const archOrphans = new Set();
syn.archetypes.forEach((a) => {
  (a.members || []).forEach((m) => { if (!TITLES.has(m)) archOrphans.add(m); });
});
archOrphans.forEach((m) => {
  const affected = syn.archetypes.filter((a) => (a.members || []).includes(m)).length;
  err('ARCH_ORPHAN',
    `synergyNotes.json archetypes의 '${m}'이 characterDatabase.json에 없음${suggest(m)}` +
    ` — 이 이름을 쓰는 아키타입 ${affected}개는 절대 매칭되지 않음`);
});

const metaTitles = new Set();
Object.values(meta.usageTier || {}).forEach((slice) => Object.keys(slice).forEach((t) => metaTitles.add(t)));
(meta.campaignCompositions?.list || []).forEach((c) => (c.members || []).forEach((m) => metaTitles.add(m)));
Object.values(meta.pvp || {}).forEach((arr) => (arr || []).forEach((e) => (e.members || []).forEach((m) => metaTitles.add(m))));
Object.values(meta.soloRaidByElement || {}).forEach((t) => (t.entries || []).forEach((e) => metaTitles.add(e.title)));
metaTitles.forEach((t) => {
  if (!TITLES.has(t)) {
    err('META_ORPHAN',
      `metaStats.json의 '${t}'이 characterDatabase.json에 없음${suggest(t)}` +
      ` — 이 캐릭터의 실사용 픽률/승률 데이터가 무시됨`);
  }
});

treasure.characters.forEach((t) => {
  if (!IDS.has(t.characterId)) {
    err('TREASURE_ORPHAN', `treasureEffects.json의 characterId '${t.characterId}'가 characterDatabase.json에 없음`);
  }
});

// ---------------------------------------------------------------------------
// 3. 노트의 주장 vs 실제 DB 값 (레드 후드 유형 탐지)
// ---------------------------------------------------------------------------
const burstCd = (c) => {
  const s = c.skills || [];
  const b = s[s.length - 1];
  const n = b && b.cd != null ? Number(b.cd) : NaN;
  return Number.isFinite(n) ? n : null;
};

notes.characters.forEach((n) => {
  const c = BY_TITLE.get(n.name);
  if (!c) return;

  const text = [n.totemNote, n.treasureNote, n.investmentProfile, n.notes].filter(Boolean).join(' ');
  if (!text) return;

  // 이미 사람이 검토해 정정 기록을 남긴 항목은 과거 오류 문구를 '인용'하므로 검사 대상에서 제외
  const isCorrectionRecord = /정정|수정 기록|사실과 다름/.test(n.notes || '');

  if (!isCorrectionRecord && /버스트\s*단계가\s*['"]?all|burst\s*가?\s*['"]all['"]/i.test(text)) {
    err('BURST_ALL_CLAIM',
      `${n.name}: 노트가 버스트='all'이라고 주장하지만 실제 characterDatabase.json 값은 '${c.burst}'` +
      ` — 레드 후드와 동일한 유형의 허위 근거`);
  }

  // "버스트10"(스킬 레벨)을 "버스트 1"로 오독하지 않도록 뒤에 숫자가 더 붙으면 제외.
  // 팀 편성 맥락("1버스트 조합", "버스트2 슬롯의 다른 캐릭터")과 자기 자신에 대한 서술을
  // 기계적으로 구분할 수 없으므로 ERROR가 아니라 WARN으로만 보고한다.
  const claims = new Set(
    [...text.matchAll(/버스트\s*([1-3])(?![0-9])\s*(?:단계|슬롯)/g)].map((m) => m[1])
  );
  if (claims.size && !claims.has(String(c.burst)) && !isCorrectionRecord) {
    warn('BURST_CLAIM',
      `${n.name}: 노트가 '버스트 ${[...claims].join('/')}단계'를 언급하는데 본인은 버스트 ${c.burst}` +
      ` — 팀 동료를 가리키는 표현일 수 있으니 확인 필요`);
  }

  const real = burstCd(c);
  const cds = [...text.matchAll(/쿨타임\s*([\d.]+)\s*초/g)].map((m) => parseFloat(m[1]));
  if (real !== null && cds.length && !cds.includes(real)) {
    warn('CD_CLAIM',
      `${n.name}: 노트에 언급된 쿨타임(${cds.join('/')}초)에 실제 버스트 쿨타임 ${real}초가 없음` +
      ` — 동료 캐릭터의 쿨타임일 수 있으니 확인 필요`);
  }
});

// ---------------------------------------------------------------------------
// 4. 커버리지 구멍 / 중복
// ---------------------------------------------------------------------------
const needTreasure = notes.characters.filter((n) => n.treasureRequired);
const haveTreasure = new Set(treasure.characters.map((t) => t.characterId));
const missingTreasure = needTreasure.filter((n) => {
  const c = BY_TITLE.get(n.name);
  return c && !haveTreasure.has(c.id);
});
if (missingTreasure.length) {
  warn('TREASURE_GAP',
    `treasureRequired:true인 캐릭터 ${needTreasure.length}명 중 ${missingTreasure.length}명이 ` +
    `treasureEffects.json에 없어 애장품 점수가 반영되지 않음 ` +
    `(UI에는 '(애장품)'이 표시되므로 표시와 실제 로직이 어긋남): ` +
    missingTreasure.map((n) => n.name).join(', '));
}

const seen = new Map();
let dupArch = 0;
syn.archetypes.forEach((a) => {
  const key = `${a.mode}|${(a.members || []).slice().sort().join(',')}`;
  if (seen.has(key)) dupArch += 1; else seen.set(key, a.name);
});
if (dupArch) warn('DUP_ARCHETYPE', `아키타입 ${syn.archetypes.length}개 중 ${dupArch}개가 (모드+멤버) 완전 중복`);

syn.archetypes.forEach((a) => {
  const m = a.members || [];
  if (m.length !== new Set(m).size) err('ARCH_SELF_DUP', `아키타입 '${a.name}'에 같은 캐릭터가 중복 포함됨`);
});

// 토템 주장에 출처가 있는가 (레드 후드 재발 방지)
notes.characters.filter((n) => n.totemRole).forEach((n) => {
  if (!/출처|arca\.live|prydwen|tistory|enikk|namu|유저 확인/i.test(n.totemNote || '')) {
    warn('TOTEM_NO_SOURCE',
      `${n.name}의 totemRole에 출처 표기가 없음 — 레드 후드처럼 근거 없이 등록된 항목일 수 있음`);
  }
});

// ---------------------------------------------------------------------------
// 5. 형식(shape) 검사 — 대조할 기존 자료가 없는 "새 데이터"에도 작동하는 유일한 자동 검증
//
// 유저 지적: "새로운 데이터니까 기존 자료를 참고할 수도 없잖아" — 맞는 지적이다. 신규 캐릭터의
// 스킬 수치가 실제로 맞는지는 자동으로 확인할 방법이 없다. 그건 "1차 출처의 값을 그대로
// 옮겼는가"라는 절차로만 담보된다(scripts 밖의 문제).
//
// 다만 "버스트는 1/2/3", "스킬은 3개", "쿨타임은 숫자" 같은 구조적 규칙은 비교 대상 없이도
// 검사할 수 있다. 그리고 실제로 데이터를 새로 채우다 나는 사고의 상당수는 값이 틀린 게 아니라
// 필드가 비거나 형식이 깨지는 쪽이다(예: 라플라스: 얼티밋 히어로 — 항목만 만들어지고 skills가
// 빈 배열로 남아 엔진의 버스트 낭비 판정이 통째로 스킵되고 있었다). 여기서는 그것만 잡는다.
//
// 유효 범위는 정상적인 기존 캐릭터들에서 귀납적으로 추출한 값이다.
const DOMAIN = {
  element: ['fire', 'iron', 'wind', 'water', 'electric'],
  burst: ['1', '2', '3'],
  class: ['attacker', 'supporter', 'defender'],
  weapon: ['ar', 'sg', 'sr', 'rl', 'mg', 'smg'],
  tierKeys: ['story', 'bossing', 'pvp'],
  grades: ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'],
  skillType: ['Passive', 'Active'],
  burstCd: ['20', '40', '60'],
};
const REQUIRED_TOP = ['id', 'title', 'name_kr', 'class', 'burst', 'element', 'weapon', 'tiers', 'skills'];

const seenTitle = new Set();
cdb.forEach((c) => {
  const who = (c.title || '(title 없음)') + '(' + (c.name_kr || '?') + ')';

  REQUIRED_TOP.forEach((f) => {
    const v = c[f];
    if (v === undefined || v === null || v === '') {
      err('SHAPE_MISSING', who + ": 필수 필드 '" + f + "' 누락");
    }
  });

  if (seenTitle.has(c.title)) {
    err('SHAPE_DUP_TITLE', "title '" + c.title + "'이 중복 — 조회 시 뒤 항목이 앞 항목을 덮어씀");
  } else {
    seenTitle.add(c.title);
  }

  // 값 자체는 맞아도 대소문자가 다르면 조회 키로 쓸 때 조용히 어긋난다 (예: 'Fire' vs 'fire').
  ['element', 'class', 'weapon'].forEach((f) => {
    const v = c[f];
    if (v === undefined || DOMAIN[f].includes(v)) return;
    if (DOMAIN[f].includes(String(v).toLowerCase())) {
      warn('SHAPE_CASE', who + ': ' + f + "='" + v + "' — 다른 캐릭터는 소문자('" + String(v).toLowerCase() + "')를 쓰므로 표기 통일 필요");
    } else {
      err('SHAPE_DOMAIN', who + ': ' + f + "='" + v + "'은(는) 허용되지 않는 값 (" + DOMAIN[f].join('/') + ')');
    }
  });

  if (c.burst !== undefined && !DOMAIN.burst.includes(String(c.burst))) {
    err('SHAPE_DOMAIN', who + ": burst='" + c.burst + "' — 1/2/3 중 하나여야 함");
  }

  const t = c.tiers || {};
  DOMAIN.tierKeys.forEach((k) => {
    if (t[k] === undefined) {
      err('SHAPE_TIER', who + ': tiers.' + k + ' 누락 — 그 모드에서 티어 점수가 0으로 계산됨');
    } else if (!DOMAIN.grades.includes(t[k])) {
      err('SHAPE_TIER', who + ': tiers.' + k + "='" + t[k] + "'은(는) 허용 등급이 아님");
    }
  });

  const sk = c.skills || [];
  if (sk.length === 0) return; // 이미 NO_SKILLS로 보고됨
  if (sk.length !== 3) {
    err('SHAPE_SKILL_COUNT', who + ': 스킬이 ' + sk.length + '개 — 정상 캐릭터는 전부 3개(스킬1/스킬2/버스트)');
  }
  sk.forEach((s, i) => {
    ['name', 'type', 'desc'].forEach((f) => {
      if (!s[f]) err('SHAPE_SKILL_FIELD', who + ': ' + (i + 1) + "번째 스킬의 '" + f + "'이(가) 비어 있음");
    });
    if (s.type && !DOMAIN.skillType.includes(s.type)) {
      err('SHAPE_SKILL_FIELD', who + ': ' + (i + 1) + "번째 스킬 type='" + s.type + "' — Passive/Active만 허용");
    }
  });

  // 버스트 스킬(마지막)의 쿨타임은 낭비 판정·풀버스트 계산에 직접 쓰이는 값이라 특히 중요하다.
  const burstSkill = sk[sk.length - 1];
  if (burstSkill) {
    const cd = burstSkill.cd;
    if (cd === undefined || cd === null || cd === '' || Number.isNaN(Number(cd))) {
      err('SHAPE_BURST_CD', who + ": 버스트 스킬 쿨타임이 숫자가 아님(cd='" + cd + "') — findWastedBurstMembers가 이 버스트 단계 판정을 통째로 건너뜀");
    } else if (!DOMAIN.burstCd.includes(String(cd))) {
      warn('SHAPE_BURST_CD', who + ': 버스트 쿨타임 ' + cd + '초 — 기존 캐릭터는 전부 20/40/60초라 오타 가능성 있음');
    }
  }
});

// ---------------------------------------------------------------------------
// 리포트
// ---------------------------------------------------------------------------
const line = '─'.repeat(72);
console.log(`\n${line}\n니케 데이터 정합성 검사`);
console.log(`캐릭터 ${cdb.length}명 / 투자노트 ${notes.characters.length}건 / 아키타입 ${syn.archetypes.length}개`);
console.log(line);

if (errors.length) {
  console.log(`\n❌ ERROR ${errors.length}건 — 기능이 조용히 죽어 있음\n`);
  errors.forEach((e, i) => console.log(`  ${String(i + 1).padStart(2)}. [${e.code}] ${e.msg}`));
}
if (warns.length) {
  console.log(`\n⚠️  WARN ${warns.length}건 — 사람이 확인 필요\n`);
  warns.forEach((w, i) => console.log(`  ${String(i + 1).padStart(2)}. [${w.code}] ${w.msg}`));
}
if (!errors.length && !warns.length) console.log('\n✅ 문제 없음\n');

console.log(`\n${line}`);
console.log(`ERROR ${errors.length} / WARN ${warns.length}`);
console.log(line + '\n');

process.exit(errors.length ? 1 : 0);
