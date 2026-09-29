#!/usr/bin/env node
/**
 * **PvP 버스트 게이지 수급 값** — 커뮤니티 계산기 시트를 받아 `data/pvpBurstGen.json`으로 옮긴다. (2026-09-29)
 *
 *   node scripts/refreshPvpBurstGen.mjs            # 받아서 대조만(쓰지 않음)
 *   node scripts/refreshPvpBurstGen.mjs --write    # 대조 통과 시 저장
 *
 * 출처: prydwen 가이드 "PVP Burst Energy Generation"(/nikke/guides/pvp-burst)이 링크하는
 *   KosMiu의 "Nikke PVP Burst Generation Calculator" — 탭 "Burst Gen". 값 = 그 니케가 단계(2RL·2.5RL·3RL·3.5RL·4RL)
 *   시간 안에 채우는 버스트 게이지 %. **5명 합이 100을 넘는 가장 빠른 단계가 그 팀의 버스트 속도**다(가이드 원문).
 *
 * 왜 필요했나: 시뮬레이터(딜 계산)가 가장 낮게 본 PvP 등록 조합(라푼젤·루마니·트리나·센티·홍련 0.5%,
 *   홍련·모란·트리나·아니스·자칼 2.5%)이 전부 **클립 RL·클립 SG 배터리 팀**이었다. PvP는 먼저 버스트하는 쪽이 이기는데
 *   우리 데이터에 게이지 수급 값이 하나도 없었다(weapons.json·characterDatabase 모두). 원칙 2 — 값을 지어내지 않고 출처를 찾았다.
 *   기본 수급값의 원 출처는 dotgg(nikke.gg)라고 가이드가 적었다 — **우리는 nikke.gg를 조회하지 않는다**(robots). 이 시트만 읽는다.
 *
 * 대조(하나라도 어긋나면 쓰지 않는다):
 *   - 대조군: prydwen 가이드 본문의 계산 예시 값(홍련 3RL 15.75 · 센티 41.4 · 자칼 42.6 · 비스킷 16.8 · 라플라스 17.4 · 블랑 2.5RL 5.4)
 *     — 다른 탭("Cube Burst Gen")은 행이 한 칸씩 밀린 구간이 있었다(하란에 아니스:SS 값). 행 밀림을 잡으려고 둔다
 *   - 행마다 시트 "Gun" 열 ↔ 우리 DB 무기가 같아야 한다(밀린 행은 무기가 어긋난다). 어긋나면 그 행은 버린다(`rejected`)
 *   - 다섯 단계 값이 단조 증가(시간이 길수록 더 채운다)
 * 이름: 괄호 조건을 뗀 이름이 DB `title`과 같거나 아래 ALIAS. 추측으로 잇지 않는다 — 못 이은 행은 `unmatched`에 남긴다.
 *   같은 캐릭터에 조건별 행이 여럿이면(스킬 레벨·애장품) 조건 없는 행 → "lvl 10"(우리 스킬 원문과 같은 레벨) 순으로 고르고 나머지는 `variants`.
 *   ⚠️ 애장품 행은 기본값이 아니다 — 헬름은 애장품 유무로 2RL 값이 5.6 ↔ 39.82로 7배 갈린다. 유저가 애장품을 가졌는지 우리는 모른다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data', 'pvpBurstGen.json');
const SHEET = '11KWYeyvef91A-vfFuqglJJ8-OhR90TcKFVpJ6Ny_5h4';
const GID = { front: '1990278246', gen: '136921467' };
const WRITE = process.argv.includes('--write');

// 시트 표기 → DB title. 성을 뺀 약칭뿐이다(같은 무기인지도 아래에서 다시 본다).
const ALIAS = {
  Ada: 'Ada Wong', Jill: 'Jill Valentine', Mari: 'Mari Makinami Illustrious',
  Takina: 'Takina Inoue', Chisato: 'Chisato Nishikigi', Misato: 'Misato Katsuragi', Asuka: 'Asuka Shikinami Langley',
};
// prydwen 가이드 "Working example" 본문 값 — [이름, 단계 열(0=2RL…4=4RL), 값]
const CONTROLS = [['Scarlet', 2, 15.75], ['Centi', 2, 41.4], ['Jackal', 2, 42.6], ['Biscuit', 2, 16.8], ['Laplace', 2, 17.4], ['Blanc', 1, 5.4], ['Anis', 1, 28.4]];
const GUN = { RL: 'rl', SG: 'sg', SR: 'sr', AR: 'ar', SMG: 'smg', MG: 'mg' };

function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; } else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function tab(gid) {
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${gid}`, { redirect: 'follow' });
  if (!r.ok) { console.error(`시트를 못 받았다(gid ${gid}): HTTP ${r.status} — 아무것도 쓰지 않는다`); process.exit(2); }
  return parseCsv(await r.text());
}

const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const byNorm = new Map(cdb.map((c) => [norm(c.title), c]));

const front = await tab(GID.front);
const logAt = front.findIndex((r) => r[0] === 'Version' && r[1] === 'Date');
const [version, versionDate] = logAt >= 0 ? front[logAt + 1] : [null, null];
const gen = await tab(GID.gen);
if (gen[0]?.slice(0, 6).join('|') !== 'Name|2RL|5SG(2.5RL)|3RL|7SG(3.5RL)|4RL') {
  console.error('머리행이 달라졌다 — 시트 구조가 바뀌었으니 사람이 볼 것:', gen[0]?.slice(0, 7)); process.exit(1);
}

const problems = [];
const cand = new Map(); const unmatched = []; const rejected = [];
for (const r of gen.slice(1)) {
  const name = (r[0] || '').trim();
  if (!name) continue;
  const vals = r.slice(1, 6).map(Number);
  const gun = (r[6] || '').trim();
  if (vals.some((v) => !Number.isFinite(v))) { rejected.push({ sheetName: name, reason: '값이 숫자가 아님' }); continue; }
  if (vals.some((v, i) => i && v < vals[i - 1])) { rejected.push({ sheetName: name, reason: `단조 증가 아님 ${vals}` }); continue; }
  // 애장품은 "Helm Treasure(…)"·"Drake Treasure"처럼 이름 뒤에 붙는다 — 같은 캐릭터의 조건 행으로 본다
  const treasure = /\btreasure\b/i.test(name);
  const paren = (name.match(/\((.*?)\)/) || [])[1] || null;
  const cond = [treasure ? 'Treasure' : null, paren && paren.toLowerCase() !== 'treasure' ? paren : null].filter(Boolean).join(', ') || null;
  const base = name.replace(/\(.*?\)/g, '').replace(/\s+treasure\b/i, '').trim();
  const c = byNorm.get(norm(name)) || byNorm.get(norm(base)) || (ALIAS[base] && byNorm.get(norm(ALIAS[base])));
  if (!c) { unmatched.push(name); continue; }
  // "Dual SMG"·"2x SG Special"·"Clip RL"처럼 앞에 수식어가 붙는다
  const g = gun.match(/^(?:Clip\s+|Dual\s+|2x\s+)?(SMG|RL|SG|SR|AR|MG)\b/i);
  if (!g || GUN[g[1].toUpperCase()] !== c.weapon) { rejected.push({ sheetName: name, reason: `무기 불일치 — 시트 "${gun}" · DB ${c.weapon}` }); continue; }
  // 제목 자체에 괄호가 있는 경우(Rei Ayanami: (Tentative Name))는 조건이 아니다
  const isCond = cond && norm(name) !== norm(c.title);
  (cand.get(c.title) || cand.set(c.title, []).get(c.title)).push({ sheetName: name, cond: isCond ? cond : null, gun, gen: vals });
}

const byTitle = {}; const variants = {};
for (const [title, rows] of cand) {
  const pick = rows.find((x) => !x.cond) || rows.find((x) => /lvl\s*10|level\s*10/i.test(x.cond)) || (rows.length === 1 ? rows[0] : null);
  if (!pick) { rejected.push({ sheetName: rows.map((x) => x.sheetName).join(' / '), reason: '조건별 행만 있고 고를 기준이 없음' }); continue; }
  byTitle[title] = { gen: pick.gen, gun: pick.gun, ...(pick.sheetName !== title ? { sheetName: pick.sheetName } : {}), ...(pick.cond ? { condition: pick.cond } : {}) };
  const rest = rows.filter((x) => x !== pick);
  if (rest.length) variants[title] = rest.map(({ sheetName, cond, gen: g }) => ({ sheetName, condition: cond, gen: g }));
}

for (const [n, col, v] of CONTROLS) {
  const got = byTitle[n]?.gen?.[col];
  if (got !== v) problems.push(`대조군 ${n}: 가이드 ${v} · 시트 ${got}`);
}

console.log(`시트 v${version} (${versionDate}) — 이은 캐릭터 ${Object.keys(byTitle).length} · 조건별 추가 행 ${Object.values(variants).flat().length} · 못 이음 ${unmatched.length} · 버림 ${rejected.length}`);
if (unmatched.length) console.log('  못 이음:', unmatched.join(', '));
rejected.forEach((x) => console.log(`  버림: ${x.sheetName} — ${x.reason}`));
Object.entries(byTitle).filter(([, v]) => v.condition).forEach(([t, v]) => console.log(`  조건부 값: ${t} ← "${v.sheetName}"`));
const noGen = cdb.filter((c) => (c.skills || []).length && !byTitle[c.title]).length;
console.log(`  우리 DB에서 값이 없는 캐릭터 ${noGen}명(시트에 없거나 버림 — 팀 속도를 "모름"으로 둔다)`);
if (problems.length) { problems.forEach((p) => console.error('✗', p)); console.error('대조 실패 — 쓰지 않는다'); process.exit(1); }

if (!WRITE) { console.log('\n(--write 없이 대조만 했다)'); process.exit(0); }
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const out = {
  _doc: 'PvP 버스트 게이지 수급 — 단계 시간 안에 그 니케가 채우는 게이지 %. 5명 합이 100 이상인 가장 빠른 단계가 팀 버스트 속도. 생성: scripts/refreshPvpBurstGen.mjs (손으로 고치지 말 것)',
  source: {
    name: 'Nikke PVP Burst Generation Calculator (KosMiu)', tab: 'Burst Gen', version, versionDate,
    url: `https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=${GID.gen}`,
    linkedFrom: 'https://www.prydwen.gg/nikke/guides/pvp-burst',
  },
  fetchedAt: today,
  tiers: ['2RL', '2.5RL', '3RL', '3.5RL', '4RL'],
  caveats: 'PvP 전용. 로켓 빗나감(i-frame)·차지 속도·퀀텀 큐브·재칼 피드·RL이 1·3명만 맞히는 경우는 반영 안 됨(가이드 명시). PvE 게이지와는 다르다',
  byTitle, variants, unmatched, rejected,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`\n저장: ${path.relative(ROOT, OUT)}`);
