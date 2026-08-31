#!/usr/bin/env node
/**
 * 엔진 근거 문장 실행 테스트 — 3개국어를 실제로 만들어보고 결과를 확인한다.
 *
 *   node scripts/testEngineReasons.mjs
 *
 * 왜 testI18n만으로는 부족한가:
 *   testI18n은 **정적 검사**다. 키가 세 언어에 다 있는지, 엔진이 부르는 키가 실재하는지,
 *   엔진에 한국어가 남았는지까지는 잡지만, 문장을 **실제로 만들어보지는 않는다.**
 *   그래서 다음 두 가지를 못 잡는다 — 둘 다 에러 없이 조용히 틀린 문장을 낸다:
 *     (1) 템플릿이 쓰는 인자를 호출부가 안 넘긴다  -> 문장에 `undefined`가 박힌다
 *     (2) 인용하는 데이터에 `_en`/`_ja`가 없다      -> 영어·일본어 문장에 한국어가 섞인다
 *
 *   (2)는 특히 위험하다. 조합·투자 노트·페어/카운터/애장품 자료가 늘어날 때마다
 *   번역을 빠뜨리면 여기로 샌다. checkData는 필드 존재를 보지만 "근거 문장에 실제로
 *   그 필드가 쓰이는지"는 여기서만 확인된다.
 *
 * ⚠️ lib/synergyEngine.js는 JSON을 `with { type: 'json' }` 없이 import해서 순수 Node로는
 *    직접 못 부른다. scripts/testCharacterNames.mjs와 같은 방식으로 임시 사본을 만들어
 *    import 구문만 바꿔치기해 불러오고, 끝나면 지운다.
 *
 * 기준선: 문제 0건.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'lib');
const LOCALES = ['ko', 'en', 'ja'];
const HANGUL = /[가-힣]/;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-engine-'));

// data/*.json → import assertion 추가. 상대 경로 모듈 → 임시 폴더의 사본으로.
const fixImports = (src) =>
  src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, name) =>
      `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${name}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, name) =>
      `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${name}.mjs`)).href)};`);

for (const f of ['synergyEngine', 'engineReasons', 'i18n']) {
  fs.writeFileSync(path.join(tmp, `${f}.mjs`), fixImports(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
}

const engine = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);
const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const synergyNotes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'synergyNotes.json'), 'utf8'));

// 아키타입의 mode 값 → scoreTeam이 받는 mode. (엔진의 MODE_COMPAT과 반대 방향 매핑이라
// 여기서 따로 둔다 — 아키타입이 매칭되려면 호환 모드로 채점해야 한다)
const MODE_FOR_ARCHETYPE = {
  campaign: 'campaign', story: 'campaign', tribe_tower: 'tribe_tower',
  bossing: 'bossing', raid: 'bossing', pvp: 'pvp',
};

const problems = [];
const pick = (titles) => titles.map((t) => cdb.find((c) => c.title === t)).filter(Boolean);

// 문장 종류를 최대한 많이 태우는 구성들.
// (아키타입 완전일치 · 페어 시너지 · 낭비 인원 · 실전 기록 · 토템 · 투자 안내)
const TEAMS = [
  { label: '灼熱 보스전', mode: 'bossing', titles: ['Little Mermaid', 'Crown', 'Rapi: Red Hood', 'Diesel: Winter Sweets', 'Mast: Romantic Maid'] },
  { label: 'PvP', mode: 'pvp', titles: ['Noah', 'Blanc', 'Centi', 'Jackal', 'Scarlet'] },
  { label: '캠페인', mode: 'campaign', titles: ['Liter', 'Crown', 'Naga', 'Red Hood', 'Alice'] },
  { label: '타워', mode: 'tribe_tower', titles: ['D: Killer Wife', 'Diesel', 'Phantom', 'Rapi: Red Hood', 'Helm'] },
];

// 언어별 결과를 모아 (a) undefined (b) 한글 누출 (c) 언어 간 문장 수/점수 차이를 본다.
const inspect = (label, lang, lines) => {
  lines.forEach((s, i) => {
    const text = String(s ?? '');
    if (typeof s !== 'string' || text.includes('undefined')) {
      problems.push(`${label} [${lang}] #${i} 인자 누락으로 undefined — ${text.slice(0, 120)}`);
    }
    if (lang !== 'ko' && HANGUL.test(text)) {
      problems.push(`${label} [${lang}] #${i} 한국어 누출 — ${text.match(/[가-힣][^ ]*/)?.[0]} · ${text.slice(0, 120)}`);
    }
  });
};

for (const team of TEAMS) {
  const members = pick(team.titles);
  if (members.length !== 5) {
    problems.push(`${team.label}: 테스트 구성원을 찾지 못함(${members.length}/5) — 이름이 바뀌었는지 확인할 것`);
    continue;
  }
  const seen = {};
  for (const lang of LOCALES) {
    const r = engine.scoreTeam(members, team.mode, { lang });
    inspect(team.label, lang, r.reasons || []);
    seen[lang] = { n: (r.reasons || []).length, score: r.totalScore };
  }
  // 언어를 바꿨다고 점수나 근거 개수가 달라지면 엔진이 결정적이지 않다는 뜻이다.
  const base = seen[LOCALES[0]];
  for (const lang of LOCALES.slice(1)) {
    if (seen[lang].score !== base.score || seen[lang].n !== base.n) {
      problems.push(`${team.label}: 언어에 따라 결과가 달라짐 — ko(${base.score}/${base.n}) vs ${lang}(${seen[lang].score}/${seen[lang].n})`);
    }
  }
}

// --- 아키타입 인용문 전수 (2026-08-25) ---
//
// 위의 표본 4구성만으로는 아키타입 483건 중 극히 일부만 태운다. 실제로 역테스트에서
// `note_en`을 하나 지웠더니 **표본에 안 걸려 그냥 통과했다.** 조합 자료는 앞으로도 계속
// 늘어나므로, 5인이 전부 해석되는 아키타입은 전부 한 번씩 영어로 채점해 인용문이
// 한국어로 새는지 본다(영어 하나만 봐도 `_en` 누락은 전부 드러난다).
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const archetypes = Array.isArray(synergyNotes.archetypes)
  ? synergyNotes.archetypes
  : Object.values(synergyNotes.archetypes || {});
// 같은 순회에서 **완전일치가 부분일치에 밀려나지 않는지**도 본다 (2026-08-25 결함).
//
//   부분일치 점수(당시 `5 × 일치인원`)가 완전일치(14)를 넘겨서, 5명이
//   정확히 일치하는 조합의 이름이 근거에서 사라지고 있었다 — 실측 26.8%만 살아남았다.
//   정렬(완전일치 우선)과 부분일치 완성도 비례식으로 고쳐 94.3%가 됐다.
//
//   회귀는 조용하다. 문장이 한 줄 없어질 뿐 에러도 점수 이상도 안 난다. 그래서 검사한다.
//   **부분일치에 밀린 경우만** 문제로 센다 — 완전일치가 캡(3)을 넘겨 서로 밀어내는 것은
//   정상이고(자매 변형이 여럿 등록된 조합), 그건 아래 `crowdedByFull`로 따로 센다.
// 아키타입 헤드라인은 두 종류다 — 5인이면 archetype_full, 그 미만이면 archetype_core.
// 캡(3) 경합을 셀 때는 둘 다 세야 한다.
const isArchetypeHeadline = (s) =>
  s.startsWith('This is the composition known as') || /^All \d+ character\(s\) registered for '/.test(s);

let archetypeChecked = 0;
let ownNameKept = 0;
let crowdedByFull = 0;
const lostToPartial = [];
for (const a of archetypes) {
  const members = (a.members || []).map((t) => byTitle.get(t));
  if (members.length !== 5 || members.some((m) => !m)) continue;
  const mode = MODE_FOR_ARCHETYPE[a.mode] || 'campaign';
  const r = engine.scoreTeam(members, mode, { lang: 'en' });
  inspect(`archetype/${a.id}`, 'en', r.reasons || []);
  archetypeChecked += 1;

  // 완전일치가 실제로 성립하는 경우에만 판정한다(애장품 전제·비권장·버스트 미충족 제외).
  if (a.notRecommended || a.requiresTreasure || !r.valid) continue;
  const lines = r.reasons || [];
  const ownName = `This is the composition known as '${a.name_en || a.name}'.`;
  if (lines.some((s) => String(s).startsWith(ownName))) { ownNameKept += 1; continue; }
  // 2026-09-01: 헤드라인이 두 종류가 됐다(5인=archetype_full, 그 미만=archetype_core).
  // 한쪽만 세면 상대가 core로 바뀐 순간 "밀려났다"고 오탐한다 — 실제로 11건 났다.
  const nFull = lines.filter((s) => isArchetypeHeadline(String(s))).length;
  if (nFull >= 3) crowdedByFull += 1;          // 캡이 헤드라인끼리 겨룬 결과 — 정상
  else lostToPartial.push(a.id);
}
problems.push(...lostToPartial.map((id) =>
  `archetype/${id}: 5명이 정확히 일치하는데 자기 조합 이름이 근거에서 사라졌다 ` +
  `(부분일치가 완전일치를 밀어냄 — archetypePartialPoints와 정렬을 확인할 것)`));

// --- 5인이 **아닌** 아키타입 전수 (2026-09-01) ---
//
// 위 순회는 `members.length !== 5`를 건너뛴다. 그런데 483건 중 123건이 5인이 아니고
// (1인 11 · 2인 20 · 3인 41 · 4인 51), 그쪽은 `archetype_core`라는 **다른 문장**을 탄다.
// 그 문장은 2026-09-01에 새로 생겼다 — "완전일치"의 정의가 findExactTeamMatch(5인만 인정)와
// scoreTeam(크기 무관) 사이에서 갈려 있어서, 2인짜리 조합이 "이 구성은 X로 알려진 조합"으로
// 나가고 있었다.
//
// 검사가 없으면 세 언어 중 하나가 비거나 note_en이 없어 한국어가 새도 아무도 모른다 —
// 2026-08-25에 정확히 그 방식으로 놓친 적이 있다(표본에 안 걸려 그냥 통과).
// 등록 멤버에 버스트를 메울 인원을 붙여 5인으로 만들고 세 언어로 채점한다.
const buildFive = (base) => {
  const team = [...base];
  for (const b of ['1', '2', '3']) {
    if (team.some((m) => String(m.burst) === b)) continue;
    const cand = cdb.find((c) => String(c.burst) === b && !team.some((m) => m.title === c.title));
    if (cand) team.push(cand);
  }
  if (team.length > 5) return null; // 등록 멤버만으로 버스트가 안 맞는 경우
  for (const c of cdb) {
    if (team.length >= 5) break;
    if (!team.some((m) => m.title === c.title)) team.push(c);
  }
  return team.length === 5 ? team : null;
};

let coreChecked = 0;
let coreKept = 0;
let coreCrowded = 0;
const coreLost = [];
for (const a of archetypes) {
  const need = a.members || [];
  const specSize = need.length + (a.flexSlots || []).length;
  if (need.length === 0 || specSize >= 5) continue;
  // 위 5인 순회와 같은 제외 조건. 애장품 전제(requiresTreasure)는 실제로 장착했을 때만
  // 인정되는데 여기서는 treasureIds를 안 넘기므로 엔진이 정당하게 건너뛴다 — 이걸 빼먹어서
  // 처음에 9건이 오탐으로 떴다. 비권장 조합도 애초에 인정하지 않는다.
  if (a.notRecommended || a.requiresTreasure) continue;
  const members = need.map((t) => byTitle.get(t));
  if (members.some((m) => !m)) continue; // 이름 불일치는 checkData가 잡는다
  const team = buildFive(members);
  if (!team) {
    // 조용히 넘기지 않는다 — 검사하지 못했다는 사실 자체를 드러낸다.
    problems.push(`archetype-core/${a.id}: 5인 구성을 만들 수 없어 문장을 검사하지 못했다`);
    continue;
  }
  const mode = MODE_FOR_ARCHETYPE[a.mode] || 'campaign';
  coreChecked += 1;

  // ko/ja는 undefined·한국어 누출만 본다. 문장 유지 판정은 영어에서 한다(위 순회와 같은 방식).
  for (const lang of LOCALES) {
    const r = engine.scoreTeam(team, mode, { lang });
    inspect(`archetype-core/${a.id}`, lang, r.reasons || []);
  }
  const lines = (engine.scoreTeam(team, mode, { lang: 'en' }).reasons || []).map(String);
  const ownCore = `All ${need.length} character(s) registered for '${a.name_en || a.name}'`;
  if (lines.some((s) => s.startsWith(ownCore))) { coreKept += 1; continue; }
  // 아키타입 헤드라인(완전일치 + core)이 캡(3)을 채웠으면 밀린 것이라 정상이다.
  const nHead = lines.filter(isArchetypeHeadline).length;
  if (nHead >= 3) coreCrowded += 1;
  else coreLost.push(a.id);
}
problems.push(...coreLost.map((id) =>
  `archetype-core/${id}: 등록 멤버가 전부 있는데 archetype_core 문장이 안 나왔다 ` +
  `(scoreTeam의 specSize 분기를 확인할 것)`));
if (coreChecked > 0 && coreKept === 0) {
  problems.push(
    `5인이 아닌 아키타입 ${coreChecked}건을 태웠는데 archetype_core 문장이 한 번도 안 나왔다 ` +
    `— 분기가 통째로 죽었다`);
}

// 점수 쪽 불변식 — 위의 문장 검사는 **정렬** 회귀만 잡는다. 점수식을 되돌려도 정렬이
// 남아 있으면 문장은 멀쩡하고 점수만 뒤집히는데, 그 점수는 게시판 배지로 그대로 보인다
// (역테스트에서 실제로 놓쳤다). 그래서 여기서 직접 확인한다.
//
//   (1) 부분일치 < 완전일치        — 힌트가 실물보다 값질 수 없다
//   (2) 완성도가 높을수록 점수도 높다 — 3/5와 4/5가 같으면 등급이 뭉개진 것이다
//       (1차 수정에서 `min(5 × 인원, 14)` 천장 때문에 실제로 뭉개졌었다)
//
// 아키타입 인원은 데이터상 1~5명이므로 조합을 전부 돈다.
for (let need = 2; need <= 5; need += 1) {
  let prev = -Infinity;
  for (let have = 1; have < need; have += 1) {
    const p = engine.archetypePartialPoints(have, need);
    if (p >= engine.ARCHETYPE_FULL_POINTS) {
      problems.push(`아키타입 점수 역전: 부분일치 ${have}/${need} = ${p}점 >= 완전일치 ` +
        `${engine.ARCHETYPE_FULL_POINTS}점 — 힌트가 실물보다 값질 수 없다`);
    }
    if (p <= prev) {
      problems.push(`아키타입 점수 등급 뭉개짐: ${have}/${need} = ${p}점이 ` +
        `${have - 1}/${need} = ${prev}점 이하다 — 완성도가 높으면 점수도 높아야 한다`);
    }
    prev = p;
  }
}

// headline 경로(findRealUsageTeamMatch)와 폴백 탐색(recommendTeams)도 태운다.
//
// recommendTeams는 전수 탐색이라 로스터 전체(198명)로 6번 돌리면 이 스크립트만 20초가 넘는다.
// 여기서 보려는 건 "그 경로의 문장이 제대로 나오는가"이지 최적 조합이 아니므로, 탐색 대상은
// 버킷 상한(BUCKET_CAP=8)을 채우고도 남을 만큼만 준다. 실사용 매칭(findRealUsageTeamMatch,
// findExactTeamMatch)은 로스터가 넓어야 실제로 걸리므로 전체를 그대로 쓴다.
const searchRoster = cdb.slice(0, 60);
for (const mode of ['campaign', 'pvp']) {
  for (const lang of LOCALES) {
    const rec = engine.recommendTeams(searchRoster, mode, { topN: 1, lang });
    inspect(`recommendTeams/${mode}`, lang, rec.teams?.[0]?.reasons || []);
    const real = engine.findRealUsageTeamMatch(cdb, mode, { lang });
    if (real) inspect(`findRealUsageTeamMatch/${mode}`, lang, real.reasons || []);
    const exact = engine.findExactTeamMatch(cdb, mode, { lang });
    if (exact) inspect(`findExactTeamMatch/${mode}`, lang, exact.reasons || []);
  }
}

// 로스터가 비어 버스트가 안 채워지는 경우의 error 문장도 언어별로 확인한다.
for (const lang of LOCALES) {
  const empty = engine.recommendTeams(cdb.filter((c) => c.burst === '1'), 'campaign', { lang });
  if (empty.error) inspect('recommendTeams/error', lang, [empty.error]);
  else problems.push(`recommendTeams/error [${lang}]: 버스트가 모자란데 error가 없다`);
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n엔진 근거 문장 실행 테스트 — 구성 ${TEAMS.length}개 × ${LOCALES.length}개 언어 ` +
  `+ 아키타입 ${archetypeChecked}건 + 탐색 경로`);
console.log(`완전일치 자기 이름 유지 ${ownNameKept}건 · 완전일치끼리 캡 경합 ${crowdedByFull}건 ` +
  `· 부분일치에 밀림 ${lostToPartial.length}건(0이어야 함)`);
console.log(`5인이 아닌 아키타입 ${coreChecked}건 — core 문장 유지 ${coreKept}건 · 캡 경합 ` +
  `${coreCrowded}건 · 누락 ${coreLost.length}건(0이어야 함)`);
if (problems.length) {
  console.log(`문제 ${problems.length}건\n`);
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  process.exit(1);
}
console.log('문제 0건 — 전부 통과\n');
