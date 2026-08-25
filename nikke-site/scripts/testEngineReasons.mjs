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
let archetypeChecked = 0;
for (const a of archetypes) {
  const members = (a.members || []).map((t) => byTitle.get(t));
  if (members.length !== 5 || members.some((m) => !m)) continue;
  const mode = MODE_FOR_ARCHETYPE[a.mode] || 'campaign';
  const r = engine.scoreTeam(members, mode, { lang: 'en' });
  inspect(`archetype/${a.id}`, 'en', r.reasons || []);
  archetypeChecked += 1;
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
if (problems.length) {
  console.log(`문제 ${problems.length}건\n`);
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  process.exit(1);
}
console.log('문제 0건 — 전부 통과\n');
