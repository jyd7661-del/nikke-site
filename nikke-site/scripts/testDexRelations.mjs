// 도감 "대신 쓸 니케 · 함께 쓸 니케 · 스킬 연결"(lib/dexRelations.js) 검사 (2026-10-11)
//
//   node scripts/testDexRelations.mjs            # 검사
//   node scripts/testDexRelations.mjs --show=Aria # 한 캐릭터의 결과를 그대로 출력
//
// ■ 유저가 준 정답 짝(10-11) — 이 셋이 '함께 쓸 니케' 상위에 없으면 계산이 틀린 것이다:
//   "민트는 대표적으로 프리카가 좋고, 메이드 마스트는 크라운이나 앵커가 조합이 좋지" · "홍련이랑 리버렐리오처럼"
// ■ 사실 검사: 대신 쓸 니케는 같은 클래스·버스트 단계이고 그 모드 티어가 더 높다 · 어디에도 자기 자신이 없다 ·
//   스킬 연결의 대상은 실제로 그 조건(속성·무기·부대)을 만족한다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-rel-'));
const fix = (src) => src
  .replace(/from '(?:@\/|\.\.\/)data\/([\w.]+)\.json';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
  .replace(/from '@\/lib\/(\w+)';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
for (const f of ['usage', 'buffTargets', 'dexRelations']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8')));
const R = await import(pathToFileURL(path.join(tmp, 'dexRelations.mjs')).href);
fs.rmSync(tmp, { recursive: true, force: true });

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const CH = Array.isArray(db) ? db : db.characters;
const byTitle = new Map(CH.map((c) => [c.title, c]));
const show = process.argv.find((a) => a.startsWith('--show='));
if (show) {
  const c = byTitle.get(show.slice(7));
  console.log(JSON.stringify({ alternatives: R.alternativesFor(c), companions: R.companionsFor(c), skill: R.skillLinksFor(c) }, null, 1));
  process.exit(0);
}

const problems = [];
// ① 유저 정답 짝
const PAIRS = [['Mint', 'Prika', 1], ['Prika', 'Mint', 1], ['Mast: Romantic Maid', 'Crown', 3], ['Mast: Romantic Maid', 'Anchor: Innocent Maid', 3],
  ['Scarlet: Black Shadow', 'Liberalio', 3], ['Liberalio', 'Scarlet: Black Shadow', 3]];
for (const [a, b, k] of PAIRS) {
  const top = R.companionsFor(byTitle.get(a)).list.slice(0, k).map((x) => x.title);
  if (!top.includes(b)) problems.push(`[함께 쓸 니케] ${a}의 상위 ${k}에 ${b}가 없다 — 지금 ${top.join(', ')}`);
}
// ② 전원 사실 검사
const TR = { SSS: 9, SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };
const KEY = { campaign: 'story', bossing: 'bossing', pvp: 'pvp' };
const stages = (c) => (c.burstFlex && c.burstStages?.length ? c.burstStages.map(String) : [String(c.burst)]);
let withComp = 0, withAlt = 0, withSkill = 0;
for (const c of CH) {
  const alts = R.alternativesFor(c);
  if (alts.some((m) => m.higher.length)) withAlt++;
  for (const m of alts) for (const x of m.higher) {
    const xc = byTitle.get(x.title);
    if (xc.id === c.id) problems.push(`[대신 쓸 니케] ${c.title}: 자기 자신`);
    if (xc.class !== c.class || !stages(xc).some((b) => stages(c).includes(b))) problems.push(`[대신 쓸 니케] ${c.title}: ${x.title} 클래스·버스트가 다르다`);
    if (!((TR[xc.tiers?.[KEY[m.mode]]] || 0) > (TR[c.tiers?.[KEY[m.mode]]] || 0))) problems.push(`[대신 쓸 니케] ${c.title} ${m.mode}: ${x.title} 티어가 더 높지 않다`);
  }
  const comp = R.companionsFor(c);
  if (comp.list.length) withComp++;
  if (comp.list.some((x) => x.title === c.title)) problems.push(`[함께 쓸 니케] ${c.title}: 자기 자신`);
  if (comp.list.some((x) => x.ranker > comp.rankerTeams)) problems.push(`[함께 쓸 니케] ${c.title}: 같이 나온 횟수가 등장 조합 수보다 크다`);
  const sk = R.skillLinksFor(c);
  if (sk.gives.length || sk.receives.length) withSkill++;
  for (const g of sk.gives) for (const x of g.top) {
    const xc = byTitle.get(x.title);
    if (g.cond.element && xc.element !== g.cond.element) problems.push(`[스킬 연결] ${c.title} → ${x.title}: 속성 조건(${g.cond.element}) 불일치`);
    if (g.cond.weapon && xc.weapon !== g.cond.weapon) problems.push(`[스킬 연결] ${c.title} → ${x.title}: 무기 조건(${g.cond.weapon}) 불일치`);
    if (g.cond.squad && xc.squad !== c.squad) problems.push(`[스킬 연결] ${c.title} → ${x.title}: 부대 조건 불일치`);
  }
  if (sk.receives.some((x) => x.title === c.title)) problems.push(`[스킬 연결] ${c.title}: 자기 자신이 버프 주는 쪽에`);
  // 받는 쪽은 공격형 또는 3버스트만(엔진 isBuffReceiver와 같은 기준) — 지원형 페이지에 "공격 버프를 주는 니케"가 나오면 안 된다
  const receiver = (x) => x.class === 'attacker' || (x.burstStages?.length ? x.burstStages.map(String) : [String(x.burst)]).includes('3');
  if (sk.receives.length && !receiver(c)) problems.push(`[스킬 연결] ${c.title}: 버프를 받는 쪽이 아닌데(공격형도 3버스트도 아님) 받는 목록이 있다`);
  for (const g of sk.gives) for (const x of g.top) if (!receiver(byTitle.get(x.title))) problems.push(`[스킬 연결] ${c.title} → ${x.title}: 받는 쪽이 아니다`);
}

console.log(`도감 관계 절 — ${CH.length}명 · 대신 쓸 니케 있음 ${withAlt} · 함께 쓸 니케 있음 ${withComp} · 스킬 연결 있음 ${withSkill}`);
if (problems.length) { console.log(`문제 ${problems.length}건`); problems.slice(0, 30).forEach((p, i) => console.log(`  ${i + 1}. ${p}`)); process.exit(1); }
console.log('문제 0건 — 유저 정답 짝 6개가 상위에 있고, 전원 사실 검사 통과');
