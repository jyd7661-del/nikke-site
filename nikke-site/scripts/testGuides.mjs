/**
 * 가이드 글 검사 — /guide (2026-09-04)
 *
 * ■ 이 검사가 막으려는 고장 (전부 에러 없이 조용히 잘못되는 것들)
 *
 *   ① 목록과 본문이 어긋난다. `lib/guides.js`의 GUIDES와 `app/guide/[slug]/page.js`의 BODY를
 *      **양쪽 다** 고쳐야 하는데 한쪽만 고치면, 목록에 뜨는데 404가 나거나 페이지는 있는데
 *      아무도 못 찾는다. 빌드는 통과한다.
 *
 *   ② slug가 URL로 못 쓸 문자를 갖는다. 도감 id의 `ID_URL_UNSAFE`와 같은 고장이다.
 *
 *   ③ **글의 숫자가 데이터와 다르다.** 이게 제일 위험하다. 글은 멀쩡히 렌더되고 숫자만
 *      틀린다. 그래서 `lib/guideStats.js`를 신뢰하지 않고 **원본 JSON에서 독립적으로
 *      다시 세어** 대조한다(testDexUsage.mjs와 같은 방식 — 같은 코드를 두 번 부르면
 *      검사가 아니다).
 *
 *   ④ 본문에 손으로 적은 수치가 늘어난다. 계산해서 넣는 것이 이 섹션의 전제인데, 리터럴이
 *      하나 섞이면 데이터가 갱신된 순간 그 문장만 조용히 거짓말이 된다.
 *      **다만 전면 금지는 오탐을 낳는다** — 게임 상수(40초)나 과거 실측치(11건)처럼
 *      다시 계산하면 안 되는 값도 있다. 그래서 금지가 아니라 **래칫**으로 잡는다:
 *      파일별 리터럴 개수가 기준선보다 늘면 실패하고, 사람이 그 수치가 어느 쪽인지 판단한다.
 *
 *   ⑤ 사이트맵에 안 실린다. 색인이 목적인 페이지가 색인에서 빠지면 만든 의미가 없다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const J = (...p) => JSON.parse(read(...p));

const problems = [];
let checked = 0;

// lib/guideStats.js는 '@/data/x.json'(Next.js 별칭)으로 읽는다. 순수 Node로 부르려면
// 절대 경로 + import assertion으로 바꿔치기한다 — testDexUsage.mjs와 같은 수법.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-guides-'));
const patched = read('lib', 'guideStats.js')
  .replace(/from '@\/data\/([\w.]+)\.json';/g,
    (_, name) => `from '${pathToFileURL(path.join(ROOT, 'data', `${name}.json`)).href}' with { type: 'json' };`)
  // '@/lib/...'도 함께 푼다. 데이터만 바꿔치기하다가 여기서 걸려 넘어졌다(2026-09-04) —
  // guideStats가 이름 규칙 때문에 lib/memberName을 import하기 시작했기 때문이다.
  .replace(/from '@\/lib\/([\w.]+)';/g,
    (_, name) => `from '${pathToFileURL(path.join(ROOT, 'lib', `${name}.js`)).href}';`);
fs.writeFileSync(path.join(tmp, 'guideStats.mjs'), patched);
const S = await import(pathToFileURL(path.join(tmp, 'guideStats.mjs')).href);

const guidesSrc = read('lib', 'guides.js');
const pageSrc = read('app', 'guide', '[slug]', 'page.js');
const SLUGS = [...guidesSrc.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]);

// ── ① 목록 ↔ 본문 ─────────────────────────────────────────────────────────
{
  checked += 1;
  const bodyKeys = [...(pageSrc.match(/const BODY = \{[\s\S]*?\};/) || [''])[0]
    .matchAll(/'([^']+)':/g)].map((m) => m[1]);
  SLUGS.filter((s) => !bodyKeys.includes(s)).forEach((s) =>
    problems.push(`'${s}'가 GUIDES에는 있는데 BODY에 없다 — 목록에서 누르면 404다`));
  bodyKeys.filter((s) => !SLUGS.includes(s)).forEach((s) =>
    problems.push(`'${s}'가 BODY에는 있는데 GUIDES에 없다 — 페이지는 있지만 목록·사이트맵에서 빠진다`));
  if (!SLUGS.length) problems.push('GUIDES가 비었다 — 파싱이 깨졌거나 글이 하나도 없다');
}

// ── ② slug는 공개 URL ─────────────────────────────────────────────────────
{
  checked += 1;
  SLUGS.forEach((s) => {
    if (!/^[a-z0-9-]+$/.test(s)) problems.push(`slug '${s}'에 URL로 못 쓸 문자가 있다 (소문자·숫자·하이픈만)`);
  });
  const dup = SLUGS.filter((s, i) => SLUGS.indexOf(s) !== i);
  if (dup.length) problems.push(`slug 중복: ${[...new Set(dup)].join(', ')}`);
}

// ── ③ 글의 숫자를 원본에서 다시 세어 대조 ─────────────────────────────────
{
  checked += 1;
  const cdbRaw = J('data', 'characterDatabase.json');
  const CH = Array.isArray(cdbRaw) ? cdbRaw : cdbRaw.characters;
  const solo = J('data', 'soloRaidTeams.json');
  const tower = J('data', 'towerCompositions.json');
  const meta = J('data', 'metaStats.json');

  // 조합을 원본에서 처음부터 다시 모은다.
  const teams = [];
  (solo.seasons || []).forEach((s) => (s.teams || []).forEach((t) => teams.push({ k: 'raid', m: t.members || [] })));
  (tower.pools || []).forEach((p) => (p.teams || []).forEach((t) => teams.push({ k: 'tower', m: t.members || [] })));
  ((meta.campaignCompositions || {}).list || []).forEach((t) => teams.push({ k: 'campaign', m: t.members || [] }));
  ((meta.pvp || {}).topTeams || []).forEach((t) => teams.push({ k: 'pvp', m: t.members || [] }));

  const eq = (label, got, want) => {
    if (got !== want) problems.push(`${label}: 글은 ${got}, 원본에서 다시 세면 ${want}`);
  };
  eq('실사용 조합 총계', S.USAGE.total, teams.length);
  ['raid', 'tower', 'campaign', 'pvp'].forEach((k) =>
    eq(`실사용 ${k}`, S.USAGE.byKind[k], teams.filter((t) => t.k === k).length));

  const cnt = new Map();
  teams.forEach((t) => new Set(t.m).forEach((x) => cnt.set(x, (cnt.get(x) || 0) + 1)));
  eq('등장 캐릭터 수', S.USAGE.charactersSeen, cnt.size);
  eq('도감 인원', S.USAGE.charactersTotal, CH.length);

  const ranked = [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  S.USAGE.top.forEach((c, i) => {
    eq(`등장 ${i + 1}위(${c.kr})`, c.n, cnt.get(c.title) ?? 0);
    if (ranked[i] && ranked[i][0] !== c.title) {
      problems.push(`등장 ${i + 1}위가 다르다: 글은 ${c.title}, 다시 세면 ${ranked[i][0]}`);
    }
  });

  // 쌍
  const pm = new Map();
  teams.forEach((t) => {
    const u = [...new Set(t.m)].sort();
    for (let i = 0; i < u.length; i += 1) {
      for (let j = i + 1; j < u.length; j += 1) pm.set(`${u[i]}|${u[j]}`, (pm.get(`${u[i]}|${u[j]}`) || 0) + 1);
    }
  });
  S.PAIRS.forEach((p, i) => {
    const want = pm.get([p.a.title, p.b.title].sort().join('|')) ?? 0;
    eq(`쌍 ${i + 1}위(${p.a.kr}+${p.b.kr})`, p.n, want);
  });

  // 버스트
  eq('버스트 총원', S.BURST.total, CH.length);
  S.BURST.byStage.forEach((s) =>
    eq(`버스트 ${s.stage}단계 인원`, s.n, CH.filter((c) => String(c.burst) === s.stage).length));
  eq('재진입 인원', S.BURST.reentry.length, CH.filter((c) => c.burstReentry).length);
  eq('유동 버스트 인원', S.BURST.flex.length, CH.filter((c) => c.burstFlex).length);
  S.BURST.cooldowns.forEach((c) => {
    const want = CH.filter((x) => {
      const s = (x.skills || [])[(x.skills || []).length - 1];
      return s && Number(s.cd) === c.cd;
    }).length;
    eq(`버스트 쿨 ${c.cd}초 인원`, c.n, want);
  });

  // 무기 — DPS를 원본 계수에서 다시 계산한다.
  const w = J('data', 'weapons.json');
  const MOTION = 0.25;
  const MAG = w.derived.magazineSeconds;
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  eq('무기 종수', S.WEAPONS.totalKinds, Object.values(w.byType).reduce((a, r) => a + r.length, 0));
  S.WEAPONS.types.forEach((t) => {
    const rows = w.byType[t.type] || [];
    const coef = med(rows.filter((r) => r.shotCoefPct).map((r) => r.shotCoefPct));
    const cap = med(rows.filter((r) => r.capacity).map((r) => r.capacity));
    const rel = med(rows.filter((r) => r.reloadSec).map((r) => r.reloadSec));
    const ct = med(rows.filter((r) => r.chargeTimeSec).map((r) => r.chargeTimeSec));
    const mult = med(rows.filter((r) => r.fullChargeMultPct).map((r) => r.fullChargeMultPct));
    const rate = ct ? 1 / (ct + MOTION) : cap / MAG;
    const dps = Number((((coef * (ct ? mult / 100 : 1)) * cap) / (cap / rate + rel)).toFixed(1));
    eq(`${t.type.toUpperCase()} DPS`, t.dps, dps);
    eq(`${t.type.toUpperCase()} 1발당 계수`, t.coef, coef);
    eq(`${t.type.toUpperCase()} 장탄`, t.cap, cap);
  });
  // 차지 배율이 빠지면 SR·RL이 2.5배 낮아진다 — 2026-09-03에 실제로 그랬다.
  ['sr', 'rl'].forEach((t) => {
    const row = S.WEAPONS.types.find((x) => x.type === t);
    if (row && !row.chargeMult) problems.push(`${t.toUpperCase()}에 풀차지 배율이 없다 — 평타 DPS가 2.5배 과소평가된다`);
  });
}

// ── ④ 본문의 손으로 적은 수치 (래칫) ──────────────────────────────────────
// 숫자 + 한국어 단위가 **JSX 텍스트로** 박혀 있는 것을 센다. `{...}` 안의 표현식은 계산된
// 값이므로 세지 않는다. 기준선보다 늘면 사람이 "그 수치가 데이터인가 상수인가"를 판단한다.
// 기준선의 내역 — 늘었을 때 무엇과 비교할지 알아야 판단할 수 있다.
//   BurstCycle 6건  = 2026-09-01 실측치(16건·11건·0건). 과거에 잰 값이라 다시 계산하면 안 된다.
//   WeaponDps 2건   = 공식 안의 '1발당'과 위키 인용문 'Full Charge Damage: 250%'.
//                     (반박 대상인 '12발/초'는 DISPUTED_AR_RATE 상수로 빼서 리터럴이 아니다)
const LITERAL_BASELINE = { 'RealTeamStats.js': 0, 'BurstCycle.js': 6, 'WeaponDps.js': 2 };
{
  checked += 1;
  Object.keys(LITERAL_BASELINE).forEach((file) => {
    const src = read('components', 'guides', file)
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
      .replace(/\{[^{}]*\}/g, ' ');                    // JSX 표현식 제거 = 계산된 값
    const hits = src.match(/(?<![\w.])\d+(?:\.\d+)?\s*(?:건|명|초|배|발|%)/g) || [];
    if (hits.length > LITERAL_BASELINE[file]) {
      problems.push(`${file}: 손으로 적은 수치가 기준선 ${LITERAL_BASELINE[file]} → ${hits.length}로 늘었다`
        + ` [${[...new Set(hits)].slice(0, 6).join(', ')}] — 계산해서 넣을 값인지 확인할 것`);
    } else if (hits.length < LITERAL_BASELINE[file]) {
      console.log(`  ℹ️ ${file}: 리터럴이 ${LITERAL_BASELINE[file]} → ${hits.length}로 줄었다. 기준선을 낮출 것.`);
    }
  });
}

// ── ⑤ 사이트맵 ────────────────────────────────────────────────────────────
{
  checked += 1;
  const sm = read('app', 'sitemap.js');
  if (!/GUIDES/.test(sm)) problems.push('sitemap.js가 GUIDES를 싣지 않는다 — 가이드가 색인에서 빠진다');
  if (!/\/guide`/.test(sm)) problems.push('sitemap.js에 /guide 인덱스가 없다');
  // 내비게이션에서 닿을 수 있는가. 링크가 없으면 크롤러도 사람도 못 찾는다.
  if (!/\/guide/.test(read('components', 'Header.js'))) problems.push('Header에 /guide 링크가 없다');
}

const line = '─'.repeat(78);
console.log(line);
console.log(`가이드 검사 — ${checked}종 · 글 ${SLUGS.length}편`);
console.log(line);
if (problems.length) {
  console.log(`문제 ${problems.length}건\n`);
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log('');
  process.exit(1);
}
console.log('문제 0건\n');
