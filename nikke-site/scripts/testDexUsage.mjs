/**
 * lib/usage.js 검사 — 도감 "실사용 데이터" 절이 조용히 비지 않는가.
 * (2026-08-25)
 *
 * ■ 이 검사가 막으려는 고장
 *   이 절은 **없으면 안 그리는** 설계라서, 집계가 통째로 실패해도 화면은 멀쩡해 보인다.
 *   그냥 절이 하나 사라질 뿐이다. 지금까지 이 프로젝트에서 제일 많이 난 사고가 그 모양이었다
 *   (홍련 name_kr, prydwen 5인 조합 잘림, AiRecommendSection 훅 누락 — 전부 에러 0).
 *
 *   특히 위험한 건 **조회 키를 잘못 잡는 것**이다. enikk 원본은 영문 title로 되어 있는데
 *   id('crown')로 찾으면 198명 전원이 null이 되고, 아무 에러 없이 절만 사라진다.
 *
 * ■ 판정 단위 = 고장의 단위
 *   "몇 명은 데이터가 있더라" 같은 표본 검사로는 위 고장을 못 잡는다(한 명만 맞아도 통과).
 *   그래서 **198명 전원에 대해** 원본 JSON에서 독립적으로 다시 세어 lib/usage.js의 결과와
 *   맞춰본다. 같은 코드를 두 번 부르는 게 아니라 원본에서 새로 세는 것이 요점이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// lib/usage.js는 '@/data/x.json'으로 읽는다(Next.js 별칭). 순수 Node로 부르려면
// 절대 경로 + import assertion으로 바꿔치기해야 한다 — testEngineReasons.mjs와 같은 수법이다.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-usage-'));
const fixed = fs.readFileSync(path.join(ROOT, 'lib', 'usage.js'), 'utf8')
  .replace(/from '(?:@\/|\.\.\/)data\/([\w.]+)\.json';/g, (_, name) =>
    `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${name}.json`)).href)} with { type: 'json' };`);
fs.writeFileSync(path.join(tmp, 'usage.mjs'), fixed);
const usage = await import(pathToFileURL(path.join(tmp, 'usage.mjs')).href);

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const db = read('characterDatabase.json');
const meta = read('metaStats.json');
const solo = read('soloRaidTeams.json');
const tower = read('towerCompositions.json');
const TITLES = new Set(db.map((c) => c.title));

const fails = [];
const check = (name, cond, detail = '') => {
  if (!cond) fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
// 원본에서 **독립적으로** 다시 센다. lib/usage.js를 참조하지 않는다.
// ---------------------------------------------------------------------------
const teams = []; // { kind, members }
(solo.seasons || []).forEach((s) => (s.teams || []).forEach((t) => teams.push({ kind: 'raid', members: t.members })));
(tower.pools || []).forEach((p) => (p.teams || []).forEach((t) => teams.push({ kind: 'tower', members: t.members })));
((meta.campaignCompositions || {}).list || []).forEach((t) => teams.push({ kind: 'campaign', members: t.members }));
((meta.pvp || {}).topTeams || []).forEach((t) => teams.push({ kind: 'pvp', members: t.members }));

const SLICES = ['overall', 'campaign', 'soloraid', 'arena'];
const subsetRows = ['pairs', 'trios', 'quads'].flatMap((k) => ((meta.pvp || {})[k] || []));

// 1. 분모가 원본과 같은가. 하드코딩한 숫자가 아니라 파일에서 나온 값이어야 한다.
check('총 조합 수', usage.USAGE_TOTALS.all === teams.length,
  `usage=${usage.USAGE_TOTALS.all} / 원본=${teams.length}`);
for (const kind of ['raid', 'tower', 'campaign', 'pvp']) {
  const n = teams.filter((t) => t.kind === kind).length;
  check(`${kind} 조합 수`, usage.USAGE_TOTALS[kind] === n, `usage=${usage.USAGE_TOTALS[kind]} / 원본=${n}`);
}

// 2. 198명 전원 대조 — 등장 수·모드별 수·동반 등장이 원본과 정확히 같은가.
let withData = 0;
const mismatches = [];
for (const c of db) {
  const mine = teams.filter((t) => t.members.includes(c.title));
  const tierCount = SLICES.filter((s) => ((meta.usageTier || {})[s] || {})[c.title]).length;
  const subs = subsetRows.filter((r) => (r.members || []).includes(c.title));
  const expectNull = mine.length === 0 && tierCount === 0 && subs.length === 0;

  const got = usage.usageFor(c.title);
  if (expectNull) {
    if (got !== null) mismatches.push(`${c.title}: 데이터가 없는데 null이 아니다`);
    continue;
  }
  withData += 1;
  if (!got) { mismatches.push(`${c.title}: 데이터가 있는데 null을 돌려줬다`); continue; }

  if (got.counts.all !== mine.length) mismatches.push(`${c.title}: 등장 ${got.counts.all} ≠ 원본 ${mine.length}`);
  for (const kind of ['raid', 'tower', 'campaign', 'pvp']) {
    const n = mine.filter((t) => t.kind === kind).length;
    if (got.counts[kind] !== n) mismatches.push(`${c.title}: ${kind} ${got.counts[kind]} ≠ 원본 ${n}`);
    if ((got[kind] || []).length !== n) mismatches.push(`${c.title}: ${kind} 목록 길이 ${got[kind]?.length} ≠ ${n}`);
  }
  if (got.tiers.length !== tierCount) mismatches.push(`${c.title}: 채용률 슬라이스 ${got.tiers.length} ≠ ${tierCount}`);
  if (got.pvpSubsets.length !== subs.length) mismatches.push(`${c.title}: PvP 부분조합 ${got.pvpSubsets.length} ≠ ${subs.length}`);

  // 동반 등장 — 자기 자신이 섞여 있으면 "함께 쓴 니케"에 본인이 뜬다.
  if (got.partners.some((p) => p.title === c.title)) mismatches.push(`${c.title}: 동반 목록에 자기 자신이 있다`);
  const expectPartners = new Map();
  mine.forEach((t) => t.members.forEach((m) => {
    if (m !== c.title) expectPartners.set(m, (expectPartners.get(m) || 0) + 1);
  }));
  if (got.partners.length !== expectPartners.size) {
    mismatches.push(`${c.title}: 동반 인원 ${got.partners.length} ≠ 원본 ${expectPartners.size}`);
  } else {
    const bad = got.partners.find((p) => expectPartners.get(p.title) !== p.count);
    if (bad) mismatches.push(`${c.title}: 동반 '${bad.title}' ${bad.count} ≠ 원본 ${expectPartners.get(bad.title)}`);
  }
  // 내림차순으로 보여줄 것이므로 정렬도 본다(밀려 있으면 상위 5명이 엉뚱해진다).
  if (got.partners.some((p, i) => i > 0 && p.count > got.partners[i - 1].count)) {
    mismatches.push(`${c.title}: 동반 목록이 내림차순이 아니다`);
  }
}
check('198명 전원 집계 일치', mismatches.length === 0, mismatches.slice(0, 5).join(' / '));

// 3. 데이터가 붙는 캐릭터가 실제로 있어야 한다. 조회 키를 잘못 잡으면 여기서 0이 된다.
check('실사용 데이터가 붙는 캐릭터 수 > 0', withData > 0, `${withData}명`);

// 4. id로 찾으면 안 나와야 한다 — 이 절의 조회 키는 title이다.
//    (id를 넘기는 실수가 났을 때 "그래도 뭔가 나오더라"로 넘어가지 않도록 못을 박는다)
const sample = db.find((c) => usage.usageFor(c.title));
check('조회 키는 title이다', sample && usage.usageFor(sample.id) === null,
  sample ? `id '${sample.id}'로도 값이 나왔다` : '표본을 못 찾음');

// 5. 없는 이름·빈 값에 터지지 않는가.
check('없는 이름은 null', usage.usageFor('존재하지 않는 니케') === null);
check('빈 값은 null', usage.usageFor('') === null && usage.usageFor(null) === null);

// 6. 집계에 쓰인 이름이 전부 DB에 있는가.
//    (checkData의 META_ORPHAN·*_UNKNOWN_MEMBER와 겹치지만, 여기서 한 번 더 본다 —
//     이 절은 이름이 어긋나면 링크가 죽은 채로 그려지기 때문이다)
const orphan = usage.allUsageTitles().filter((t) => !TITLES.has(t));
check('집계 이름이 전부 DB에 있다', orphan.length === 0, orphan.join(', '));

// ---------------------------------------------------------------------------
console.log('─'.repeat(72));
console.log('도감 실사용 데이터 집계 검사');
console.log(`조합 ${usage.USAGE_TOTALS.all}건 (솔로레이드 ${usage.USAGE_TOTALS.raid} · 타워 ${usage.USAGE_TOTALS.tower} · `
  + `캠페인 ${usage.USAGE_TOTALS.campaign} · PvP ${usage.USAGE_TOTALS.pvp})`);
console.log(`실사용 데이터가 붙는 캐릭터 ${withData} / ${db.length}명`);
console.log('─'.repeat(72));
if (fails.length) {
  console.log(`❌ 실패 ${fails.length}건`);
  fails.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
  process.exitCode = 1;
} else {
  console.log('✅ 전부 통과');
}
fs.rmSync(tmp, { recursive: true, force: true });
