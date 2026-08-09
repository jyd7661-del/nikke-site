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
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const cdb = read('characterDatabase.json');
const notes = read('characterInvestmentNotes.json');
const syn = read('synergyNotes.json');
const meta = read('metaStats.json');
const treasure = read('treasureEffects.json');
const freshness = read('dataFreshness.json');

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
  //
  // 2026-08-08 보완: "버스트 N단계에 진입"은 팀의 버스트 체인이 N단계로 넘어가는 순간을 가리키는
  // 표현이라 그 캐릭터 자신의 버스트 단계와는 무관하다. 게임 스킬 발동 조건에 흔히 쓰이는 문구인데
  // (예: 마스트: 로망틱 메이드 1스킬 "버스트 1단계에 진입할 때마다 취기 1스택") 이걸 계속 오탐으로
  // 잡아서, 정작 진짜 허위 주장(레드 후드 유형)이 묻힐 위험이 있었다. 이 형태는 제외한다.
  const claimText = text.replace(/버스트\s*[1-3]\s*단계에?\s*진입/g, '');
  const claims = new Set(
    [...claimText.matchAll(/버스트\s*([1-3])(?![0-9])\s*(?:단계|슬롯)/g)].map((m) => m[1])
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
    `treasureEffects.json에 없어, 추천 근거 문장에 애장품 내용이 전혀 등장하지 않음 ` +
    `(UI에는 '(애장품)'이 해당 캐릭터 전원에게 표시되므로 표시와 실제 설명이 어긋남). ` +
    `참고: 조합 순위에 반영되는 것은 characterInvestmentNotes의 treasureRequired다 ` +
    `(애장품 미장착 시 해당 캐릭터의 유효 티어를 한 등급 낮춤 — synergyEngine의 tierScore 참고). ` +
    `treasureEffects.json의 scoreBonus는 순위에 영향이 없고, 이 파일은 설명 문장 생성에만 쓰인다: ` +
    missingTreasure.map((n) => n.name).join(', '));
}

// 2026-08-08 수정: 중복 판정 키에 flexSlots를 넣는다.
// 예전 키는 (모드+멤버)뿐이라, 고정 멤버는 같지만 자유 슬롯 조건이 다른 별개의 조합까지
// 중복으로 셌다 — El-Macho(B1-CDR,B3,B3)와 El Ma-chor(B1,B3,B3)는 1버스트에 쿨감을
// 요구하느냐 아니냐가 달라 서로 다른 조합이다. 실제 중복 33건은 병합해서 없앴고, 남는 것은
// 이런 정상적인 변형뿐이므로 키를 정확하게 고쳐 경고가 계속 울리지 않게 한다.
const seen = new Map();
const dupNames = [];
syn.archetypes.forEach((a) => {
  const key = `${a.mode}|${(a.members || []).slice().sort().join(',')}|${(a.flexSlots || []).slice().sort().join(',')}`;
  if (seen.has(key)) dupNames.push(`'${a.name}' = '${seen.get(key)}'`); else seen.set(key, a.name);
});
if (dupNames.length) {
  warn('DUP_ARCHETYPE',
    `아키타입 ${syn.archetypes.length}개 중 ${dupNames.length}개가 (모드+멤버+자유슬롯) 완전 중복 — ` +
    `같은 조합이 두 번 추천될 수 있다. 이름은 aliases로, 설명은 note에 합쳐 하나로 정리할 것: ` +
    dupNames.slice(0, 5).join(', '));
}

syn.archetypes.forEach((a) => {
  const m = a.members || [];
  if (m.length !== new Set(m).size) err('ARCH_SELF_DUP', `아키타입 '${a.name}'에 같은 캐릭터가 중복 포함됨`);
});

