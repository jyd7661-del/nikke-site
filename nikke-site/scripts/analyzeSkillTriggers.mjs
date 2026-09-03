#!/usr/bin/env node
/**
 * 스킬 절을 **발동 빈도 계열**로 분류한다. (2026-09-02, 유저 지시)
 *
 *   node scripts/analyzeSkillTriggers.mjs              # 요약 + 래칫 판정
 *   node scripts/analyzeSkillTriggers.mjs --char=Modernia
 *   node scripts/analyzeSkillTriggers.mjs --unmatched  # 분류 안 된 것 전부
 *
 * 왜 필요한가
 *   조합 비교기가 스킬 계수를 그냥 더하다가 **모더니아를 3점으로 만들었다.**
 *   그의 `3.05% of final ATK`는 **평타가 맞을 때마다** 터지는 값인데,
 *   신데렐라의 `2808% 한 방`과 같은 자리에 더해졌기 때문이다.
 *   계수를 쓰려면 **그 계수가 얼마나 자주 터지는지**를 먼저 알아야 한다.
 *
 * 유저 지시: "니케별로 스킬 분석해서 스킬이 어떻게 쓰이는지 일회성 스킬인지
 *             다단 스택 스킬인지 다 판별 해야지."
 *
 * ⚠️ 이 스크립트는 **판별만 한다. 횟수를 만들어내지 않는다.**
 *   "평타 N발마다"까지는 원문에서 읽지만, 전투당 평타를 몇 발 쏘는지는 무기별 연사·장탄이
 *   있어야 알 수 있고 **그 데이터는 아직 없다**(game8 캐릭터 페이지에 없음, 2026-09-02 확인).
 *   그래서 여기서는 계열만 붙이고, 실제 횟수 환산은 그 데이터가 생긴 뒤에 한다.
 *
 * 래칫: 분류 안 된 절이 기준선보다 **늘면 실패**한다. 줄면 기준선을 낮추라고 알린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));

// 기준선 — 분류 안 된 절의 수. 규칙을 늘리면 이 값을 함께 낮춘다.
const EXPECTED_UNMATCHED = 179;

// 빈도 계열. **위에서부터 먼저 맞는 것**을 쓴다(순서가 의미를 가진다).
export const TRIGGER_CLASSES = [
  ['once',        /once per battle|\d+ time\(s\) per battle/i,                    '전투당 1회(횟수 제한)'],
  ['battleStart', /at the (start|beginning) of (the )?battle|when entering battle/i, '전투 시작 1회'],
  ['perCycle',    /entering full burst|using burst skill|full burst ends|entering burst stage|beginning of full burst|casting burst skill/i, '풀버스트 사이클마다'],
  ['perShots',    /(after|when) landing \d+ normal attacks?|after \d+ normal attacks?|normal attacks? hits? \d+ time|when normal attacks? hits?/i, '평타 N발마다'],
  ['perReload',   /last bullet (hits|is fired)|when firing the last bullet|ammo consumed/i, '탄창·탄약 소모마다'],
  ['perCharge',   /full charge|while charging/i,                                  '풀차지·차지 중'],
  ['onHp',        /above \d+% hp|hp falls below|below \d+% hp/i,                   'HP 조건부(상시에 가까움)'],
  ['onKill',      /destroys? an enemy[’']?s? part|defeat|kill/i,                   '적 처치·부위 파괴 시'],
  ['onHit',       /when attacked/i,                                               '피격 시'],
];

const SELF_COEF = /(\d[\d.]*)%\s*of final ATK as (?:damage|Burst Skill damage|Additional Damage)/ig;
const STACK = /stacks up to (\d+) time\(s\)/ig;

const sumRe = (s, re) => { let m; let t = 0; re.lastIndex = 0; while ((m = re.exec(s))) t += parseFloat(m[1]); return t; };
const clauses = (d) => (d || '').split(/(?<=\.)\s+/).map((x) => x.trim());

/** 한 캐릭터의 스킬을 절 단위로 분류해 돌려준다. */
export function analyze(c) {
  const out = { title: c.title, kr: c.name_kr || c.title, skills: [], unmatched: [] };
  (c.skills || []).forEach((sk, si) => {
    let trig = null; let cls = null;
    const items = [];
    clauses(sk.desc).forEach((cl) => {
      const m = cl.match(/^Activates\s+(.+?)\.?$/i);
      if (m) {
        trig = m[1];
        const hit = TRIGGER_CLASSES.find(([, re]) => re.test(trig));
        cls = hit ? hit[0] : null;
        if (!hit) out.unmatched.push(trig);
        return;
      }
      const coef = sumRe(cl, SELF_COEF);
      const stacks = [...cl.matchAll(STACK)].map((x) => Number(x[1]));
      if (coef || stacks.length) {
        items.push({
          trigger: trig, class: cls,
          // 버스트 스킬의 절인데 발동 조건이 안 적혀 있으면 그 자체가 사이클마다다.
          effClass: cls || (si === (c.skills || []).length - 1 ? 'perCycle' : null),
          coef: coef || 0,
          maxStacks: stacks.length ? Math.max(...stacks) : null,
          text: cl.slice(0, 110),
        });
      }
    });
    out.skills.push({ idx: si + 1, isBurst: si === (c.skills || []).length - 1, cd: sk.cd || null, items });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 아래는 **직접 실행할 때만** 돈다. simulateTeams.mjs가 TRIGGER_CLASSES를 import하는데,
// 가드가 없으면 import만 해도 이 요약이 출력되고 래칫 실패 시 process.exit까지 한다.
const RUN_CLI = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (!RUN_CLI) { /* import 용도 — 아래 CLI를 건너뛴다 */ } else {

const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith(`--${n}=`)); return m ? m.split('=')[1] : d; };
const line = '─'.repeat(80);

if (arg('char', null)) {
  const q = arg('char', '');
  const c = cdb.find((x) => x.title === q || x.name_kr === q);
  if (!c) { console.error('못 찾음:', q); process.exit(1); }
  const a = analyze(c);
  console.log(line);
  console.log(`${a.kr} (${a.title})`);
  console.log(line);
  a.skills.forEach((s) => {
    console.log(`skill${s.idx}${s.isBurst ? ' [버스트, 쿨 ' + (s.cd || '?') + '초]' : ''}`);
    if (!s.items.length) { console.log('   (딜 계수·스택 없음)'); return; }
    s.items.forEach((it) => {
      const label = (TRIGGER_CLASSES.find(([k]) => k === it.effClass) || [, , '❓ 분류 안 됨'])[2];
      console.log(`   · ${label}${it.coef ? ` · 계수 ${it.coef}%` : ''}${it.maxStacks ? ` · 최대 ${it.maxStacks}스택` : ''}`);
      console.log(`     "${it.text}"`);
      if (it.trigger) console.log(`     발동: ${it.trigger.slice(0, 90)}`);
    });
  });
  process.exit(0);
}

// 전수 요약
let total = 0; const byClass = {}; const unmatched = new Map();
let stackClauses = 0; const stackChars = new Set();
const coefByClass = {};
cdb.forEach((c) => {
  const a = analyze(c);
  a.unmatched.forEach((t) => {
    const k = t.toLowerCase().replace(/\d+(\.\d+)?/g, 'N').replace(/\s+/g, ' ').trim();
    unmatched.set(k, (unmatched.get(k) || 0) + 1);
  });
  a.skills.forEach((s) => s.items.forEach((it) => {
    if (it.maxStacks) { stackClauses += 1; stackChars.add(a.kr); }
    if (it.coef) coefByClass[it.effClass || '?'] = (coefByClass[it.effClass || '?'] || 0) + 1;
  }));
  (c.skills || []).forEach((sk) => clauses(sk.desc).forEach((cl) => {
    const m = cl.match(/^Activates\s+(.+?)\.?$/i);
    if (!m) return;
    total += 1;
    const hit = TRIGGER_CLASSES.find(([, re]) => re.test(m[1]));
    if (hit) byClass[hit[0]] = (byClass[hit[0]] || 0) + 1;
  }));
});

if (process.argv.includes('--unmatched')) {
  console.log('분류 안 된 발동 조건 (많은 순)');
  [...unmatched.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k}`));
  process.exit(0);
}

const un = [...unmatched.values()].reduce((a, b) => a + b, 0);
console.log(line);
console.log(`스킬 발동 빈도 분류 — 조건절 ${total}개 · 캐릭터 ${cdb.length}명`);
console.log(line);
TRIGGER_CLASSES.forEach(([k, , label]) => {
  const n = byClass[k] || 0; if (!n) return;
  console.log(`  ${label.padEnd(24)} ${String(n).padStart(4)}절  ${String(Math.round(n / total * 100)).padStart(3)}%`);
});
console.log(`  ${'분류 안 됨'.padEnd(24)} ${String(un).padStart(4)}절  ${String(Math.round(un / total * 100)).padStart(3)}%   (기준선 ${EXPECTED_UNMATCHED})`);
console.log(line);
console.log(`다단 스택 스킬: ${stackClauses}절 · ${stackChars.size}명`);
console.log('딜 계수가 붙은 절의 빈도 계열:');
Object.entries(coefByClass).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  const label = (TRIGGER_CLASSES.find(([x]) => x === k) || [, , k === '?' ? '❓ 분류 안 됨' : k])[2];
  console.log(`  ${String(v).padStart(3)}절  ${label}`);
});
console.log(line);
console.log('※ 계열만 붙인다. **전투당 실제 발동 횟수는 만들지 않는다** — 무기별 연사·장탄이');
console.log('  있어야 하고 그 데이터는 아직 없다(game8 캐릭터 페이지에 없음, 2026-09-02 확인).');
console.log(line);

if (un > EXPECTED_UNMATCHED) {
  console.log(`\n❌ 분류 안 된 절이 기준선(${EXPECTED_UNMATCHED})보다 ${un - EXPECTED_UNMATCHED}개 늘었다.`);
  console.log('   새 캐릭터의 새 표현일 수 있다. --unmatched 로 확인하고 규칙을 늘릴 것.\n');
  process.exit(1);
}
if (un < EXPECTED_UNMATCHED) {
  console.log(`\n✅ 분류 안 된 절이 ${EXPECTED_UNMATCHED} → ${un}로 줄었다. EXPECTED_UNMATCHED를 ${un}로 낮출 것.\n`);
} else {
  console.log('\n✅ 기준선 유지.\n');
}

} // RUN_CLI
