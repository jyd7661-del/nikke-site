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

// id는 도감 페이지 주소(/nikke/[id])와 sitemap에 그대로 들어간다 (2026-08-13 Phase 1).
// URL에 못 쓰는 문자가 섞이면 에러 없이 깨진 링크·잘못된 sitemap이 나간다 — 조용한 누락 유형.
cdb.forEach((c) => {
  if (!/^[a-z0-9-]+$/.test(String(c.id || ''))) {
    err('ID_URL_UNSAFE',
      `${c.title}의 id '${c.id}'에 URL에 쓸 수 없는 문자가 있음 — ` +
      `소문자·숫자·하이픈만 허용 (도감 페이지 주소와 sitemap이 이 값으로 만들어짐)`);
  }
});

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

// 아키타입의 조건 필드가 조용히 망가지지 않게 검사한다 (2026-08-15).
//
// requiresTreasure / notRecommended / sourceCaveat 는 전부 **엔진이 조합을 후보에서 빼거나
// 경고를 붙이는 근거**다. 값이 잘못되면 에러 없이 추천 결과만 달라지므로 눈으로는 못 잡는다.
// 실제로 requiresTreasure는 엔진 검사 장치가 2026-08-07부터 있었는데도 데이터가 483건 중
// 4건만 채워져 있어 나머지가 무방비였다(2026-08-15 발견).
syn.archetypes.forEach((a) => {
  const where = `아키타입 '${a.id || a.name}'`;
  if (a.requiresTreasure !== undefined) {
    if (!Array.isArray(a.requiresTreasure) || a.requiresTreasure.length === 0) {
      err('ARCH_TREASURE_SHAPE', `${where}의 requiresTreasure는 비어 있지 않은 배열이어야 함`);
    } else {
      a.requiresTreasure.forEach((t) => {
        if (!TITLES.has(t)) {
          err('ARCH_TREASURE_ORPHAN',
            `${where}의 requiresTreasure '${t}'가 characterDatabase.json에 없음${suggest(t)}` +
            ' — 엔진이 이 조건을 영원히 만족시키지 못해 조합이 통째로 사라짐');
        } else if (!(a.members || []).includes(t)) {
          err('ARCH_TREASURE_NOT_MEMBER',
            `${where}의 requiresTreasure '${t}'가 이 조합 members에 없음` +
            ' — 치환 안내를 조건으로 잘못 뽑았을 가능성');
        }
      });
    }
  }
  if (a.notRecommended !== undefined && a.notRecommended !== true) {
    err('ARCH_NOTREC_SHAPE', `${where}의 notRecommended는 true이거나 없어야 함`);
  }
  if (a.notRecommended === true && !a.notRecommendedReason) {
    err('ARCH_NOTREC_NO_REASON',
      `${where}가 notRecommended인데 이유가 없음 — 왜 뺐는지 남기지 않으면 나중에 되살릴 근거가 사라짐`);
  }
  if (a.sourceCaveat !== undefined && (typeof a.sourceCaveat !== 'string' || !a.sourceCaveat.trim())) {
    err('ARCH_CAVEAT_SHAPE', `${where}의 sourceCaveat는 비어 있지 않은 문자열이어야 함`);
  }
});

const metaTitles = new Set();
Object.values(meta.usageTier || {}).forEach((slice) => Object.keys(slice).forEach((t) => metaTitles.add(t)));
(meta.campaignCompositions?.list || []).forEach((c) => (c.members || []).forEach((m) => metaTitles.add(m)));
// ⚠️ meta.pvp 아래가 전부 배열이라고 가정하면 안 된다 — 2026-08-21에 pvp.meta(객체)를 넣자
//    이 줄이 TypeError로 죽었다. 검사기가 죽으면 ERROR 0이 아니라 **아무것도 검사되지 않는다.**
Object.values(meta.pvp || {}).filter(Array.isArray)
  .forEach((arr) => arr.forEach((e) => (e.members || []).forEach((m) => metaTitles.add(m))));
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

  // 노트가 "현재 티어: story X / bossing Y / pvp Z"라고 적었으면 DB와 맞아야 한다.
  //
  // 2026-08-25: 맥스웰 : 오디너리 미케닉 항목에 **마르차나 : 마린 스터디의 문구가 통째로
  // 복사**돼 있었다. 도감의 "투자·운용" 절과 엔진 근거에 그대로 나갔고, 3개국어 번역까지
  // 따라가서 틀린 정보가 세 배로 퍼져 있었다.
  //
  // 이 유형은 "이름이 안 맞는다" 같은 기존 검사로는 안 잡힌다. 이름·id는 멀쩡하고 **본문만**
  // 남의 것이기 때문이다. 다만 이 자료는 스스로를 검증할 값을 품고 있다 — 노트가 인용한
  // 티어는 그 캐릭터의 DB 티어와 같아야 한다(BURST_ALL_CLAIM과 정확히 같은 구조).
  //
  // ⚠️ 한국어 원문만 본다. `_en`/`_ja`는 이 문장에서 파생된 번역이라 따로 재면 같은 실패를
  //    두 번 세게 되고, 표기 형식도 언어마다 달라 오탐이 난다.
  const tierClaim = /현재\s*티어\s*:\s*story\s+([A-Z]+)\s*\/\s*bossing\s+([A-Z]+)\s*\/\s*pvp\s+([A-Z]+)/i
    .exec([n.investmentProfile, n.notes, n.treasureNote].filter(Boolean).join(' '));
  if (!isCorrectionRecord && tierClaim) {
    const claimed = tierClaim.slice(1, 4).join('/');
    const actual = [c.tiers?.story, c.tiers?.bossing, c.tiers?.pvp].join('/');
    if (claimed !== actual) {
      const owner = notes.characters.find((o) => {
        const oc = BY_TITLE.get(o.name);
        return oc && [oc.tiers?.story, oc.tiers?.bossing, oc.tiers?.pvp].join('/') === claimed;
      });
      err('TIER_CLAIM_MISMATCH',
        `${n.name}: 노트가 티어를 '${claimed}'라고 적었지만 characterDatabase.json 실제 값은 ` +
        `'${actual}' — 다른 캐릭터의 문구가 복사됐을 수 있다` +
        (owner && owner.name !== n.name ? ` (그 티어를 가진 캐릭터: ${owner.name})` : ''));
    }
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

// ---------------------------------------------------------------------------
// 무기 데이터 — 장탄수 ÷ 연사속도 = 6.0초 상수 (2026-09-03)
//
// 유저 지적("발수가 많으면 한 발당 데미지가 작을 것")을 계산해보다 나온 설계 상수다.
// AR 60÷10 · SMG 120÷20 · MG 300÷50 · SG 9÷1.5 — 넷 다 정확히 6.0초다.
//
// **이게 중요한 이유**: 장탄수는 Fandom(현재 값), 연사속도는 2023년 아카라이브 글에서 왔다.
// 서로 다른 출처·다른 시점인데 같은 상수로 맞으므로 **두 값이 서로를 검증한다.**
// 덕분에 "AR이 10발이냐 12발이냐" 논쟁이 10으로 정리됐고(12면 5.0초라 혼자 튄다),
// 3년 전 글이라는 우려도 줄었다.
//
// 그래서 이 상수가 깨지면 둘 중 하나다 — 우리 데이터가 틀렸거나, 게임이 바뀌었거나.
// 어느 쪽이든 사람이 봐야 한다.
try {
  const weapons = read('weapons.json');
  const rate = weapons?.fireRate?.perSecond || {};
  const MAG_SEC = weapons?.derived?.magazineSeconds;
  if (MAG_SEC) {
    Object.entries(rate).forEach(([type, rps]) => {
      const caps = [...new Set((weapons.byType?.[type] || []).map((r) => r.capacity).filter(Boolean))];
      // 그 타입의 **대표 장탄수**(가장 많은 무기가 쓰는 값)로만 본다 — 특수 장탄 무기가 섞여 있다.
      const counts = {};
      (weapons.byType?.[type] || []).forEach((r) => { if (r.capacity) counts[r.capacity] = (counts[r.capacity] || 0) + 1; });
      const main = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]);
      if (!main) return;
      const sec = main / rps;
      if (Math.abs(sec - MAG_SEC) > 0.05) {
        err('WEAPON_MAG_CONST',
          `${type}: 대표 장탄수 ${main} ÷ 연사속도 ${rps} = ${sec.toFixed(2)}초 — ` +
          `설계 상수 ${MAG_SEC}초와 어긋난다(장탄 후보 ${caps.join('/')}). ` +
          `데이터가 틀렸거나 게임이 바뀌었다. data/weapons.json의 fireRate._selfCheck 참고`);
      }
    });
  }
} catch (e) {
  warn('WEAPON_DATA', `weapons.json을 읽지 못했다 — ${String(e.message).slice(0, 60)}`);
}

