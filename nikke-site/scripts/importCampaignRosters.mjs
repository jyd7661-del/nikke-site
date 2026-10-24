#!/usr/bin/env node
/**
 * enikk 캠페인 Compositions 화면을 옮긴 JSON → `data/campaignRosters.json` + `metaStats.campaignCompositions.starB1Partners` (2026-10-23)
 *
 *   node scripts/importCampaignRosters.mjs <화면에서 읽은 json>      # 쓴다
 *   node scripts/importCampaignRosters.mjs --check                   # 두 파일이 서로 맞는지만 본다(checkData가 부른다)
 *
 * ■ 왜
 *   metaStats.campaignCompositions는 "Most Used Compositions" 상위 20행(클리어의 절반)뿐이다. 거기엔 탱커(목단) 조합이 0개라
 *   "탱커 포함" 추천을 잴 정답지가 없었고, 아니스 : 스타 + 다른 1버스트 예외(STAR_PARTNERS_BY_MODE)도 캠페인에선 비어 있었다.
 *   더 받아 보니 스타 + 목단이 26조합 5,994회(클리어의 1.8%) — 상위 20행의 마지막(0.95%)보다 많이 쓰인다.
 *
 * ■ 무엇을
 *   · campaignRosters.json — 많이 쓴 상위 600조합(클리어 수·보스 클리어 수)과 보스 스테이지 조합 전부(보스 클리어 수).
 *     엔진은 이 파일을 읽지 않는다(브라우저 번들에 실리므로 크기를 늘리지 않는다). 시험(benchStageRoles)과 이 스크립트만 읽는다.
 *   · starB1Partners — 스타처럼 "다른 1버스트가 있으면 꺼지는" 니케(burstCdr noOtherB1, 고정 1버스트)와 같이 쓴 고정 1버스트 중,
 *     같이 쓴 조합의 클리어 합이 **상위 20행 마지막 행의 몫 이상**인 것. 기준을 새로 정하지 않고 기존 등록 조합(상위 20행)의 문턱을 그대로 쓴다.
 *     보스 스테이지 목록도 같은 방식(그 목록 20번째 행의 몫)으로 보고, 둘 중 하나라도 넘으면 예외다.
 *
 * 화면에서 읽는 법(수집기는 저장소에 없다 — 09-29와 같이 일회용): enikk.app/campaign → Compositions 탭, 행마다
 * 아이콘 aria-label "이름 — …"과 버스트 배지(B1~B3), 숫자 칸(Total uses · Boss clears / Boss uses). API(/api/graphql)는 robots Disallow라 안 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = (f) => path.join(ROOT, 'data', f);
const readJson = (f) => JSON.parse(fs.readFileSync(dataPath(f), 'utf8'));
const TOP_N = 20; // metaStats.campaignCompositions.list 행 수 — 예외 문턱을 여기서 가져온다

export function deriveStarB1Partners(rosters, db, burstCdr) {
  const byTitle = new Map(db.map((c) => [c.title, c]));
  const fixedB1 = (t) => { const c = byTitle.get(t); return !!c && !c.burstFlex && String(c.burst) === '1'; };
  const hosts = new Set((burstCdr.characters || []).filter((e) => e.cond === 'noOtherB1' && fixedB1(e.title)).map((e) => e.title));
  const lists = [
    { rows: rosters.most, total: rosters.meta.analyzedClears },
    { rows: rosters.boss, total: rosters.meta.bossClears },
  ];
  const out = {};
  for (const [li, { rows, total }] of lists.entries()) {
    const bar = rows[TOP_N - 1].u / total;
    for (const r of rows) {
      const host = r.m.find((t) => hosts.has(t));
      if (!host) continue;
      for (const x of r.m) {
        if (x === host || hosts.has(x) || !fixedB1(x)) continue;
        const e = (out[x] ||= { title: x, host, uses: 0, rosters: 0, bossUses: 0, bossRosters: 0 });
        if (li === 0) { e.uses += r.u; e.rosters++; } else { e.bossUses += r.u; e.bossRosters++; }
      }
    }
    for (const e of Object.values(out)) e[li === 0 ? 'qualifies' : 'bossQualifies'] = (li === 0 ? e.uses : e.bossUses) / total >= bar;
  }
  const bars = lists.map(({ rows, total }) => Number((rows[TOP_N - 1].u / total * 100).toFixed(3)));
  const list = Object.values(out).filter((e) => e.qualifies || e.bossQualifies)
    .sort((a, b) => b.uses - a.uses)
    .map(({ title, host, uses, rosters: n, bossUses, bossRosters }) => ({
      title, host, uses, pct: Number((uses / rosters.meta.analyzedClears * 100).toFixed(2)), rosters: n,
      bossUses, bossPct: Number((bossUses / rosters.meta.bossClears * 100).toFixed(2)), bossRosters,
    }));
  return { barPct: bars[0], bossBarPct: bars[1], list };
}

// **같이 쓰는 짝**(2026-10-24): 사람들이 우연보다 자주 한 조합에 같이 넣는 두 니케. lift = 같이 쓴 몫 / (각자 몫의 곱).
//   같이 쓴 몫이 0.5% 미만인 짝은 뺀다(표본이 얇은 짝의 lift는 튄다). lift 2 이상만 싣는다.
//   엔진은 캠페인 폴백 순위·4/5 채우기에 WEIGHTS.CAMP_COUSE_PAIR × ln(lift)를 더한다(synergyEngine campPairBonus).
//   기준값(0.5% · 2)은 scripts/benchPeopleChoice.mjs --camp-pairs로 홀짝 순위를 엇갈려 잰 것 — docs/log/2026-10.md.
export const COUSE_MIN_SHARE = 0.005;
export const COUSE_MIN_LIFT = 2;
export function deriveCoUsePairs(rows, minShare = COUSE_MIN_SHARE, minLift = COUSE_MIN_LIFT) {
  const tot = rows.reduce((a, r) => a + r.u, 0);
  const one = {}; const two = {};
  for (const r of rows) {
    r.m.forEach((t) => { one[t] = (one[t] || 0) + r.u; });
    for (let i = 0; i < r.m.length; i++) for (let k = i + 1; k < r.m.length; k++) {
      const key = [r.m[i], r.m[k]].sort().join('|'); two[key] = (two[key] || 0) + r.u;
    }
  }
  return Object.entries(two).filter(([, v]) => v / tot >= minShare).map(([key, v]) => {
    const [a, b] = key.split('|');
    return { a, b, lift: Number(((v / tot) / ((one[a] / tot) * (one[b] / tot))).toFixed(2)), pct: Number((v / tot * 100).toFixed(2)) };
  }).filter((p) => p.lift >= minLift).sort((x, y) => y.lift - x.lift || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

// checkData가 deriveStarB1Partners만 불러 쓴다 — 직접 실행할 때만 아래가 돈다.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();

// metaStats.campaignCompositions 안의 `"key": {…}` 블록을 지우고 campaignCompositions 여는 줄 바로 뒤에 새로 넣는다.
function spliceBlock(text, key, obj) {
  const KEY = `"${key}": `;
  const at = text.indexOf(KEY);
  if (at >= 0) { // 옛 블록 지우기: 여는 중괄호부터 짝 맞는 닫는 중괄호 + 뒤따르는 쉼표·줄바꿈까지
    let i = text.indexOf('{', at), depth = 0, inStr = false;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (inStr) { if (ch === '\\') i++; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) break;
    }
    const lineStart = text.lastIndexOf('\n', at) + 1;
    text = text.slice(0, lineStart) + text.slice(i + 1).replace(/^,\r?\n/, '');
  }
  const anchor = '"campaignCompositions": {';
  const ai = text.indexOf(anchor);
  if (ai < 0) { console.error('metaStats.json에 campaignCompositions가 없다'); process.exit(1); }
  const nl = text.indexOf('\n', ai) + 1;
  return text.slice(0, nl) + '    ' + KEY + JSON.stringify(obj, null, 2).replace(/\n/g, '\n    ') + ',\n' + text.slice(nl);
}

async function main() {
const db = readJson('characterDatabase.json');
const burstCdr = readJson('burstCdr.json');

if (process.argv.includes('--check')) {
  const rosters = readJson('campaignRosters.json');
  const ms = readJson('metaStats.json');
  const want = deriveStarB1Partners(rosters, db, burstCdr);
  const have = ms.campaignCompositions?.starB1Partners;
  const same = have && JSON.stringify({ barPct: have.barPct, bossBarPct: have.bossBarPct, list: have.list }) === JSON.stringify(want);
  if (!same) { console.log(`MISMATCH ${JSON.stringify(want.list.map((e) => e.title))} ≠ ${JSON.stringify(have?.list?.map((e) => e.title))}`); process.exit(1); }
  const pairs = deriveCoUsePairs(rosters.most);
  if (JSON.stringify(ms.campaignCompositions?.coUsePairs?.list) !== JSON.stringify(pairs)) { console.log(`MISMATCH 짝 ${pairs.length} ≠ ${ms.campaignCompositions?.coUsePairs?.list?.length}`); process.exit(1); }
  console.log(`OK ${want.list.map((e) => e.title).join(',')} · 짝 ${pairs.length}`);
  process.exit(0);
}

const src = process.argv[2];
if (!src) { console.error('사용: node scripts/importCampaignRosters.mjs <화면에서 읽은 json>'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const byTitle = new Map(db.map((c) => [c.title, c]));
const alias = readJson('enikkAlias.json').aliases;
const num = (s) => Number(String(s || '0').replace(/,/g, ''));
const header = String(raw.header || '');
const headNum = (label) => num((header.match(new RegExp(`${label}\\s*\\n\\s*([\\d,]+)`)) || [])[1]);
const problems = [];
// 버스트 배지로 이름을 가른다 — enikk 'Rei'는 B3면 아야나미 레이, B1이면 우리 DB의 'Rei'(라이). 별칭 표 collisionNotes 참고.
const toTitle = (m) => {
  const a = alias[m.name];
  if (a && byTitle.has(m.name) && m.burst && `B${byTitle.get(m.name).burst}` === m.burst && `B${byTitle.get(a)?.burst}` !== m.burst) return m.name;
  return a || m.name;
};
function rows(list, useKey, label) {
  const out = [];
  for (const r of list) {
    const m = r.members.map(toTitle);
    const bad = m.filter((t) => !byTitle.has(t));
    if (bad.length) { problems.push(`${label} #${r.rank}: DB에 없는 이름 ${bad.join(', ')}`); continue; }
    // enikk 원본에 같은 니케가 두 번 든 행이 있다(10-23: 600행 중 2 · 904행 중 4, 크라운·앨리스·리타 등 — 사용 1~45회). 게임에선 불가능한 조합이라 뺀다.
    if (new Set(m).size !== 5) { skipped[label]++; continue; }
    r.members.forEach((x, i) => {
      const c = byTitle.get(m[i]);
      if (x.burst && !c.burstFlex && `B${c.burst}` !== x.burst) problems.push(`${label} #${r.rank}: ${m[i]} 화면 ${x.burst} ≠ DB B${c.burst}`);
    });
    out.push(label === 'most' ? { m, u: num(r.stats[useKey]), b: num(r.stats['Boss clears']) } : { m, u: num(r.stats[useKey]) });
  }
  return out;
}
const skipped = { most: 0, boss: 0 };
const most = rows(raw.most, 'Total uses', 'most');
const boss = rows(raw.boss, 'Boss uses', 'boss');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const rosters = {
  meta: {
    source: 'enikk.app', sourceUrl: 'https://enikk.app/campaign#compositions', server: 'ALL', asOf: raw.asOf,
    analyzedClears: headNum('Analyzed Clears'), bossClears: headNum('Boss Clears'), distinctRosters: headNum('Distinct Rosters'),
    staleAfterDays: 30,
    skippedDuplicateRows: skipped,
    note: '캠페인 > Compositions. most = "Most Used Compositions" 상위 행(u 클리어 수, b 그중 보스 스테이지 클리어 수), boss = "Boss Compositions" 전부(u 보스 클리어 수). 각 행은 정확히 5인 로스터. 이름은 enikkAlias로 우리 title. 엔진은 읽지 않는다 — scripts/importCampaignRosters.mjs 머리 주석.',
  },
  most, boss,
};
fs.writeFileSync(dataPath('campaignRosters.json'), JSON.stringify(rosters, null, 0).replace(/\},\{/g, '},\n{') + '\n');
const partners = deriveStarB1Partners(rosters, db, burstCdr);
const ms = readJson('metaStats.json');
ms.campaignCompositions.starB1Partners = {
  note: '아니스 : 스타(burstCdr noOtherB1 고정 1버스트)와 같이 쓴 고정 1버스트 중, 같이 쓴 조합 클리어 합이 상위 20행 마지막 행의 몫(barPct) 이상인 것 — 보스 목록은 bossBarPct. 엔진 STAR_PARTNERS_BY_MODE.campaign 예외. data/campaignRosters.json에서 scripts/importCampaignRosters.mjs가 만든다(checkData가 맞는지 본다).',
  asOf: raw.asOf, ...partners,
};
// metaStats.json은 손으로 다듬은 표기(9.0 같은 소수점)가 있어 통째로 다시 쓰면 무관한 줄이 수백 개 바뀐다 — 이 블록들만 글자로 갈아 끼운다.
const coUsePairs = {
  note: '캠페인 사람들이 우연보다 자주 같이 쓰는 두 니케(lift = 같이 쓴 몫 / 각자 몫의 곱, 같이 쓴 몫 0.5% 이상 · lift 2 이상). data/campaignRosters.json의 most에서 scripts/importCampaignRosters.mjs가 만든다(checkData가 맞는지 본다). 엔진 campPairBonus.',
  asOf: raw.asOf, minPct: COUSE_MIN_SHARE * 100, minLift: COUSE_MIN_LIFT, list: deriveCoUsePairs(rosters.most),
};
let text = fs.readFileSync(dataPath('metaStats.json'), 'utf8');
text = spliceBlock(text, 'coUsePairs', coUsePairs);
text = spliceBlock(text, 'starB1Partners', ms.campaignCompositions.starB1Partners);
JSON.parse(text);
fs.writeFileSync(dataPath('metaStats.json'), text);
console.log(`most ${most.length} · boss ${boss.length} · 클리어 ${rosters.meta.analyzedClears} · 보스 ${rosters.meta.bossClears} · 예외 ${JSON.stringify(partners)} · 짝 ${coUsePairs.list.length}`);
}