// 토템 주장에 출처가 있는가 (레드 후드 재발 방지)
notes.characters.filter((n) => n.totemRole).forEach((n) => {
  // '스킬 원문 근거'는 외부 공략 출처는 없지만 characterDatabase의 스킬 원문에서 직접 끌어낸
  // 판단이라는 표시다. 근거 없이 등록된 것과는 구분되므로 통과시키되, 반드시 명시해야 한다.
  if (!/출처|arca\.live|prydwen|tistory|enikk|namu|inven|인벤|유저 확인|스킬 원문 근거/i.test(n.totemNote || '')) {
    warn('TOTEM_NO_SOURCE',
      `${n.name}의 totemRole에 근거 표기가 없음 — 레드 후드처럼 근거 없이 등록된 항목일 수 있음. ` +
      `외부 공략 출처를 적거나, 스킬 원문에서 끌어낸 판단이면 '[스킬 원문 근거]'라고 밝힐 것`);
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
  // 2026-08-08 추가. prydwen.gg 티어리스트가 캐릭터 아이콘에 붙여둔 특수 표시를 그대로 옮긴 값.
  // 원문 범례:
  //   invest  ($)  heavy investment is required to play the character at their full potential
  //   partner (📣) this unit can only shine (or improves dramatically) if a specific unit is in
  //                the team or she is in specific teams
  //   expert  (🌀) this unit requires high manual skill to be viable
  //   limited (🕐) is a limited character that isn't available in the general pool
  // (treasure 표시는 우리 쪽에서 이미 characters.js의 hasTreasure로 다루므로 여기 넣지 않는다)
  prydwenTag: ['invest', 'partner', 'expert', 'limited'],
};
const REQUIRED_TOP = ['id', 'title', 'name_kr', 'class', 'burst', 'element', 'weapon', 'tiers', 'skills'];
const todayISO = new Date().toISOString().slice(0, 10);

// prydwenTags(고투자/파트너 의존 등 특수 표시)는 prydwen 티어리스트를 긁어 넣은 값이라,
// 마지막 수집 이후에 나온 캐릭터는 태그가 '없는' 게 아니라 '아직 안 긁힌' 것이다. 둘은 구분이
// 안 되므로 출시일로 판별한다 — 이 경고가 뜨면 티어리스트를 다시 긁고 asOf를 갱신해야 한다.
{
  const asOf = freshness?.characterDatabase?.asOf;
  if (asOf) {
    const newer = cdb.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.releaseDate || '') && c.releaseDate > asOf);
    if (newer.length) {
      warn('TAGS_MAYBE_STALE',
        `characterDatabase.asOf(${asOf}) 이후에 출시된 캐릭터가 ${newer.length}명 있음 — ` +
        `prydwen 특수 표시(prydwenTags)가 아직 수집되지 않았을 수 있다. 티어리스트를 다시 긁고 asOf를 갱신할 것: ` +
        newer.map((c) => `${c.title}(${c.releaseDate})`).join(', '));
    }
  }
}

// totemCondition(속성 한정 토템) 검증. 2026-08-07 추가.
// 아니스: 스파클링 서머나 일레그: 붐 앤 쇼크처럼 아군 버프가 특정 속성에게만 들어가는 토템은
// totemCondition으로 조건을 건다. 여기서 오타가 나면 조건이 조용히 '항상 거짓'이 되어 그
// 캐릭터가 영영 토템 대접을 못 받게 되므로(= 조용한 누락, 우리가 가장 자주 당한 유형) ERROR다.
notes.characters.filter((n) => n.totemCondition).forEach((n) => {
  const cond = n.totemCondition;
  if (!n.totemRole) {
    warn('TOTEM_COND_ORPHAN', `${n.name}: totemRole이 없는데 totemCondition만 있음 — 아무 효과도 없는 설정`);
  }
  if (!cond.element) return;
  if (!DOMAIN.element.includes(cond.element)) {
    err('TOTEM_COND_ELEMENT',
      `${n.name}의 totemCondition.element='${cond.element}'가 유효하지 않음 — ` +
      `${DOMAIN.element.join('/')} 중 하나여야 하며, 어긋나면 이 캐릭터는 토템으로 인정받지 못한다`);
    return;
  }
  // 조건으로 적은 속성이 실제 스킬 원문의 적용 범위와 맞는지 확인한다.
  const c = cdb.find((x) => x.title === n.name);
  if (!c) return;
  const nonBurst = (c.skills || []).slice(0, -1).map((s) => s.desc || '').join(' ');
  const codeWord = { electric: 'Electric', water: 'Water', fire: 'Fire', wind: 'Wind', iron: 'Iron' }[cond.element];
  if (!new RegExp(`all ${codeWord} Code allies`, 'i').test(nonBurst)) {
    warn('TOTEM_COND_MISMATCH',
      `${n.name}: totemCondition에 '${cond.element}' 한정이라 적었는데 비버스트 스킬 원문에 ` +
      `'all ${codeWord} Code allies' 표현이 없음 — 조건이 실제 스킬과 어긋났을 수 있음`);
  }
});