// 토템 주장에 출처가 있는가 (레드 후드 재발 방지)
notes.characters.filter((n) => n.totemRole).forEach((n) => {
  // '스킬 원문 근거'는 외부 공략 출처는 없지만 characterDatabase의 스킬 원문에서 직접 끌어낸
  // 판단이라는 표시다. 근거 없이 등록된 것과는 구분되므로 통과시키되, 반드시 명시해야 한다.
  if (!/출처|arca\.live|prydwen|tistory|enikk|namu|inven|인벤|유저 확인|스킬 원문 근거/i.test(n.totemNote || '')) {
    warn('TOTEM_NO_SOURCE',
      `${n.name}의 totemRole에 근거 표기가 없음 — 레드 후드처럼 근거 없이 등록된 항목일 수 있음. ` +
      `외부 공략 출처를 적거나, 스킬 원문에서 끌어낸 판단이면 '[스킬 원문 근거]'라고 밝힐 것`);
  }

  // 2026-09-01: 토템의 근거가 **대상이 한정된 버프뿐**이면 totemCondition이 있어야 한다.
  //
  // 토템은 "버스트를 안 써도 상시 효과로 기여한다"는 이유로 낭비 판정에서 면제된다.
  // 그런데 그 상시 효과가 "전기 코드 아군에게만" 같은 조건부면, 조건이 안 맞는 팀에서는
  // 아무에게도 안 들어간다 — 그냥 낭비다. totemCondition이 그걸 검사하는 장치인데,
  // **새 토템을 등록할 때 그 필드를 빠뜨리는 것을 막는 장치가 없었다.**
  //
  // ⚠️ 판정 단위 주의: **비버스트 스킬(마지막 스킬 제외)의 절만 본다.**
  //    처음에 스킬 전체로 재서 누아르를 오탐으로 잡았다 — 그의 `same squad` 조건은
  //    버스트 스킬에 있고, 토템은 버스트를 안 쓰므로 무관하다. 토템 근거는 skill1의
  //    무조건 버프였다. 조건은 "면제를 정당화하는 그 효과"에 걸려 있을 때만 의미가 있다.
  const chr = cdb.find((c) => c.title === n.name);
  if (chr && !n.totemCondition) {
    const OFFENSIVE = /(ATK|Attack Damage|Attack damage|Reloading Speed|Reload Speed|Critical Rate|Critical Damage|Cooldown of Burst Skill|Hit Rate|Core Damage|Pierce Damage|Charge Damage)\s*▲/;
    const SCOPED = /^all (Fire|Water|Wind|Iron|Electric) Code all(y|ies)|^all (Attacker|Defender|Supporter) all(y|ies)|^all allies with/i;
    let uncond = 0; let scoped = 0;
    (chr.skills || []).slice(0, -1).forEach((s) => {
      let scope = null;
      (s.desc || '').split(/(?<=\.)\s+/).map((x) => x.trim()).forEach((cl) => {
        const b = cl.match(/^Affects\s+(.+?)\.?$/i);
        if (b) { scope = b[1]; return; }
        if (!scope || !OFFENSIVE.test(cl)) return;
        if (/^all allies$/i.test(scope.trim())) uncond += 1;
        else if (SCOPED.test(scope.trim())) scoped += 1;
      });
    });
    if (uncond === 0 && scoped > 0) {
      err('TOTEM_COND_MISSING',
        `${n.name}: 비버스트 전 아군 버프가 **대상 한정**뿐인데(속성/클래스) totemCondition이 없다 — ` +
        `조건이 안 맞는 팀에서도 낭비 면제를 받는다. 조건을 적거나, 무조건 버프 근거를 totemNote에 밝힐 것`);
    }
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

// 스킬 설명이 사람이 읽을 문장인지. 2026-08-13 추가.
//
// prydwen 페이지에 박힌 skills JSON은 설명이 **"$56" 같은 다른 행 참조**로 오는 경우가 있다
// (Next.js RSC 플라이트 형식). 수집기가 그대로 받아 6명 8건이 설명 자리에 "$56"을 달고
// 라이브로 나갔고, **에러 하나 없이** 도감에 그대로 표시됐다. 유저가 신데렐라: 크리스탈
// 웨이브를 열어보고 발견했다(원칙 §3 — 조용한 누락).
// 태그 잔재도 같이 본다: 엔티티를 태그 제거보다 나중에 풀면 `&lt;strong&gt;`가 태그로
// 되살아나 본문에 남는다(나유타에서 실제로 발생).
{
  for (const c of cdb) {
    (c.skills || []).forEach((s, i) => {
      const label = `${c.title}(${c.name_kr}) 스킬[${i}]`;
      const d = String(s.desc ?? '');
      if (!d.trim()) {
        err('SKILL_DESC_EMPTY', `${label}: 설명이 비어 있다`);
      } else if (/^\$[\w-]+$/.test(d.trim())) {
        err('SKILL_DESC_REF',
          `${label}: 설명이 "${d.trim()}" — prydwen 페이로드의 행 참조가 그대로 저장됐다. ` +
          `scripts/refreshSkillsFromPrydwen.mjs 로 다시 수집할 것`);
      } else if (/<[a-z/][^>]*>/i.test(d)) {
        err('SKILL_DESC_HTML', `${label}: 설명에 HTML 태그가 남아 있다 — ${d.match(/<[a-z/][^>]*>/i)[0]}`);
      }
      if (!String(s.name ?? '').trim()) err('SKILL_NAME_EMPTY', `${label}: 스킬 이름이 비어 있다`);
    });
  }
}

// 스킬 수치의 출처·레벨 기준이 기록돼 있는지. 2026-08-13 추가.
//
// 도감 196페이지가 "출처: prydwen.gg"라고 적어놓고 **레벨 1 기준의 낡은 수치**를 보여주고
// 있었는데(노이즈 Chorus 5.86% — 실제 10레벨은 10.66%), 몇 레벨 기준인지 아무 데도 적혀
// 있지 않아 아무도 이상하다고 느끼지 못했다. 기록이 없으면 틀렸는지조차 알 수 없다.
{
  const cs = freshness?.characterSkills;
  if (!cs?.asOf) {
    warn('SKILLS_FRESHNESS_MISSING',
      'dataFreshness.characterSkills 가 없다 — 스킬 수치를 언제 어느 레벨 기준으로 수집했는지 ' +
      '기록이 없으면 낡아도 알 수 없다. `node scripts/refreshSkillsFromPrydwen.mjs --write` 로 갱신할 것');
  } else {
    if (!cs.skillLevelBasis) {
      warn('SKILLS_LEVEL_BASIS_MISSING',
        'dataFreshness.characterSkills.skillLevelBasis 가 비어 있다 — 스킬 수치가 몇 레벨 기준인지 ' +
        '명시해야 한다(현재 데이터는 레벨 10 기준)');
    }
    const newer = cdb.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.releaseDate || '') && c.releaseDate > cs.asOf);
    if (newer.length) {
      warn('SKILLS_MAYBE_STALE',
        `characterSkills.asOf(${cs.asOf}) 이후에 출시된 캐릭터가 ${newer.length}명 있음 — ` +
        `스킬 수치가 아직 수집되지 않았을 수 있다: ` + newer.map((c) => `${c.title}(${c.releaseDate})`).join(', '));
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

  // 버스트 단계가 유연한 캐릭터(게임 내 Λ 표기)는 엔진의 하드 제약을 통과하는 방식이 다르다.
  // 근거 없이 붙이면 아무 조합이나 성립해버리므로 출처를 반드시 남기게 한다.
  if (c.burstFlex !== undefined) {
    if (c.burstFlex !== true) err('SHAPE_BURSTFLEX', who + ': burstFlex는 true일 때만 적는다');
    if (!String(c.burstFlexNote || '').trim()) {
      err('SHAPE_BURSTFLEX', who + ': burstFlex를 붙였으면 burstFlexNote에 근거(출처 표기)를 남길 것 — ' +
        '이 플래그는 버스트 하드 제약을 우회시키므로 근거 없이 붙으면 아무 조합이나 성립한다');
    }
    // 2026-09-01: "유연하다"와 "아무 단계나 된다"는 다르다. 라피: 레드 후드는 본인 스킬
    // 원문이 Stage I과 Stage 3만 말한다 — 근거 없이 II까지 열면 없는 조합이 성립한다.
    // 그래서 어느 단계까지가 근거에 있는지 반드시 적게 한다.
    const st = c.burstStages;
    if (!Array.isArray(st) || st.length < 2) {
      err('SHAPE_BURSTFLEX', who + ': burstFlex를 붙였으면 burstStages에 채울 수 있는 단계를 ' +
        '2개 이상 적을 것 — "유연하다"와 "아무 단계나 된다"는 다르다');
    } else {
      if (st.some((b) => !['1', '2', '3'].includes(String(b)))) {
        err('SHAPE_BURSTFLEX', who + ': burstStages는 "1"/"2"/"3"만 담는다 — ' + JSON.stringify(st));
      }
      if (new Set(st.map(String)).size !== st.length) {
        err('SHAPE_BURSTFLEX', who + ': burstStages에 중복이 있다 — ' + JSON.stringify(st));
      }
    }
  } else if (c.burstStages !== undefined) {
    err('SHAPE_BURSTFLEX', who + ': burstFlex 없이 burstStages만 있다 — 엔진이 읽지 않는다');
  }

  // 자리 조건(preferredSlots)은 근거 문장으로 사용자에게 "몇 번 자리에 두라"고 지시한다.
  // 틀리면 사용자가 실제로 잘못 배치하므로 원문 인용을 반드시 남기게 한다.
  if (c.preferredSlots !== undefined) {
    const ps = c.preferredSlots;
    if (!Array.isArray(ps) || !ps.length || ps.some((x) => ![1, 2, 3, 4, 5].includes(x))) {
      err('SHAPE_SLOTS', who + ': preferredSlots는 1~5 중 하나 이상을 담은 배열이어야 한다 — ' + JSON.stringify(ps));
    }
    if (!String(c.preferredSlotsNote || '').trim()) {
      err('SHAPE_SLOTS', who + ': preferredSlots를 붙였으면 preferredSlotsNote에 스킬 원문 인용을 남길 것');
    }
  } else if (c.preferredSlotsNote !== undefined) {
    err('SHAPE_SLOTS', who + ': preferredSlots 없이 preferredSlotsNote만 있다');
  }

  // 재진입(burstReentry)은 같은 버스트 단계의 인원 한 명을 낭비 판정에서 살린다.
  // 근거 없이 붙으면 점수가 조용히 오르므로 스킬 원문 인용을 반드시 남기게 한다.
  if (c.burstReentry !== undefined) {
    if (c.burstReentry !== true) err('SHAPE_BURSTREENTRY', who + ': burstReentry는 true일 때만 적는다');
    if (!String(c.burstReentryNote || '').trim()) {
      err('SHAPE_BURSTREENTRY', who + ': burstReentry를 붙였으면 burstReentryNote에 스킬 원문 인용을 남길 것 — ' +
        '이 플래그는 낭비 판정을 한 명 완화하므로 근거 없이 붙으면 점수가 조용히 오른다');
    }
  } else if (c.burstReentryNote !== undefined) {
    err('SHAPE_BURSTREENTRY', who + ': burstReentry 없이 burstReentryNote만 있다');
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

      // 2026-08-10 추가 (A단계 — 화면 다국어).
      // 니케 목록·결과 패널은 characters.js를 그리지만 표시할 이름은 characterDatabase의
      // title/name_kr/name_ja에서 가져온다(lib/characterNames.js). 셋 중 하나라도 비면
      // **에러 없이 그 언어에서만 이름이 한국어로 남는다** — 눈으로 안 보면 모르는 종류다.
      const d = cdb.find((c) => c.id === target);
      const lack = ['title', 'name_kr', 'name_ja'].filter((k) => !d?.[k]);
      if (lack.length) {
        err('UI_NAME_LOCALE_MISSING',
          `${who} → characterDatabase '${target}'에 ${lack.join(', ')}이(가) 없음. ` +
          `해당 언어에서 니케 이름이 다른 언어 표기로 대체 표시된다(lib/characterNames.js).`);
      }
    }

    if (!u.name) err('UI_NO_NAME', `${u.id}: characters.js 항목에 name이 없음`);
    if (![1, 2, 3].includes(Number(u.burst))) {
      err('UI_BAD_BURST', `${who}: burst=${u.burst} — 1/2/3 중 하나여야 함`);
    }

    // burst가 두 파일에 각각 있어서 조용히 어긋날 수 있다. 2026-08-13 추가.
    //
    // 실제로 3명이 어긋나 있었다 — 밀크: 블루밍 바니 / 이브 / 소다: 트윙클링 바니가
    // characters.js에서는 버스트1인데 characterDatabase에서는 버스트3이었다.
    // 화면(CharacterPicker·MemberSelect)은 characters.js 값으로 묶고 엔진은
    // characterDatabase 값으로 조합을 짜므로, **화면에서는 버스트1 칸에 보이는데
    // 실제로는 버스트3으로 계산되는** 상태였다. 에러가 없어 유저가 눈으로 보고 발견했다.
    // (나무위키 인포박스로 교차 확인: 셋 다 버스트 III, 기본 밀크·소다는 I)
    //
    // 이름은 일부러 검사하지 않는다 — '라벨'(화면)과 '레이블'(DB)처럼 표기가 다른 경우가
    // 정상이고, 그래서 애초에 id로 연결한다(lib/rosterBridge.js 주석 참고).
    {
      const d = cdb.find((c) => c.id === (u.cdbId || u.id));
      if (d && String(u.burst) !== String(d.burst)) {
        err('UI_CDB_BURST_DRIFT',
          `${who}: characters.js는 버스트${u.burst}인데 characterDatabase '${d.id}'는 버스트${d.burst} — ` +
          `화면 분류와 실제 조합 계산이 어긋난다. characterDatabase 쪽이 1차 출처이므로 그 값에 맞출 것`);
      }
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
  // ⚠️ 화면 쪽은 `key:` 값만 세야 한다. 2026-08-10에 라벨을 i18n 키로 바꾸면서
  //    labelKey: 'tower_elysion' 같은 값까지 타워 키로 오인해 이 검사가 오탐을 냈다.
  //    (검사가 틀리면 진짜 어긋남이 묻히므로 추출을 좁게 잡는다)
  const grabUiTowers = (src) => {
    const m = src.match(/TOWER_OPTIONS\s*=\s*\[([\s\S]*?)\n\];/);
    if (!m) return null;
    return [...m[1].matchAll(/key:\s*'([a-z_]+)'/g)].map((x) => x[1]).sort().join(',');
  };
  const c = grabUiTowers(uiSrc);
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
// 7. 번역 용어집 — 3개 언어 이름이 치환에 쓸 수 있는 상태인가 (2026-08-09 추가)
//
// 커뮤니티 번역은 AI에게 이름을 맡기지 않는다. 번역 전에 본문에서 니케 이름을
// 토큰으로 빼내고, 번역 후 대상 언어 이름으로 되돌린다(lib/glossary.js).
// 이 방식이 성립하려면 세 가지가 필요하다:
//   (a) 196명 전원이 세 언어 이름을 다 가질 것 — 하나라도 비면 그 이름만 원문으로 남는다
//   (b) 같은 언어 안에서 이름이 겹치지 않을 것 — 겹치면 되돌릴 때 어느 쪽인지 알 수 없다
//   (c) 짧은 이름의 오검출을 알고 있을 것 — '신'은 '신데렐라' 안에 들어 있다
// (c)는 막을 수 없고 치환 순서(긴 이름 우선)로 다루므로 여기서는 개수만 알린다.
// ---------------------------------------------------------------------------
const NAME_FIELDS = [
  ['name_kr', '한글'],
  ['name_ja', '일본어'],
  ['title', '영문'],
];
for (const [field, label] of NAME_FIELDS) {
  const missing = cdb.filter((c) => !c[field] || !String(c[field]).trim());
  if (missing.length) {
    err('NAME_MISSING',
      `${label} 이름(${field})이 없는 캐릭터 ${missing.length}명: ${missing.slice(0, 8).map((c) => c.title || c.id).join(', ')}` +
      `${missing.length > 8 ? ' 외' : ''} — 번역 시 이 이름들은 치환되지 않고 원문 그대로 남는다`);
  }
  const seen = new Map();
  const dups = [];
  for (const c of cdb) {
    const v = String(c[field] || '').trim();
    if (!v) continue;
    if (seen.has(v)) dups.push(`${v}(${seen.get(v)} ↔ ${c.title})`);
    else seen.set(v, c.title);
  }
  if (dups.length) {
    err('NAME_DUP',
      `${label} 이름(${field})이 겹치는 캐릭터가 있음: ${dups.join(', ')} — ` +
      `번역본에서 원래 어느 캐릭터였는지 되돌릴 수 없다`);
  }
}
// 짧은 이름이 다른 이름 안에 포함되는 경우. 치환을 긴 이름부터 하면 대부분 해결되지만,
// 'D'처럼 일반 문장에도 나올 수 있는 이름은 앞뒤 문자까지 봐야 한다.
for (const [field, label] of NAME_FIELDS) {
  const names = [...new Set(cdb.map((c) => String(c[field] || '').trim()).filter(Boolean))];
  const risky = names.filter((a) => a.length <= 2 && names.some((b) => b !== a && b.includes(a)));
  if (risky.length) {
    warn('NAME_SUBSTRING',
      `${label} 이름 중 다른 이름 안에 통째로 들어 있는 짧은 이름 ${risky.length}개: ${risky.join(', ')} — ` +
      `치환은 반드시 긴 이름부터 해야 하고, 이 이름들은 앞뒤 경계까지 확인해야 한다`);
  }
}

// ---------------------------------------------------------------------------
// 7-1. 용어집 (data/glossary.json)
//
// 캐릭터가 아닌 게임 용어의 3개 언어 표기. 캐릭터 이름과 같은 치환 경로를 타므로
// 같은 제약을 받는다. 특히 용어와 캐릭터 이름이 같은 문자열이면 되돌릴 때 어느 쪽인지
// 알 수 없다(예: 어떤 용어가 'D'라면 캐릭터 D와 구분 불가).
// ---------------------------------------------------------------------------
let glossary = null;
try {
  glossary = read('glossary.json');
} catch {
  warn('GLOSSARY_MISSING', 'data/glossary.json이 없음 — 게임 용어가 번역에서 보호되지 않는다');
}
if (glossary) {
  const terms = glossary.terms || [];
  const charNames = new Set();
  for (const c of cdb) for (const f of ['title', 'name_kr', 'name_ja']) if (c[f]) charNames.add(String(c[f]).trim());
  const seen = { ko: new Map(), en: new Map(), ja: new Map() };
  for (const t of terms) {
    const holes = ['ko', 'en', 'ja', 'source'].filter((f) => !t[f] || !String(t[f]).trim());
    if (holes.length) {
      err('GLOSSARY_INCOMPLETE',
        `용어 '${t.key || '(key 없음)'}'에 ${holes.join('/')}가 비어 있음 — ` +
        `출처 없는 표기는 넣지 않는다는 원칙(HANDOFF §2-2)에 어긋나고, 언어가 비면 그 말만 원문으로 남는다`);
      continue;
    }
    for (const f of ['ko', 'en', 'ja']) {
      const v = String(t[f]).trim();
      if (seen[f].has(v)) {
        err('GLOSSARY_DUP',
          `용어집 ${f} 표기 '${v}'가 '${seen[f].get(v)}'와 '${t.key}' 두 곳에 있음 — 되돌릴 때 어느 쪽인지 알 수 없다`);
      } else seen[f].set(v, t.key);
      if (charNames.has(v)) {
        err('GLOSSARY_NAME_COLLISION',
          `용어 '${t.key}'의 ${f} 표기 '${v}'가 캐릭터 이름과 같음 — 번역본에서 용어인지 캐릭터인지 구분할 수 없다`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 7-2. 지원 언어가 화면과 DB에서 어긋나지 않는가 (2026-08-09 추가)
//
// 언어 목록이 두 곳에 있다: lib/i18n.js 의 LOCALES 와 content_translations.lang 의
// check 제약. 한 곳만 고치면 조용히 어긋난다:
//   - 화면에만 추가 → 사용자가 그 언어를 고를 수 있는데 저장이 거부돼 번역이 통째로 안 됨
//   - DB에만 추가   → 아무도 그 언어를 고를 수 없어 번역본이 만들어지지 않음
// 둘 다 "에러 없이 그냥 번역이 안 되는" 유형이라 사람이 알아채기 어렵다.
// ---------------------------------------------------------------------------
const i18nSrc = readSrc('lib/i18n.js');
const migSrc = readSrc('supabase/content_translations_migration.sql');
if (i18nSrc && migSrc) {
  const pick = (src, re) => {
    const m = src.match(re);
    return m ? [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]).sort().join(',') : null;
  };
  const ui = pick(i18nSrc, /LOCALES\s*=\s*\[([^\]]*)\]/);
  const db = pick(migSrc, /lang\s+text\s+not null\s+check\s*\(\s*lang\s+in\s*\(([^)]*)\)/i);
  if (ui === null || db === null) {
    warn('LOCALE_LIST_MISSING',
      `지원 언어 목록을 못 찾음 (lib/i18n.js=${ui === null ? 'X' : 'O'} / 마이그레이션=${db === null ? 'X' : 'O'}) — ` +
      `상수 이름이나 제약 형태가 바뀌었는지 확인할 것`);
  } else if (ui !== db) {
    err('LOCALE_DRIFT',
      `지원 언어가 어긋남 — lib/i18n.js=[${ui}] / content_translations.lang 제약=[${db}]. ` +
      `화면에만 있으면 저장이 거부돼 그 언어 번역이 통째로 안 되고, DB에만 있으면 아무도 고를 수 없다`);
  }
}

// ---------------------------------------------------------------------------
// 7-3. 모호어 목록이 실제 표기를 가리키는가 (2026-08-09 추가)
//
// lib/glossary.js 의 AMBIGUOUS_* 는 "게임 이름이면서 일상 낱말이기도 해서 치환하면 안 되는
// 표기" 목록이다. 여기 적힌 문자열이 실제 이름·용어와 한 글자라도 다르면 그 항목은
// **아무 일도 하지 않는다.** 그런데 에러는 안 난다 — 오타 하나로 보호가 풀리고,
// "소다 마시고 싶다"가 캐릭터 이름으로 치환돼도 아무도 모른다.
// ---------------------------------------------------------------------------
const glossarySrc = readSrc('lib/glossary.js');
if (glossarySrc) {
  const forms = { ko: new Set(), en: new Set(), ja: new Set() };
  for (const c of cdb) {
    if (c.name_kr) forms.ko.add(String(c.name_kr).trim());
    if (c.title) forms.en.add(String(c.title).trim());
    if (c.name_ja) forms.ja.add(String(c.name_ja).trim());
  }
  for (const t of (glossary?.terms) || []) {
    for (const f of ['ko', 'en', 'ja']) if (t[f]) forms[f].add(String(t[f]).trim());
  }
  for (const [constName, lang] of [['AMBIGUOUS_KO', 'ko'], ['AMBIGUOUS_EN', 'en'], ['AMBIGUOUS_JA', 'ja']]) {
    const m = glossarySrc.match(new RegExp(`${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`));
    if (!m) {
      warn('AMBIGUOUS_LIST_MISSING', `lib/glossary.js에서 ${constName}를 못 찾음 — 상수 이름이 바뀌었는지 확인할 것`);
      continue;
    }
    const listed = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    const ghosts = listed.filter((v) => !forms[lang].has(v));
    if (ghosts.length) {
      err('AMBIGUOUS_GHOST',
        `${constName}에 실제로 없는 표기가 있음: ${ghosts.join(', ')} — ` +
        `이 항목들은 아무 일도 하지 않는다. 오타라면 그 이름의 오검출 보호가 풀린 상태다`);
    }
  }
}

// ---------------------------------------------------------------------------
// 솔로레이드 실사용 조합 (data/soloRaidTeams.json + data/enikkAlias.json)
//
// enikk.app 시즌 페이지의 Teams 탭을 **사람이 브라우저로 열어 읽어 옮긴** 값이다.
// (enikk의 /api/graphql은 robots.txt가 Disallow라 스크립트로 긁지 않는다.)
// 옮겨 적는 과정이 사람 손을 타므로, 이름이 하나라도 우리 title과 어긋나면 ERROR로 세운다 —
// 조용히 다른 캐릭터로 읽히면 보스전 추천이 통째로 틀어진다.
//
// enikk은 콜라보 캐릭터를 짧게 적는다(Ada / Takina / Jill …). 그 대응은 enikkAlias.json에
// 두고, **별칭을 적용한 뒤의 이름만** 데이터 파일에 저장한다.
// ---------------------------------------------------------------------------
{
  const sr = read('soloRaidTeams.json');
  const alias = read('enikkAlias.json');

  // ⚠️ 가장 위험한 경우: enikk의 짧은 이름이 **우리 DB에도 있는 title**인데 다른 인물인 것.
  //    실제 사례 — enikk 'Rei'는 아야나미 레이(버스트3·작열)인데, 우리 DB의 title 'Rei'는
  //    라이(버스트1·수냉·방어형)다. 이름만 맞춰보면 그냥 통과해서 **엉뚱한 캐릭터가 조합에
  //    들어간다.** 이름 검사가 통과했다는 사실이 맞다는 뜻이 아니다(설계 원칙 3).
  //    그래서 겹치는 이름은 collisionNotes에 '왜 그쪽이 아닌지'를 적어야만 통과시킨다.
  for (const [short, full] of Object.entries(alias.aliases || {})) {
    if (!TITLES.has(full)) err('ENIKK_ALIAS_UNKNOWN', `enikkAlias: '${short}' → '${full}' — 그런 title이 DB에 없다`);
    if (short === full) err('ENIKK_ALIAS_USELESS', `enikkAlias: '${short}'는 우리 표기와 같다 — 별칭이 필요 없다`);
    else if (TITLES.has(short) && !String((alias.collisionNotes || {})[short] || '').trim()) {
      err('ENIKK_ALIAS_COLLISION', `enikkAlias: '${short}'는 우리 DB에도 있는 title인데 '${full}'로 옮기고 있다 — ` +
        'collisionNotes에 다른 인물인 근거(버스트·속성 등)를 적지 않으면 통과시키지 않는다');
    }
  }
  for (const short of Object.keys(alias.collisionNotes || {})) {
    if (!(alias.aliases || {})[short]) err('ENIKK_ALIAS_UNKNOWN', `enikkAlias.collisionNotes: '${short}'에 대응하는 별칭이 없다`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sr.meta?.capturedOn || ''))) {
    err('SRTEAM_SHAPE', 'soloRaidTeams.meta.capturedOn 날짜(YYYY-MM-DD)가 없다 — 언제 본 화면인지 모르면 낡았는지 판단할 수 없다');
  }
  const seenRaid = new Set();
  (sr.seasons || []).forEach((s) => {
    const who = `soloRaidTeams 시즌 ${s.raid}`;
    if (seenRaid.has(s.raid)) err('SRTEAM_DUP_SEASON', `${who}: 같은 시즌이 두 번 있다`);
    seenRaid.add(s.raid);
    if (!DOMAIN.element.includes(s.weakness)) {
      err('SRTEAM_SHAPE', `${who}: weakness='${s.weakness}'는 허용 속성이 아니다 (enikk 표기 Electronic은 우리 'electric'으로 옮긴다)`);
    }
    (s.teams || []).forEach((t, i) => {
      const w = `${who} #${i + 1}`;
      if (!Array.isArray(t.members) || t.members.length !== 5 || new Set(t.members).size !== 5) {
        err('SRTEAM_SHAPE', `${w}: 5인 조합이 아니거나 중복이 있다 — [${(t.members || []).join(', ')}]`);
        return;
      }
      const unknown = t.members.filter((m) => !TITLES.has(m));
      if (unknown.length) {
        err('SRTEAM_UNKNOWN_MEMBER', `${w}: DB에 없는 이름 ${unknown.join(', ')} — ` +
          '화면을 잘못 읽었거나 별칭이 빠졌다. 지어내지 말고 enikkAlias.json에 근거와 함께 추가할 것');
      }
      if (!Number.isInteger(t.parses) || t.parses <= 0) {
        err('SRTEAM_SHAPE', `${w}: parses='${t.parses}' — 1 이상의 정수여야 한다`);
      }
    });
    // 사용 횟수 내림차순으로 옮겼다고 적어뒀으니 실제로 그런지 본다(행이 밀려 적힌 것을 잡는다).
    const ps = (s.teams || []).map((t) => t.parses);
    if (ps.some((v, i) => i > 0 && v > ps[i - 1])) {
      err('SRTEAM_ORDER', `${who}: parses가 내림차순이 아니다 — 화면과 행이 어긋났을 수 있다`);
    }
  });
}

// ---------------------------------------------------------------------------
// 캐릭터별 채용률 등급 (metaStats.usageTier)
//
// 엔진이 REAL_TIER_SCORE로 점수를 매기는 값이라 등급 문자열이 어긋나면 **조용히 0점**이 된다
// (없는 키는 undefined → 0). 오타 하나로 그 캐릭터의 실사용 가산점이 통째로 사라진다.
// ---------------------------------------------------------------------------
{
  const SLICES = ['campaign', 'soloraid', 'arena', 'overall'];
  const GRADES = ['S', 'A', 'B', 'C', 'D', 'F'];
  const ut = meta.usageTier || {};
  SLICES.forEach((s) => {
    if (!ut[s] || !Object.keys(ut[s]).length) err('USAGETIER_MISSING_SLICE', `usageTier.${s} 슬라이스가 비었다 — 그 모드의 실사용 가산점이 전부 0이 된다`);
  });
  Object.entries(ut).forEach(([slice, entries]) => {
    if (!SLICES.includes(slice)) err('USAGETIER_SHAPE', `usageTier.${slice}: 모르는 슬라이스 이름 — 엔진의 MODE_TO_META_SLICE가 참조하지 않는다`);
    Object.entries(entries || {}).forEach(([title, e]) => {
      const w = `usageTier.${slice}['${title}']`;
      if (!GRADES.includes(e?.tier)) err('USAGETIER_SHAPE', `${w}: tier='${e?.tier}' — ${GRADES.join('/')} 중 하나여야 한다`);
      if (!(e?.usage >= 0 && e.usage <= 100)) err('USAGETIER_SHAPE', `${w}: usage='${e?.usage}' — 0~100 이어야 한다`);
    });
  });
}

// ---------------------------------------------------------------------------
// PvP 실사용 조합 (metaStats.pvp.topTeams)
//
// 챔피언 아레나 Teams 탭은 **슬롯 순서까지 구분해** 나열한다(같은 5명이 순서만 바꿔 여러 행).
// 우리 엔진은 구성을 집합으로 매칭하므로 순서 변형을 접어서 넣는다 — 접지 않으면 같은 조합이
// 후보 자리를 여러 개 차지한다. 그래서 **구성 중복이 남아 있으면 접다가 빠뜨린 것**이다.
// ---------------------------------------------------------------------------
{
  const teams = meta.pvp?.topTeams || [];
  const seenSet = new Set();
  teams.forEach((t, i) => {
    const w = `pvp.topTeams #${i + 1}`;
    if (!Array.isArray(t.members) || t.members.length !== 5 || new Set(t.members).size !== 5) {
      err('PVPTEAM_SHAPE', `${w}: 5인 조합이 아니거나 중복이 있다`);
      return;
    }
    const unknown = t.members.filter((m) => !TITLES.has(m));
    if (unknown.length) err('PVPTEAM_UNKNOWN_MEMBER', `${w}: DB에 없는 이름 ${unknown.join(', ')}`);
    if (!(t.wr >= 0 && t.wr <= 100)) err('PVPTEAM_SHAPE', `${w}: wr='${t.wr}' — 0~100 이어야 한다`);
    if (!Number.isInteger(t.n) || t.n <= 0) err('PVPTEAM_SHAPE', `${w}: n='${t.n}' — 1 이상의 정수여야 한다`);
    const key = [...t.members].sort().join('|');
    if (seenSet.has(key)) {
      err('PVPTEAM_DUP_SET', `${w}: 앞의 행과 5인 구성이 같다(슬롯 순서만 다름) — 접어서 넣어야 한다`);
    }
    seenSet.add(key);
  });
  const ad = teams.map((t) => t.adoption);
  if (ad.some((v, i) => i > 0 && v > ad[i - 1])) {
    err('PVPTEAM_ORDER', 'pvp.topTeams: adoption이 내림차순이 아니다 — 화면과 행이 어긋났을 수 있다');
  }
}

// ---------------------------------------------------------------------------
// PvP 부분 조합 (metaStats.pvp.pairs / trios / quads)
//
// 엔진이 REAL_PAIR_INDEX / REAL_TRIO_INDEX / REAL_QUAD_INDEX로 **정확히 이 구성일 때만**
// 매칭한다(lib/synergyEngine.js buildRealComboIndex → titleSetKey). 즉 멤버가 한 명이라도
// 틀리거나 인원 수가 어긋나면 그 항목은 **영원히 매칭되지 않는 키**가 되고 아무 신호도 없다.
//
// 이름은 위쪽 META_ORPHAN이 meta.pvp 아래 모든 배열을 훑어 이미 잡는다(역테스트로 확인:
// 'Anis: Star'를 'Anis Star'로 바꾸면 META_ORPHAN이 선다). 여기서 다시 세면 같은 사고가
// 두 줄로 보고될 뿐이라 **인원 수·값 범위·정렬만** 본다 — 2026-08-25 역테스트에서 이 셋이
// topTeams와 달리 무방비인 것을 확인하고 메웠다(pair에 3명 / adoption 밀어넣기 둘 다 통과했다).
// ---------------------------------------------------------------------------
{
  const SUBSETS = [['pairs', 2], ['trios', 3], ['quads', 4]];
  SUBSETS.forEach(([key, size]) => {
    const list = meta.pvp?.[key];
    if (list === undefined) return; // 없는 슬라이스는 엔진도 빈 인덱스로 돌아간다
    if (!Array.isArray(list)) {
      err('PVPCOMBO_SHAPE', `pvp.${key}가 배열이 아니다 — 엔진이 빈 인덱스로 돌아 실사용 가산점이 전부 사라진다`);
      return;
    }
    const seenSet = new Set();
    list.forEach((t, i) => {
      const w = `pvp.${key} #${i + 1}`;
      if (!Array.isArray(t.members) || t.members.length !== size || new Set(t.members).size !== size) {
        err('PVPCOMBO_SHAPE', `${w}: ${size}인 구성이 아니거나 중복이 있다 — [${(t.members || []).join(', ')}]`);
        return;
      }
      if (!(t.wr >= 0 && t.wr <= 100)) err('PVPCOMBO_SHAPE', `${w}: wr='${t.wr}' — 0~100 이어야 한다`);
      if (!Number.isInteger(t.n) || t.n <= 0) err('PVPCOMBO_SHAPE', `${w}: n='${t.n}' — 1 이상의 정수여야 한다`);
      if (!(t.adoption >= 0 && t.adoption <= 100)) err('PVPCOMBO_SHAPE', `${w}: adoption='${t.adoption}' — 0~100 이어야 한다`);
      const setKey = [...t.members].sort().join('|');
      if (seenSet.has(setKey)) {
        err('PVPCOMBO_DUP_SET', `${w}: 앞의 행과 구성이 같다(순서만 다름) — 엔진은 집합으로 매칭하므로 ` +
          '뒤의 행은 영원히 쓰이지 않는다. topTeams처럼 접어서 넣을 것');
      }
      seenSet.add(setKey);
    });
    // 화면 정렬 키는 adoption이다(pvp.meta.sort = 'Adoption 내림차순'). n은 내림차순이 아니므로
    // n으로 검사하면 실제 데이터에서 오탐이 난다 — 2026-08-25 실측으로 확인하고 adoption만 본다.
    const ad = list.map((t) => t.adoption);
    if (ad.some((v, i) => i > 0 && v > ad[i - 1])) {
      err('PVPCOMBO_ORDER', `pvp.${key}: adoption이 내림차순이 아니다 — 화면과 행이 어긋났을 수 있다`);
    }
  });
}

// ---------------------------------------------------------------------------
// 캠페인 실사용 조합 (metaStats.campaignCompositions)
//
// 2026-08-21부터 이것도 사람이 화면에서 옮긴다(그전에도 그랬지만 검사가 없었다).
// **화면의 '% of clears'는 totalUses / analyzedClears와 정확히 일치한다**(19행 전수 확인).
// 그래서 이 관계를 검사로 걸면 두 열 중 하나만 잘못 옮겨도 걸린다 — 전사 오류 탐지기다.
// ---------------------------------------------------------------------------
{
  const cc = meta.campaignCompositions || {};
  const analyzed = cc.meta?.analyzedClears;
  if (!Number.isInteger(analyzed) || analyzed <= 0) {
    err('CAMPCOMP_SHAPE', 'campaignCompositions.meta.analyzedClears가 없다 — % 교차검증을 할 수 없다');
  }
  const list = cc.list || [];
  list.forEach((t, i) => {
    const w = `campaignCompositions #${i + 1}`;
    if (!Array.isArray(t.members) || t.members.length !== 5 || new Set(t.members).size !== 5) {
      err('CAMPCOMP_SHAPE', `${w}: 5인 조합이 아니거나 중복이 있다`);
      return;
    }
    const unknown = t.members.filter((m) => !TITLES.has(m));
    if (unknown.length) err('CAMPCOMP_UNKNOWN_MEMBER', `${w}: DB에 없는 이름 ${unknown.join(', ')}`);
    if (!Number.isInteger(t.totalUses) || t.totalUses <= 0) {
      err('CAMPCOMP_SHAPE', `${w}: totalUses='${t.totalUses}' — 1 이상의 정수여야 한다`);
    } else if (Number.isInteger(analyzed) && analyzed > 0) {
      const derived = Number((t.totalUses / analyzed * 100).toFixed(2));
      if (Math.abs(derived - Number(t.pctOfClears)) > 0.01) {
        err('CAMPCOMP_PCT_MISMATCH', `${w}: pctOfClears=${t.pctOfClears}인데 ` +
          `totalUses(${t.totalUses})/analyzedClears(${analyzed})는 ${derived} — 둘 중 하나를 잘못 옮겼다`);
      }
    }
  });
  const uses = list.map((t) => t.totalUses);
  if (uses.some((v, i) => i > 0 && v > uses[i - 1])) {
    err('CAMPCOMP_ORDER', 'campaignCompositions: totalUses가 내림차순이 아니다 — 화면과 행이 어긋났을 수 있다');
  }
}

// ---------------------------------------------------------------------------
// 타워 실사용 조합 (data/towerCompositions.json)
//
// 솔로레이드와 같은 방식으로 사람이 화면에서 옮긴 값이라 검사도 같은 강도로 건다.
// pool은 enikk의 '타워 로스터 풀' 칩, tower는 우리 isTowerEligible이 받는 값이다
// (null = 트라이브 타워, 제한 없음).
// ---------------------------------------------------------------------------
{
  const tc = read('towerCompositions.json');
  const TOWERS = [null, 'elysion', 'missilis', 'tetra', 'pilgrim'];
  // 캡처일은 **풀마다** 다르다(칩을 하나씩 열어 옮기므로 같은 날이 아닐 수 있다).
  // 그래서 meta가 아니라 pool.capturedOn을 요구한다 — 한 풀만 낡는 상황을 놓치지 않으려면
  // 파일 전체에 날짜 하나를 붙이면 안 된다.
  const seenPool = new Set();
  (tc.pools || []).forEach((p) => {
    const who = `towerCompositions 풀 '${p.pool}'`;
    if (seenPool.has(p.pool)) err('TOWERCOMP_DUP_POOL', `${who}: 같은 풀이 두 번 있다`);
    seenPool.add(p.pool);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.capturedOn || ''))) {
      err('TOWERCOMP_SHAPE', `${who}: capturedOn 날짜(YYYY-MM-DD)가 없다 — 언제 본 화면인지 모르면 낡았는지 판단할 수 없다`);
    }
    if (!TOWERS.includes(p.tower === undefined ? 'x' : p.tower)) {
      err('TOWERCOMP_SHAPE', `${who}: tower='${p.tower}' — null/elysion/missilis/tetra/pilgrim 중 하나여야 한다`);
    }
    (p.teams || []).forEach((t, i) => {
      const w = `${who} #${i + 1}`;
      if (!Array.isArray(t.members) || t.members.length !== 5 || new Set(t.members).size !== 5) {
        err('TOWERCOMP_SHAPE', `${w}: 5인 조합이 아니거나 중복이 있다`);
        return;
      }
      const unknown = t.members.filter((m) => !TITLES.has(m));
      if (unknown.length) err('TOWERCOMP_UNKNOWN_MEMBER', `${w}: DB에 없는 이름 ${unknown.join(', ')}`);
      if (!Number.isInteger(t.uses) || t.uses <= 0) err('TOWERCOMP_SHAPE', `${w}: uses='${t.uses}' — 1 이상의 정수여야 한다`);
      // 기업 타워 풀이라면 멤버가 그 기업(또는 오버스펙) 자격을 갖춰야 한다.
      // 자격 없는 멤버가 섞이면 그 조합은 엔진에서 영원히 매칭되지 않는다 — 조용한 사문화다.
      if (p.tower) {
        const wrong = t.members.filter((m) => {
          const c = BY_TITLE.get(m);
          if (!c) return false;
          return p.tower === 'pilgrim'
            ? !(c.manufacturer === 'pilgrim' || c.overspec === true)
            : c.manufacturer !== p.tower;
        });
        if (wrong.length) {
          err('TOWERCOMP_INELIGIBLE', `${w}: '${p.tower}' 타워에 들어갈 수 없는 멤버 ${wrong.join(', ')} — 풀을 잘못 옮겼을 수 있다`);
        }
      }
    });
    const us = (p.teams || []).map((t) => t.uses);
    if (us.some((v, i) => i > 0 && v > us[i - 1])) {
      err('TOWERCOMP_ORDER', `${who}: uses가 내림차순이 아니다 — 화면과 행이 어긋났을 수 있다`);
    }
  });
}

// ---------------------------------------------------------------------------
// 티어 판정 기록 (data/tierJudgments.json)
//
// weeklyCheck가 "이 불일치는 이미 사람이 판정했다"고 판단하는 근거 파일이다. 즉 **이 파일이
// 틀리면 주간 점검이 진짜 불일치를 조용히 내려버린다.** 그래서 형태를 강하게 검사한다.
//
// 특히 `ours`는 지금 DB의 티어와 같아야 한다. 우리 값을 나중에 고쳐놓고 기록을 안 고치면,
// 기록은 옛 값 쌍을 가리키므로 새 불일치가 판정되지 않은 채 남는다.
// ---------------------------------------------------------------------------
{
  const judgments = read('tierJudgments.json');
  const MODES = ['story', 'bossing', 'pvp'];
  const VERDICTS = ['keep', 'hold'];
  const seen = new Set();
  judgments.forEach((j, i) => {
    const who = `tierJudgments[${i}] (${j.id} ${j.mode})`;
    if (!IDS.has(j.id)) {
      err('JUDGE_UNKNOWN_ID', `${who}: id '${j.id}'가 characterDatabase에 없음 — 이 기록은 아무 것도 안 덮는다`);
      return;
    }
    if (!MODES.includes(j.mode)) { err('JUDGE_SHAPE', `${who}: mode는 ${MODES.join('/')} 중 하나여야 함`); return; }
    if (!VERDICTS.includes(j.verdict)) err('JUDGE_SHAPE', `${who}: verdict='${j.verdict}' — ${VERDICTS.join('/')} 중 하나여야 함`);
    if (!DOMAIN.grades.includes(j.ours) || !DOMAIN.grades.includes(j.prydwen)) {
      err('JUDGE_SHAPE', `${who}: ours='${j.ours}' prydwen='${j.prydwen}' — 허용 등급이 아님`);
    }
    if (j.ours === j.prydwen) err('JUDGE_SHAPE', `${who}: 두 값이 같다 — 불일치가 아닌 것을 판정해둔 셈이다`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(j.decidedOn))) err('JUDGE_SHAPE', `${who}: decidedOn 날짜 형식(YYYY-MM-DD)이 아님`);
    if (!String(j.why || '').trim()) {
      err('JUDGE_NO_REASON', `${who}: why가 비어 있음 — 근거 없는 판정은 다음 사람이 검증할 수 없다`);
    }
    const key = `${j.id}|${j.mode}`;
    if (seen.has(key)) err('JUDGE_DUP', `${who}: 같은 캐릭터·모드 판정이 두 번 있다`);
    seen.add(key);
    const nowOurs = BY_TITLE.get(cdb.find((c) => c.id === j.id).title)?.tiers?.[j.mode];
    if (nowOurs && nowOurs !== j.ours) {
      err('JUDGE_STALE', `${who}: 기록의 우리 값 '${j.ours}'가 지금 DB의 '${nowOurs}'와 다름 — ` +
        '기록이 낡아 주간 점검이 이 불일치를 판정된 것으로 착각하지 않는다(다시 판정할 것)');
    }
  });
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
