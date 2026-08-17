// 아키타입 note에 적힌 **애장품 전제**를 뽑아 데이터 필드로 남긴다.
//
// ■ 왜 필요한가 (2026-08-15 유저 지적에서 발견)
//
//   prydwen은 애장품 요구를 members 배열이 아니라 **note 본문에만** 적는다:
//     "ZweiTr-Mint-SWHA in a tight tempo"      → 츠바이는 애장품 버전
//     "Helm (Treasure) may be replaced with…"  → 헬름은 애장품 버전
//   우리 스크랩은 `members: ["Zwei", ...]`만 가져갔고 findExactTeamMatch는 그 배열만 본다.
//   그래서 **애장품 전제 조합이 애장품 없이도 매칭된다.** 실제로 ZweiTr 전제 조합이
//   애장품 없는 츠바이로 추천됐다(츠바이 보스전 티어: 애장품 없으면 C, 있으면 S).
//
// ■ 오탐을 막는 장치 — 이게 이 스크립트의 핵심
//
//   note에는 이름 축약이 잔뜩 있다. `SolineFT`(솔린 : 프로스트 티켓), `RRH`(라피 : 레드 후드),
//   `SWHA`(스노우 화이트 : 헤비암즈)처럼 Tr이 아닌 접미사가 많아서 정규식만 믿으면 안 된다.
//   그래서 뽑아낸 이름은 **반드시 아래 두 관문을 통과해야** 채택한다:
//     1) characterDatabase.json의 title로 해석될 것
//     2) 그 캐릭터가 characterInvestmentNotes.json에서 **실제로 애장품을 가질 것**
//        (treasureRequired 또는 treasureTiers가 있을 것)
//   하나라도 못 넘으면 채택하지 않고 목록에 남겨 사람이 본다. 억지로 맞추지 않는다.
//
// 사용법:
//   node scripts/extractTreasurePrereq.mjs           # 조사만
//   node scripts/extractTreasurePrereq.mjs --write   # synergyNotes.json에 requiresTreasure 기록

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const sn = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/synergyNotes.json'), 'utf8'));
const cdbRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/characterDatabase.json'), 'utf8'));
const cdb = Array.isArray(cdbRaw) ? cdbRaw : cdbRaw.characters;
const invRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/characterInvestmentNotes.json'), 'utf8')).characters;
const inv = Array.isArray(invRaw) ? invRaw : Object.values(invRaw);

// 애장품을 실제로 가진 캐릭터만 후보가 된다.
const hasTreasure = new Set(
  inv.filter((n) => n.treasureRequired || n.treasureTiers).map((n) => n.title || n.name)
);

// title 해석용 색인. 공백·콜론을 지운 소문자 키로 느슨하게 맞춘다.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const byNorm = new Map();
for (const c of cdb) byNorm.set(norm(c.title), c.title);

// note에서 애장품 전제로 읽히는 토막을 뽑는다.
//   "ZweiTr" / "HelmTr"        → 이름 + Tr
//   "Helm (Treasure)"          → 이름 + (Treasure)
//   "Helm Treasure"            → 이름 + Treasure
const PATTERNS = [
  /\b([A-Z][A-Za-z]{2,})Tr\b/g,
  /\b([A-Z][A-Za-z: ]{2,25}?)\s*\(Treasure\)/g,
  /\b([A-Z][A-Za-z]{2,})\s+Treasure\b/g,
];

const resolved = [];   // 채택
const rejected = [];   // 관문을 못 넘은 것 (사람이 본다)

for (const a of sn.archetypes) {
  if (!a.note) continue;
  const found = new Set();
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(a.note))) found.add(m[1].trim());
  }
  if (!found.size) continue;

  const ok = [];
  for (const raw of found) {
    const title = byNorm.get(norm(raw));
    if (!title) { rejected.push({ id: a.id, raw, why: 'DB title로 해석 안 됨' }); continue; }
    if (!hasTreasure.has(title)) { rejected.push({ id: a.id, raw, why: `${title}는 애장품이 없는 캐릭터` }); continue; }
    if (!(a.members || []).includes(title)) { rejected.push({ id: a.id, raw, why: `${title}가 이 조합 members에 없음(치환 안내일 가능성)` }); continue; }
    ok.push(title);
  }
  if (ok.length) resolved.push({ archetype: a, titles: [...new Set(ok)] });
}

console.log(`아키타입 ${sn.archetypes.length}건 중 애장품 전제가 확인된 조합: ${resolved.length}건`);
const byMode = {};
resolved.forEach((r) => { byMode[r.archetype.mode] = (byMode[r.archetype.mode] || 0) + 1; });
console.log('  모드별:', JSON.stringify(byMode));
console.log();
console.log('■ 채택 (앞 15건)');
resolved.slice(0, 15).forEach((r) =>
  console.log(`   [${r.archetype.mode}] ${String(r.archetype.name).slice(0, 38).padEnd(40)} → ${r.titles.join(', ')}`));

console.log();
console.log(`■ 관문을 못 넘어 버린 것: ${rejected.length}건 (억지로 맞추지 않는다)`);
const whyCount = {};
rejected.forEach((r) => { whyCount[r.why.replace(/^[A-Za-z: ]+는/, '…는').replace(/^[A-Za-z: ]+가/, '…가')] = (whyCount[r.why.replace(/^[A-Za-z: ]+는/, '…는').replace(/^[A-Za-z: ]+가/, '…가')] || 0) + 1; });
Object.entries(whyCount).sort((a, b) => b[1] - a[1]).forEach(([w, n]) => console.log(`   ${String(n).padStart(4)}건  ${w}`));
console.log();
console.log('   표본:');
rejected.slice(0, 10).forEach((r) => console.log(`     ${String(r.raw).padEnd(22)} ${r.why}`));

if (!WRITE) {
  console.log('\n조사만 했습니다. 저장하려면 --write');
  process.exit(0);
}

for (const { archetype, titles } of resolved) archetype.requiresTreasure = titles;
fs.writeFileSync(path.join(ROOT, 'data/synergyNotes.json'), JSON.stringify(sn, null, 2) + '\n');
console.log(`\n저장 완료 — ${resolved.length}건에 requiresTreasure 기록`);