// ---------------------------------------------------------------------------
// 상수 표류 검사 (2026-08-08 추가)
//
// scripts/findTotems.mjs는 "실사용 조합에서 버스트 순번에 밀리는 인원"을 찾아 누락된 토템을
// 검출하는데, 그 판정을 하려면 엔진과 똑같은 규칙이 필요하다. 엔진(lib/synergyEngine.js)은
// Next.js 전용 import 문법을 써서 일반 node 스크립트가 그대로 불러올 수 없어, 어쩔 수 없이
// 상수를 복사해 두었다. 한쪽만 고치면 검출 결과가 조용히 어긋나므로(경고도 안 뜨고 그냥
// 다른 답이 나온다) 두 파일의 값을 직접 대조한다.
const readSrc = (rel) => {
  try { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); } catch { return null; }
};
const engineSrc = readSrc('lib/synergyEngine.js');
const totemSrc = readSrc('scripts/findTotems.mjs');
if (engineSrc && totemSrc) {
  const grab = (src, name) => {
    const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
    return m ? m[1] : null;
  };
  ['FAST_BURST_CD', 'ALTERNATE_BURST_CD'].forEach((name) => {
    const a = grab(engineSrc, name);
    const b = grab(totemSrc, name);
    if (a === null || b === null) {
      warn('CONST_DRIFT', `${name}을(를) 두 파일 중 한쪽에서 찾지 못함 — 상수 이름이 바뀌었는지 확인할 것`);
    } else if (a !== b) {
      err('CONST_DRIFT',
        `${name}이(가) 어긋남: lib/synergyEngine.js=${a} vs scripts/findTotems.mjs=${b} — ` +
        `토템 검출이 엔진과 다른 기준으로 돌아 잘못된 후보를 내놓는다`);
    }
  });
  // 티어 점수표도 같은 이유로 복사돼 있다.
  // 한쪽은 여러 줄, 한쪽은 한 줄로 적혀 있고 후행 쉼표 유무도 달라서, 공백과 쉼표를 정규화한
  // 뒤 '키:값' 집합으로 비교한다. (그냥 문자열 비교하면 서식 차이만으로 오탐이 난다)
  const grabTiers = (src) => {
    const m = src.match(/TIER_SCORE\s*=\s*\{([^}]*)\}/);
    if (!m) return null;
    return m[1].replace(/\s/g, '').split(',').filter(Boolean).sort().join(',');
  };
  const ta = grabTiers(engineSrc);
  const tb = grabTiers(totemSrc);
  if (ta && tb && ta !== tb) {
    err('CONST_DRIFT', `TIER_SCORE 표가 lib/synergyEngine.js와 scripts/findTotems.mjs에서 다름`);
  }
}

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

  // 출시일. 2026-08-08 이전에는 "4 nov 2022", "july 23 2026", "{{#dateformat: 13 apr 2023}}"이
  // 뒤섞여 있어 정렬도 비교도 불가능했다(위키 템플릿 잔재는 홍련/유니를 통째로 누락시킨 것과
  // 같은 유형이다). ISO(YYYY-MM-DD)로 통일했고, 여기서 어긋나면 잡는다.
  // 이 값이 정확해야 "지난 조사 이후 나온 신규 캐릭터"를 기계적으로 찾을 수 있다.
  if (c.releaseDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.releaseDate))) {
      err('SHAPE_RELEASE_DATE',
        who + ": releaseDate='" + c.releaseDate + "' — YYYY-MM-DD 형식이어야 함" +
        (/\{\{|\}\}/.test(String(c.releaseDate)) ? ' (위키 템플릿 잔재로 보임)' : ''));
    } else if (Number.isNaN(Date.parse(c.releaseDate + 'T00:00:00Z'))) {
      err('SHAPE_RELEASE_DATE', who + ": releaseDate='" + c.releaseDate + "' — 존재하지 않는 날짜");
    } else if (c.releaseDate > todayISO) {
      warn('SHAPE_RELEASE_DATE', who + ': releaseDate가 미래(' + c.releaseDate + ') — 오타 가능성');
    }
  }

  // 캐릭터 이미지. 니케 위키에는 같은 캐릭터의 그림이 여러 종류 있는데, 우리 화면(세로형 카드)에
  // 맞는 것은 상반신 초상화인 _MI.png뿐이다. _FB.png(전신)는 가로로 넓은 이미지라(예: 932x888,
  // _MI는 256x512) 카드 안에서 혼자 전신으로 보이며 튄다. 실제로 파워/네온: 비전 아이/맥스웰:
  // 오디너리 미케닉 3명이 _FB로 들어와 있었고, 유저가 화면을 보고 지적해서야 발견했다.
  //
  // 위키 이미지 경로는 (디코딩한 파일명의 MD5) 앞 1글자/앞 2글자로 정해지므로, 파일명만 알면
  // 경로를 계산할 수 있다. 형식이 어긋나면 이미지가 아예 안 뜨므로 여기서 함께 검사한다.
  if (c.img !== undefined) {
    if (!/_MI\.png$/.test(String(c.img))) {
      err('SHAPE_IMG', who + `: img='${c.img}' — 상반신 초상화(_MI.png)여야 함. ` +
        `_FB.png(전신)는 비율이 달라 카드에서 혼자 튄다`);
    } else if (!/^[0-9a-f]\/[0-9a-f]{2}\//.test(String(c.img))) {
      err('SHAPE_IMG', who + `: img='${c.img}' — 위키 경로 형식(x/xy/파일명)이 아님`);
    } else {
      const file = decodeURIComponent(String(c.img).split('/').pop());
      const h = createHash('md5').update(file).digest('hex');
      const expected = `${h[0]}/${h.slice(0, 2)}/${String(c.img).split('/').pop()}`;
      if (expected !== c.img) {
        err('SHAPE_IMG', who + `: img 경로가 파일명과 맞지 않음 — '${c.img}' (계산값 '${expected}'). ` +
          `위키는 파일명 MD5로 경로를 정하므로 이대로면 이미지가 뜨지 않는다`);
      }
    }
  }

  // prydwen 특수 표시. 오타가 나면 그 표시를 참조하는 쪽이 조용히 아무것도 못 찾는다.
  ['prydwenTags', 'prydwenTagsTreasure'].forEach((f) => {
    const v = c[f];
    if (v === undefined) return;
    if (!Array.isArray(v) || v.length === 0) {
      err('SHAPE_TAG', who + ': ' + f + "는 비어 있지 않은 배열이어야 함(태그가 없으면 필드 자체를 두지 말 것)");
      return;
    }
    v.forEach((t) => {
      if (!DOMAIN.prydwenTag.includes(t)) {
        err('SHAPE_TAG', who + ": " + f + "에 알 수 없는 값 '" + t + "' — " + DOMAIN.prydwenTag.join('/') + '만 허용');
      }
    });
    if (new Set(v).size !== v.length) warn('SHAPE_TAG', who + ': ' + f + '에 중복 태그가 있음');
  });

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
// 6. UI 목록(data/characters.js) ↔ 엔진 DB(characterDatabase.json) 연결 검사
//
// 2026-08-07 추가. 사이트는 캐릭터 데이터를 두 벌로 들고 있다:
//   data/characters.js        — 화면의 캐릭터 선택창이 쓰는 목록(보유 저장 id의 기준)
//   data/characterDatabase.json — 점수/조합 계산 엔진이 쓰는 상세 데이터
// 둘을 lib/rosterBridge.js가 이어주는데, 예전에는 '한국어 이름'으로 매칭해서 표기가 조금만
// 어긋나도 정상 보유 캐릭터가 조용히 분석에서 빠졌다. 실제 사고:
//   - 홍련(Scarlet) / 유니(Yuni): characterDatabase의 name_kr이 "{{hover"(위키 템플릿 잔재)였음
//   - 라벨: characters.js는 '라벨', characterDatabase는 '레이블'
// 홍련은 PvP SS 티어인데도 계산에서 통째로 빠져 있었고, 화면에는 "보유 캐릭터 중 N명은 아직
// 상세 데이터가 없어 제외되었습니다"라는 안내만 떠서 원인을 알기 어려웠다.
//
// 이제 연결은 id(필요하면 cdbId)로만 하며, 여기서 그 연결이 전부 성립하는지 검사한다.
let uiCharacters = null;
try {
  // characters.js는 ESM이라 동적 import가 필요하다. 실패해도 나머지 검사는 계속 진행한다.
  ({ CHARACTERS: uiCharacters } = await import('../data/characters.js'));
} catch (e) {
  warn('UI_LIST_LOAD', `data/characters.js를 읽지 못해 UI↔엔진 연결 검사를 건너뜀: ${e.message}`);
}

