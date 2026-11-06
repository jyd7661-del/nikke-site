// 도감 "함께 쓸 니케 · 스킬 연결"(lib/dexRelations.js) 검사 (2026-10-11)
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
  console.log(JSON.stringify({ companions: R.companionsFor(c), skill: R.skillLinksFor(c) }, null, 1));
  process.exit(0);
}

const problems = [];
// ① 짝(2026-11-06 개편 — 같이 쓰인 횟수 → 같은 판 안 리프트). 유저 정답 짝 중 민트 ↔ 프리카 · 리버렐리오 ↔ 홍련 : 흑영 · 마스트 ↔ 앵커 : 이노센트 메이드는
//   리프트로도 상위에 남는다. 마스트 ↔ 크라운(1.2배)은 "둘 다 필수라 겹치는" 쌍이라 빠지는 게 의도(유저 "그렇게 해보고").
const top = (a, k) => R.partnersFor(byTitle.get(a)).list.filter((x) => x.together).slice(0, k).map((x) => x.title);
const PAIRS = [['Mint', 'Prika', 1], ['Prika', 'Mint', 1], ['Liberalio', 'Scarlet: Black Shadow', 3], ['Scarlet: Black Shadow', 'Liberalio', 3], ['Mast: Romantic Maid', 'Anchor: Innocent Maid', 12]];
for (const [a, b, k] of PAIRS) if (!top(a, k).includes(b)) problems.push(`[함께 쓸 니케] ${a}의 상위 ${k}에 ${b}가 없다 — 지금 ${top(a, k).join(', ')}`);
// 막는 고장: 같은 판 제약(테트라 타워엔 테트라만)이 짝으로 둔갑하는 것 — 11-06 에이드 ↔ 아니스 : 스타 4건은 전부 테트라 타워, 기업별로 나누면 0.82배
if (R.partnersFor(byTitle.get('Ade: Agent Bunny')).list.some((x) => x.title === 'Anis: Star' && x.together)) problems.push('[함께 쓸 니케] 에이드 : 에이전트 바니 목록에 아니스 : 스타(테트라 타워 제약)가 짝으로 들었다');
for (const x of R.partnersFor(byTitle.get('Ade: Agent Bunny')).list) if (x.together && (x.together.n < 3 || !(x.together.lift > 1))) { problems.push(`[함께 쓸 니케] 기준 밖 짝 ${x.title}`); break; }
// ①-b 스킬 연결 짝(2026-10-13, 유저: "그래야 홍련흑영과의 조합이 설명되니까") — 리버렐리오 "공격력이 가장 낮은 3버스트 아군 1명에게 차지 속도 ▲"
//   예전 해석기는 이 대상절('all' 없음)을 못 읽었고, 읽더라도 티어순 4명 안에 홍련 : 흑영이 없었다(28명 중).
{
  const lib = R.skillLinksFor(byTitle.get('Liberalio'));
  const g = lib.gives.find((x) => x.cond.burst === '3' && x.cond.charge);
  if (!g) problems.push('[스킬 연결 짝] 리버렐리오의 3버스트 차지 속도 버프를 못 읽는다');
  else if (!g.top.some((x) => x.title === 'Scarlet: Black Shadow')) problems.push(`[스킬 연결 짝] 리버렐리오 → 홍련 : 흑영이 상위에 없다 — 지금 ${g.top.map((x) => x.title).join(', ')}`);
  if (!R.skillLinksFor(byTitle.get('Scarlet: Black Shadow')).receives.some((x) => x.title === 'Liberalio')) problems.push('[스킬 연결 짝] 홍련 : 흑영이 받는 목록에 리버렐리오가 없다');
}
// ② 전원 사실 검사
// 아군이 쏜 탄 수로 발동(2026-11-05 유저 — 리틀 머메이드 "연발이 빠른 총과 같이 쓰면 좋거든"). 대상절이 없어 예전엔 절이 통째로 비었다.
{
  for (const t of ['Little Mermaid', 'Cinderella: Crystal Wave']) {
    const g = R.skillLinksFor(byTitle.get(t)).gives.find((x) => x.cond.ammo);
    if (!g) problems.push(`[탄 수 발동] ${t}의 「아군이 소비한 탄」 스킬을 못 읽는다`);
    else if (g.top.some((x) => !['mg', 'smg'].includes(String(byTitle.get(x.title).weapon).toLowerCase()))) problems.push(`[탄 수 발동] ${t} → MG·SMG가 아닌 니케가 들었다`);
  }
  if (!R.skillLinksFor(byTitle.get('Modernia')).receives.some((x) => x.title === 'Little Mermaid')) problems.push('[탄 수 발동] 모더니아(MG)가 받는 목록에 리틀 머메이드가 없다');
}

