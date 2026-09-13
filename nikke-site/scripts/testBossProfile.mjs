#!/usr/bin/env node
/**
 * 보스별 방어 구성 — 랭커 조합에서 센 값이 맞는가, 그리고 그 문장이 제대로 나가는가. (2026-09-11)
 *
 *   node scripts/testBossProfile.mjs
 *
 * lib/synergyEngine.js의 `bossDefenseProfile()`은 soloRaidTeams에서 **세기만 한다**.
 * 보스전에서 약점 속성을 고르면, 그 보스의 랭커 과반과 반대로 간 조합에만 한 줄이 붙는다.
 *
 * 이 검사가 잡는 것:
 *   ① 파생값이 원본에서 다시 세어져 나오는가 (엔진 밖에서 따로 센 값과 대조)
 *   ② metaStats.soloRaidByElement와 soloRaidTeams가 **같은 시즌**을 가리키는가
 *      → 지금은 5속성 전부 맞는데 **우연히 맞은 것**이다. 한쪽만 갱신되면 한 화면에
 *        서로 다른 보스 이야기가 섞인다(속성 문장은 metaStats, 방어 문장은 soloRaidTeams).
 *   ③ 문장이 규칙대로 붙는가 — 과반이 넣었는데 없음 / 과반이 안 넣었는데 있음 / 나머지는 없음
 *   ④ 세 언어로 실제로 만들어 undefined·한국어 누출이 없는가
 *   ⑤ **점수를 안 건드리는가** — 이 기능은 정보만 붙인다. 엔진 소스의 그 블록에 점수 대입이
 *      있는지 직접 본다(세 언어 점수 비교로는 못 잡는다 — 아래 ⑤-b 주석)
 *   ⑥ **화면으로 가는 `bossDefenseNote` 필드가 세 경로 모두에서 살아 나오는가**(2026-09-13) —
 *      findRealUsageTeamMatch·findExactTeamMatch는 필드를 골라 옮겨서 새 필드가 조용히 빠진다
 *
 * ⚠️ testEngineReasons는 `bossElement`를 한 번도 넘기지 않는다. 그래서 이 문장뿐 아니라
 *    기존 속성별 실사용률 문장(element_usage_high/low)도 **그 검사로는 실제로 만들어진 적이
 *    없었다.** 여기서 함께 태운다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'lib');
const HANGUL = /[가-힣]/;
const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

// 엔진은 node로 직접 못 부른다(JSON import에 `with { type: 'json' }`이 없음) — testEngineReasons와 같은 하네스
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-boss-'));
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
const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });

const cdb = j('characterDatabase.json');
const solo = j('soloRaidTeams.json');
const meta = j('metaStats.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));
const problems = [];
const line = '─'.repeat(84);

console.log(line);
console.log('보스별 방어 구성 — 랭커 조합에서 센 값과 그 문장');
console.log(line);

// ① 엔진 밖에서 따로 센다
const expect = {};
for (const se of solo.seasons || []) {
  const key = engine.WEAKNESS_TO_BOSS_ELEMENT[String(se.weakness || '').toLowerCase()];
  if (!key) { problems.push(`약점 속성을 매핑 못 함: '${se.weakness}' (시즌 ${se.raid})`); continue; }
  const usable = (se.teams || []).filter((t) => (t.members || []).every((n) => byTitle.has(n)));
  const dropped = (se.teams || []).length - usable.length;
  if (dropped) problems.push(`시즌 ${se.raid} '${se.boss}'에 이름을 못 찾는 멤버가 있는 팀 ${dropped}건 — 방어형 집계에서 빠진다`);
  expect[key] = {
    season: se.raid, boss: se.boss, teams: usable.length,
    withDefender: usable.filter((t) => t.members.some((n) => byTitle.get(n).class === 'defender')).length,
  };
}

console.log('  속성        시즌  보스               방어형 넣은 팀');
for (const [el, e] of Object.entries(expect)) {
  const got = engine.bossDefenseProfile(el);
  const pct = Math.round(e.withDefender / e.teams * 100);
  console.log('  ' + el.padEnd(11) + String(e.season).padStart(4) + '  ' + e.boss.padEnd(18)
    + `${e.withDefender}/${e.teams} (${pct}%)  → ` + (e.withDefender * 2 > e.teams ? '과반이 넣음' : e.withDefender * 2 < e.teams ? '과반이 안 넣음' : '정확히 반'));
  if (!got) { problems.push(`엔진이 '${el}'의 방어 구성을 못 돌려준다`); continue; }
  for (const k of ['season', 'boss', 'teams', 'withDefender']) {
    if (got[k] !== e[k]) problems.push(`'${el}' ${k}: 엔진 ${got[k]} ≠ 원본에서 센 값 ${e[k]}`);
  }

  // ② 두 파일이 같은 시즌을 가리키는가
  const m = meta.soloRaidByElement?.[el];
  if (m && Number(m.season) !== Number(e.season)) {
    problems.push(`'${el}': metaStats.soloRaidByElement는 시즌 ${m.season}('${m.boss}'), soloRaidTeams는 시즌 ${e.season}('${e.boss}') — `
      + '한 화면에 서로 다른 보스 이야기가 섞인다. 둘 중 하나가 갱신되지 않았다');
  }
}

// ③④⑤ 실제로 채점해 본다. 방어형 없는 조합 / 있는 조합 — 둘 다 버스트 1·2·3이 성립한다.
const NO_DEF = ['Liter', 'Naga', 'Rapi: Red Hood', 'Modernia', 'Alice'];
const WITH_DEF = ['Liter', 'Crown', 'Rapi: Red Hood', 'Modernia', 'Alice'];
const pick = (ts) => ts.map((t) => byTitle.get(t));
for (const ts of [NO_DEF, WITH_DEF]) {
  const miss = ts.filter((t) => !byTitle.has(t));
  if (miss.length) problems.push(`검사용 조합의 캐릭터를 못 찾음: ${miss.join(', ')}`);
}
const DEF_KEYS = { ko: '[랭커 기록]', en: '[Ranker record]', ja: '［ランカー記録］' };

let fired = 0;
for (const [el, e] of Object.entries(expect)) {
  const want = {
    NO_DEF: e.withDefender * 2 > e.teams ? 'common' : null,
    WITH_DEF: e.withDefender * 2 < e.teams ? 'rare' : null,
  };
  for (const [label, ts] of [['NO_DEF', NO_DEF], ['WITH_DEF', WITH_DEF]]) {
    const scores = {};
    for (const lang of ['ko', 'en', 'ja']) {
      const r = engine.scoreTeam(pick(ts), 'bossing', { lang, bossElement: el });
      scores[lang] = r.totalScore;
      const lines = (r.reasons || []).map((x) => String(x ?? ''));
      lines.forEach((s) => {
        if (/undefined|NaN|\[object Object\]/.test(s)) problems.push(`[${el}/${label}/${lang}] 문장에 빈 값: ${s.slice(0, 90)}`);
        if (lang !== 'ko' && HANGUL.test(s)) problems.push(`[${el}/${label}/${lang}] 한국어 누출: ${s.slice(0, 90)}`);
      });
      const defLines = lines.filter((s) => s.startsWith(DEF_KEYS[lang]));
      const got = defLines.length === 0 ? null
        : (lang === 'en' ? (/has no Defender/.test(defLines[0]) ? 'common' : 'rare')
          : lang === 'ja' ? (/防御型がいません/.test(defLines[0]) ? 'common' : 'rare')
            : (/방어형이 없습니다/.test(defLines[0]) ? 'common' : 'rare'));
      if (defLines.length > 1) problems.push(`[${el}/${label}/${lang}] 방어 문장이 ${defLines.length}번 붙었다`);
      if (got !== want[label]) {
        problems.push(`[${el}/${label}/${lang}] 방어 문장: 기대 ${want[label] || '없음'} · 실제 ${got || '없음'}`);
      }
      if (got && lang === 'ko') fired += 1;
      // 숫자가 원본과 같은가 — 문장에 박힌 값을 다시 읽는다
      if (got && lang === 'en') {
        const m = defLines[0].match(/Of (\d+) ranker teams.*?season (\d+)/);
        if (!m || Number(m[1]) !== e.teams || Number(m[2]) !== e.season) {
          problems.push(`[${el}/${label}] 문장의 팀 수·시즌이 원본과 다르다: ${defLines[0].slice(0, 100)}`);
        }
      }
    }
    // ⑤ 점수는 언어와 무관해야 한다
    if (new Set(Object.values(scores)).size !== 1) {
      problems.push(`[${el}/${label}] 언어마다 점수가 다르다: ${JSON.stringify(scores)}`);
    }
  }
}

// ⑥ **화면으로 가는 필드가 세 경로 모두에서 살아 나오는가.** (2026-09-13)
//    추천 화면은 reasons를 그리지 않으므로 이 문장은 `bossDefenseNote` 필드로 따로 나간다.
//    그런데 findRealUsageTeamMatch·findExactTeamMatch는 scoreTeam 결과를 **필드를 골라** 옮긴다 —
//    새 필드를 거기 안 적으면 조용히 빠진다(실제로 빠질 뻔했다). 그리고 그 둘이 우선 경로라
//    빠지면 **대부분의 추천에서** 문장이 사라진다. 판정: reasons에 방어 문장이 있으면 필드도 그 문장이어야
//    하고, 없으면 필드가 null이어야 한다.
{
  const isDef = (s) => /^(\[랭커 기록\]|\[Ranker record\]|［ランカー記録］)/.test(String(s || ''));
  const cases = [
    // 실사용 등록 조합 그대로 → findRealUsageTeamMatch가 잡는다
    { label: 'Wind 실사용 팀(방어형 없음)', el: 'Wind', ts: ['Cinderella: Crystal Wave', 'Nayuta', 'Little Mermaid', 'Velvet', 'Privaty'] },
    { label: 'Iron 실사용 팀(크라운 있음)', el: 'Iron', ts: ['Crown', 'Naga', 'Anis: Star', 'Rapi: Red Hood', 'Privaty'] },
    // prydwen 보스전 아키타입 그대로 → findExactTeamMatch가 잡는다.
    // ⚠️ 처음엔 위 두 조합만 넣었는데 **findExactTeamMatch는 둘 다 매칭되지 않아** 그 경로가 한 번도
    //    검사되지 않았다. 역테스트로 그 경로의 필드를 지워도 통과해서 알았다.
    // (레드 후드가 든 아키타입은 `ambiguousBurst`라 완전일치 후보에서 걸러진다 — 처음 고른 조합이 그래서 안 맞았다)
    { label: 'Iron 아키타입(크라운 있음)', el: 'Iron', ts: ['Crown', 'Zwei', 'Snow White', 'Maxwell', 'Helm: Aquamarine'], needExact: true },
  ];
  let checkedPaths = 0;
  for (const cs of cases) {
    const owned = pick(cs.ts);
    if (owned.some((c) => !c)) { problems.push(`⑥ 검사용 조합 캐릭터를 못 찾음: ${cs.label}`); continue; }
    for (const lang of ['ko', 'en', 'ja']) {
      const opts = { bossElement: cs.el, lang };
      const paths = [
        ['scoreTeam', engine.scoreTeam(owned, 'bossing', opts)],
        ['findRealUsageTeamMatch', engine.findRealUsageTeamMatch(owned, 'bossing', opts)],
        ['findExactTeamMatch', engine.findExactTeamMatch(owned, 'bossing', opts)],
        ['recommendTeams[0]', (engine.recommendTeams(owned, 'bossing', opts).teams || [])[0]],
      ];
      if (cs.needExact && !paths.find(([nm]) => nm === 'findExactTeamMatch')[1]) {
        problems.push(`⑥ [${cs.label}/${lang}] findExactTeamMatch가 매칭되지 않는다 — 이 경로를 검사할 조합이 없어졌다(아키타입이 바뀌었으면 조합을 갈아 끼울 것)`);
      }
      for (const [name, r] of paths) {
        if (!r) continue; // 그 경로가 이 로스터에 매칭되지 않음 — 넘어간다
        checkedPaths += 1;
        const line = (r.reasons || []).find(isDef) || null;
        if (!('bossDefenseNote' in r)) {
          problems.push(`⑥ [${cs.label}/${lang}] ${name} 결과에 bossDefenseNote 필드가 없다 — 필드를 골라 옮기면서 빠뜨렸다`);
        } else if ((r.bossDefenseNote || null) !== line) {
          problems.push(`⑥ [${cs.label}/${lang}] ${name}: reasons의 방어 문장과 bossDefenseNote가 다르다`);
        }
      }
    }
  }
  if (checkedPaths === 0) problems.push('⑥ 어떤 경로도 검사되지 않았다 — 검사용 조합이 매칭되지 않는다');
  console.log(`  화면 필드(bossDefenseNote) 전달 — ${checkedPaths}경로 확인`);
}

// ⑤-b **점수를 안 건드리는가 — 소스에서 직접 본다.**
//     처음엔 "세 언어의 점수가 같은가"로 쟀는데, 그건 이 블록에 `score += 10`을 넣어도
//     세 언어가 똑같이 오르므로 통과한다. 잡으려는 고장("정보 블록이 점수를 바꾼다")을
//     원리적으로 못 잡는 검사였다(원칙 4). 고장의 단위가 "그 블록 안의 점수 대입"이므로
//     그 블록을 잘라 점수 대입이 있는지 본다.
{
  const src = fs.readFileSync(path.join(LIB, 'synergyEngine.js'), 'utf8');
  const start = src.indexOf('// --- 보스별 방어 구성 (2026-09-11)');
  const end = src.indexOf('// --- 조건부 매칭 헬퍼 ---', start);
  if (start < 0 || end < 0) {
    problems.push('synergyEngine.js에서 보스별 방어 구성 블록을 못 찾는다 — 표지 주석이 바뀌었으면 이 검사도 고칠 것');
  } else {
    const block = src.slice(start, end).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const hit = block.match(/\b(?:score|totalScore)\s*(?:[-+*/]?=)(?!=)/);
    if (hit) problems.push(`보스별 방어 구성 블록이 점수를 바꾼다(\`${hit[0].trim()}\`) — 이 기능은 정보만 붙여야 한다`);
  }
}

console.log('');
console.log(`  문장이 붙은 경우 ${fired}건 (속성 5 × 조합 2 중) · 세 언어로 만들어 봄`);
console.log('  ⚠️ 점수는 안 건드린다. 랭커는 필요한 만큼만 방어 자원을 들고 가므로 생존을 점수에 넣으면');
console.log('     탱커를 쌓은 조합이 높게 나온다 — 랭커 조합과 반대 방향이다.');
console.log(line);

cleanup();
if (problems.length) {
  console.log(`\n문제 ${problems.length}건\n`);
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log('');
  process.exit(1);
}
console.log('문제 0건\n');