if (uiCharacters) {
  const cdbIdSet = new Set(cdb.map((c) => c.id));
  const seenUiId = new Set();
  const usedCdbIds = new Set();

  uiCharacters.forEach((u) => {
    const who = `${u.id}(${u.name || '?'})`;

    if (seenUiId.has(u.id)) err('UI_DUP_ID', `characters.js에 id '${u.id}'가 중복`);
    else seenUiId.add(u.id);

    const target = u.cdbId || u.id;
    if (!cdbIdSet.has(target)) {
      err('UI_CDB_UNRESOLVED',
        `${who}가 characterDatabase.json의 어떤 항목과도 연결되지 않음(찾는 id: '${target}'). ` +
        `이 캐릭터를 보유로 선택해도 조합 계산에서 통째로 제외된다. ` +
        `id가 다르면 characters.js 항목에 cdbId를 명시할 것.`);
    } else {
      usedCdbIds.add(target);
    }

    if (!u.name) err('UI_NO_NAME', `${u.id}: characters.js 항목에 name이 없음`);
    if (![1, 2, 3].includes(Number(u.burst))) {
      err('UI_BAD_BURST', `${who}: burst=${u.burst} — 1/2/3 중 하나여야 함`);
    }

    // 이미지 검사는 characterDatabase.json과 characters.js 양쪽에 다 필요하다.
    // 2026-08-08: 유저가 "네온: 비전 아이만 전신 사진"이라고 지적해 characterDatabase의 img를
    // _MI로 고치고 검사까지 붙였는데도 화면이 그대로였다. 화면의 캐릭터 그리드가 읽는 건
    // characters.js 쪽 img라서, 한쪽만 고치고 한쪽만 막아둔 탓이었다. 같은 규칙을 여기도 건다.
    if (u.img !== undefined) {
      if (!/_MI\.png$/.test(String(u.img))) {
        err('UI_BAD_IMG', `${who}: img='${u.img}' — 상반신 초상화(_MI.png)여야 함. ` +
          `_FB.png(전신)는 가로로 넓어 세로형 카드에서 혼자 튄다`);
      } else {
        const file = decodeURIComponent(String(u.img).split('/').pop());
        const h = createHash('md5').update(file).digest('hex');
        const expected = `${h[0]}/${h.slice(0, 2)}/${String(u.img).split('/').pop()}`;
        if (expected !== u.img) {
          err('UI_BAD_IMG', `${who}: img 경로가 파일명과 맞지 않음 — '${u.img}' (계산값 '${expected}')`);
        }
      }
    }

    // 두 파일이 같은 캐릭터에 서로 다른 그림을 쓰고 있으면, 화면 위치에 따라 다른 얼굴이 나온다.
    const cdbEntry = cdb.find((x) => x.id === (u.cdbId || u.id));
    if (cdbEntry && u.img && cdbEntry.img && u.img !== cdbEntry.img) {
      warn('UI_IMG_MISMATCH',
        `${who}: characters.js의 img('${u.img}')와 characterDatabase의 img('${cdbEntry.img}')가 다름 — ` +
        `선택 그리드와 결과 화면에서 다른 그림이 나올 수 있다`);
    }
  });

  // 같은 엔진 캐릭터를 두 UI 항목이 가리키면, 한쪽 보유 표시가 다른 쪽을 덮어쓴 것처럼 동작한다.
  const dupTargets = [...usedCdbIds].filter(
    (t) => uiCharacters.filter((u) => (u.cdbId || u.id) === t).length > 1
  );
  dupTargets.forEach((t) => {
    const who = uiCharacters.filter((u) => (u.cdbId || u.id) === t).map((u) => u.id).join(', ');
    err('UI_CDB_DUP', `characterDatabase의 '${t}'를 여러 UI 항목이 가리킴: ${who}`);
  });

  // 엔진 DB에는 있는데 화면에서 선택할 수 없는 캐릭터.
  //
  // [SSR만 검사하는 이유] 화면 캐릭터 목록은 의도적으로 SSR 전용이다. enikk 실사용 데이터에
  // SR/R 캐릭터가 등장한 조합이 단 하나도 없고(2026-08-07 확인), prydwen 조합에서도 초반
  // 육성 가이드 외에는 쓰이지 않는다. 따라서 SR/R이 목록에 없는 것은 정상이며, 이걸 경고로
  // 띄우면 매번 네온·아니스·파스칼 같은 SR이 잡혀서 진짜 누락(SSR 신캐 추가 후 UI 반영 누락)이
  // 소음에 묻힌다. 방침이 바뀌어 SR을 넣기로 하면 아래 rarity 조건만 풀면 된다.
  const GOOD = new Set(['SSS', 'SS', 'S', 'A', 'B']);
  const missingGood = cdb.filter((c) => {
    if (usedCdbIds.has(c.id)) return false;
    if (c.rarity !== 'SSR') return false;
    const t = c.tiers || {};
    return [t.story, t.bossing, t.pvp].some((g) => GOOD.has(g));
  });
  if (missingGood.length) {
    warn('UI_MISSING_CHAR',
      `엔진 DB에는 있으나 화면에서 선택할 수 없는 SSR 캐릭터 중 B티어 이상이 ${missingGood.length}명 있음 ` +
      `(사용자가 보유해도 조합에 넣을 수 없다). data/characters.js에 항목을 추가할 것: ` +
      missingGood.map((c) => `${c.name_kr}(${[c.tiers.story, c.tiers.bossing, c.tiers.pvp].join('/')})`).join(', '));
  }

  // 반대 방향: 목록은 SSR 전용이어야 한다. SR/R이 섞여 들어오면 위 검사가 조용히 무의미해지고,
  // 데이터 수집 범위(SSR만 스크랩)와도 어긋나 스킬·티어가 비어 있는 항목이 화면에 노출된다.
  const nonSsrInUi = uiCharacters
    .map((u) => ({ u, c: cdb.find((x) => x.id === (u.cdbId || u.id)) }))
    .filter(({ c }) => c && c.rarity !== 'SSR');
  if (nonSsrInUi.length) {
    warn('UI_NON_SSR',
      `화면 캐릭터 목록은 SSR 전용인데 SSR이 아닌 항목이 ${nonSsrInUi.length}개 있음 ` +
      `(의도한 추가라면 위 UI_MISSING_CHAR의 rarity 조건도 같이 풀 것): ` +
      nonSsrInUi.map(({ u, c }) => `${u.name}[${c.rarity}]`).join(', '));
  }
}