// 아군 전체 버프인데 효과 종류가 특정 니케에게만 드는 것(2026-11-05) — 짝은 스킬 원문으로 확인한 것.
{
  const PAIRS2 = [['Velvet', 'charge', 'Scarlet: Black Shadow'], ['Grave', 'pierce', 'Red Hood'], ['Mast: Romantic Maid', 'distributed', '2B'],
    ['Rosanna: Chic Ocean', 'sustained', 'Mana'], ['Takina Inoue', 'true', 'Ada Wong']];
  for (const [giver, kind, recv] of PAIRS2) {
    const g = R.skillLinksFor(byTitle.get(giver)).gives.find((x) => x.cond.dmgKind === kind);
    if (!g) { problems.push(`[효과 종류] ${giver}의 ${kind} 버프를 못 읽는다`); continue; }
    if (!R.dealsDamageKind(kind, byTitle.get(recv))) problems.push(`[효과 종류] ${recv}가 ${kind} 버프를 받는 쪽으로 안 잡힌다`);
    if (g.top.some((x) => !R.dealsDamageKind(kind, byTitle.get(x.title)))) problems.push(`[효과 종류] ${giver} → 받는 쪽이 아닌 니케가 들었다`);
  }
  // 「all allies with a Sniper Rifle」은 무기 조건 — 효과 종류로 따로 잡으면 안 된다
  if (R.skillLinksFor(byTitle.get('D: Killer Wife')).gives.some((x) => x.cond.dmgKind)) problems.push('[효과 종류] D : 킬러 와이프의 저격소총 한정 버프를 아군 전체로 읽었다');
}

// 한 칸으로 합친 목록(partnersFor, 2026-11-05 유저 "한 칸으로 합치기") — 같이 쓰인 짝과 스킬 연결 짝이 둘 다 들어야 한다.
{
  const has = (a, b, needLink) => {
    const x = R.partnersFor(byTitle.get(a)).list.find((m) => m.title === b);
    return x && (!needLink || x.links.length > 0);
  };
  if (!has('Mast: Romantic Maid', 'Anchor: Innocent Maid', false)) problems.push('[합친 목록] 마스트 : 로망틱 메이드 목록에 앵커 : 이노센트 메이드(같이 쓰인 짝)가 없다');
  if (!has('Liberalio', 'Scarlet: Black Shadow', true)) problems.push('[합친 목록] 리버렐리오 목록에 홍련 : 흑영(스킬 연결)이 없다');
  if (!has('Little Mermaid', 'Modernia', true)) problems.push('[합친 목록] 리틀 머메이드 목록에 모더니아(탄 수 발동 연결)가 없다');
  if (!has('Red Hood', 'Grave', true)) problems.push('[합친 목록] 레드 후드 목록에 그레이브(관통 버프를 줌)가 없다');
  const lm = R.partnersFor(byTitle.get('Little Mermaid')).list;
  for (let i = 1; i < lm.length; i++) if ((lm[i].together?.lift || 0) > (lm[i - 1].together?.lift || 0) && lm[i - 1].together) { problems.push('[합친 목록] 리프트 순서가 아니다'); break; }
}

const TR = { SSS: 9, SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };
const KEY = { campaign: 'story', bossing: 'bossing', pvp: 'pvp' };
const stages = (c) => (c.burstFlex && c.burstStages?.length ? c.burstStages.map(String) : [String(c.burst)]);
let withComp = 0, withSkill = 0;
for (const c of CH) {
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
    if (g.cond.burst && !stages(xc).includes(g.cond.burst) && !(xc.burstStages || []).map(String).includes(g.cond.burst)) problems.push(`[스킬 연결] ${c.title} → ${x.title}: 버스트 조건(${g.cond.burst}) 불일치`);
    if (g.cond.charge && !['rl', 'sr'].includes(xc.weapon)) problems.push(`[스킬 연결] ${c.title} → ${x.title}: 차지 속도 효과인데 차지 무기가 아니다(${xc.weapon})`);
  }
  if (sk.receives.some((x) => x.title === c.title)) problems.push(`[스킬 연결] ${c.title}: 자기 자신이 버프 주는 쪽에`);
  // 받는 쪽은 공격형 또는 3버스트만(엔진 isBuffReceiver와 같은 기준) — 지원형 페이지에 "공격 버프를 주는 니케"가 나오면 안 된다
  const receiver = (x) => x.class === 'attacker' || (x.burstStages?.length ? x.burstStages.map(String) : [String(x.burst)]).includes('3');
  if (sk.receives.length && !receiver(c)) problems.push(`[스킬 연결] ${c.title}: 버프를 받는 쪽이 아닌데(공격형도 3버스트도 아님) 받는 목록이 있다`);
  for (const g of sk.gives) for (const x of g.top) if (!receiver(byTitle.get(x.title))) problems.push(`[스킬 연결] ${c.title} → ${x.title}: 받는 쪽이 아니다`);
}

console.log(`도감 관계 절 — ${CH.length}명 · 함께 쓸 니케 있음 ${withComp} · 스킬 연결 있음 ${withSkill}`);
if (problems.length) { console.log(`문제 ${problems.length}건`); problems.slice(0, 30).forEach((p, i) => console.log(`  ${i + 1}. ${p}`)); process.exit(1); }
console.log('문제 0건 — 짝(리프트) 5개가 상위에 있고 테트라 제약 착시 없음, 전원 사실 검사 통과');