// 이름에 위키 템플릿 잔재나 제어문자가 들어간 항목 — "{{hover" 유형 재발 방지.
cdb.forEach((c) => {
  ['title', 'name_kr'].forEach((f) => {
    const v = c[f];
    if (typeof v !== 'string' || !v.trim()) {
      err('NAME_EMPTY', `${c.id}: ${f}가 비어 있음`);
      return;
    }
    if (/\{\{|\}\}|\[\[|\]\]|<[a-z/]/i.test(v)) {
      err('NAME_MARKUP',
        `${c.id}: ${f}='${v}' — 위키/HTML 마크업 잔재로 보임. ` +
        `이런 이름은 다른 데이터와 매칭되지 않아 해당 캐릭터가 조용히 누락된다.`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. 오버스펙(overspec) — 기업 타워 모드용
//
// 오버스펙 니케는 "3대 기업 캐릭터의 파워업 버전"으로, 소속 기업을 유지하면서
// 필그림/오버스펙 타워에도 들어갈 수 있다(gamechosun 2025-01). 즉 제조사 필터를
// 그대로 걸면 이들이 부당하게 빠지고, prydwen 필그림 타워 조합이 통째로 깨진다.
//
// 이 검사의 핵심은 마지막 항목이다: "제조사가 섞인 tribe_tower 조합 = 필그림 타워
// 조합"이므로, 그 안의 비-필그림 멤버는 반드시 overspec이어야 한다. 새 오버스펙이
// 출시됐는데 플래그를 안 넣으면 여기서 잡힌다(조용한 누락 방지).
// ---------------------------------------------------------------------------
const overspecs = cdb.filter((c) => c.overspec);

overspecs.forEach((c) => {
  if (c.manufacturer === 'pilgrim') {
    err('OVERSPEC_PILGRIM',
      `${c.title}은 제조사가 pilgrim인데 overspec:true — 필그림은 이미 필그림 타워에 들어가므로 ` +
      `플래그가 불필요하고, 제조사 필터 로직에서 이중 처리될 수 있음`);
  }
  if (c.manufacturer === 'abnormal') {
    err('OVERSPEC_ABNORMAL',
      `${c.title}은 제조사가 abnormal(콜라보·특수)인데 overspec:true — abnormal은 기업 타워 자체가 없음`);
  }
  if (!/출처|gamechosun|prydwen|inven|인벤|nikke\.gg|lootandwaifus|namu|arca\.live|유저 확인/i.test(c.overspecNote || '')) {
    warn('OVERSPEC_NO_SOURCE',
      `${c.title}의 overspec에 근거 표기가 없음 — 이 플래그는 기업 타워 편성 가능 여부를 직접 바꾸므로 ` +
      `반드시 1차 출처를 overspecNote에 남길 것`);
  }
});

// 제조사가 섞인 tribe_tower 아키타입 = 필그림/오버스펙 타워 조합
syn.archetypes.filter((a) => a.mode === 'tribe_tower').forEach((a) => {
  const members = (a.members || []).map((m) => BY_TITLE.get(m)).filter(Boolean);
  const mans = [...new Set(members.map((c) => c.manufacturer))];
  if (mans.length < 2) return;

  const hasPilgrim = mans.includes('pilgrim');
  const outsiders = members.filter((c) => c.manufacturer !== 'pilgrim' && !c.overspec);

  if (!hasPilgrim) {
    err('TOWER_MIXED_ARCH',
      `tribe_tower 아키타입 '${a.name}'에 제조사가 ${mans.join('/')}로 섞여 있는데 필그림이 없음 — ` +
      `기업 타워는 한 제조사만 출전 가능하므로 성립하지 않는 조합이거나, 일반 트라이브 타워 조합인데 ` +
      `모드 구분이 없어서 기업 타워로 잘못 취급될 위험이 있음`);
  } else if (outsiders.length) {
    err('TOWER_NON_OVERSPEC',
      `필그림 타워 조합으로 보이는 '${a.name}'에 필그림도 오버스펙도 아닌 ${outsiders.map((c) => `${c.title}(${c.manufacturer})`).join(', ')}가 포함됨 — ` +
      `새 오버스펙 니케가 출시됐는데 characterDatabase.json에 overspec 플래그를 안 넣었을 가능성이 높다. ` +
      `플래그를 넣지 않으면 제조사 필터가 이들을 걸러내 이 아키타입이 통째로 깨진다`);
  }
});

// ---------------------------------------------------------------------------
// 6-1. 기업 타워 값이 세 파일에서 어긋나지 않는가 (2026-08-09 추가)
//
// 타워 목록이 엔진·API·화면 세 곳에 각각 적혀 있다. 한 곳만 고치면 조용히 어긋난다:
//   - 화면에만 추가 → API가 검증에서 걸러 tower=null이 되고, 제조사 필터가 아예 안 걸림
//   - 엔진에만 추가 → 화면에 탭이 안 떠서 사용자가 고를 수 없음
// 둘 다 에러 없이 "그냥 다른 결과"가 나오는 유형이라 사람이 알아채기 어렵다.
// ---------------------------------------------------------------------------
const routeSrc = readSrc('app/api/ai-recommend/route.js');
const uiSrc = readSrc('components/ResultPanel.js');
if (engineSrc && routeSrc && uiSrc) {
  const grabList = (src, re) => {
    const m = src.match(re);
    if (!m) return null;
    return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort().join(',');
  };
  const a = grabList(engineSrc, /TOWER_CORPS\s*=\s*\[([^\]]*)\]/);
  const b = grabList(routeSrc, /TOWER_CORP_SET\s*=\s*new Set\(\[([^\]]*)\]/);
  const c = grabList(uiSrc, /TOWER_OPTIONS\s*=\s*\[([\s\S]*?)\n\];/);
  if (a === null || b === null || c === null) {
    warn('TOWER_LIST_MISSING',
      `기업 타워 목록을 못 찾음 (engine=${a === null ? 'X' : 'O'} / route=${b === null ? 'X' : 'O'} / ` +
      `UI=${c === null ? 'X' : 'O'}) — 상수 이름이 바뀌었는지 확인할 것`);
  } else if (!(a === b && b === c)) {
    err('TOWER_LIST_DRIFT',
      `기업 타워 목록이 어긋남 — lib/synergyEngine.js=[${a}] / app/api/ai-recommend/route.js=[${b}] / ` +
      `components/ResultPanel.js=[${c}]. 화면에만 있으면 API가 걸러내 제조사 필터가 안 걸리고, ` +
      `엔진에만 있으면 사용자가 고를 수 없다. 둘 다 에러 없이 결과만 달라진다`);
  }
}

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
