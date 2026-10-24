#!/usr/bin/env node
/**
 * enikk 타워·솔로레이드 **넓은 조합 표**(화면에서 읽은 json) → `data/towerRosters.json` · `data/soloRaidRosters.json` (2026-10-24)
 *
 *   node scripts/importEnikkWide.mjs tower <화면 json>     # 타워 > Compositions, 풀마다 전부(행을 펼쳐 Uses·Floors·% of clears)
 *   node scripts/importEnikkWide.mjs solo <화면 json>      # 솔로레이드 시즌 > Teams, Parse Count 순 상위(시즌마다 weakness·boss를 넣어 준다)
 *
 * ■ 왜: 엔진이 읽는 등록 표(towerCompositions 풀당 10 · soloRaidTeams 시즌당 25)는 좁아서, 엔진이 사람들과 어디서 갈리는지 셀 수가 없다.
 *   이 두 파일은 **시험 전용**(scripts/benchPeopleChoice.mjs)이다 — 엔진은 읽지 않는다(브라우저 번들에 싣지 않는다).
 * ■ 화면 읽는 법: data/campaignRosters.json과 같다(일회용 헤드리스 크롬, API는 robots Disallow라 안 쓴다 — docs/data.md).
 *   멤버 이름은 아이콘 접근성 이름(타워 "이름 — Limit Break…", 레이드 "B2 Crown"), 이름은 enikkAlias로 우리 title.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const [kind, src] = process.argv.slice(2);
if (!['tower', 'solo'].includes(kind) || !src) { console.error('사용: node scripts/importEnikkWide.mjs tower|solo <화면 json>'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const db = readJson('characterDatabase.json');
const byTitle = new Map(db.map((c) => [c.title, c]));
const alias = readJson('enikkAlias.json').aliases;
const num = (s) => Number(String(s || '0').replace(/,/g, ''));
// 버스트 배지로 이름을 가른다 — importCampaignRosters.mjs와 같은 규칙(enikk 'Rei' B3 = 아야나미 레이, B1 = 우리 'Rei'(라이))
const toTitle = (name, burst) => {
  const a = alias[name];
  if (a && byTitle.has(name) && burst && `B${byTitle.get(name).burst}` === burst && `B${byTitle.get(a)?.burst}` !== burst) return name;
  return a || name;
};
const problems = [];
const skipped = { duplicate: 0, unknown: 0, short: 0 };
function members(list, label) {
  const m = list.map((x) => toTitle(x.name, x.burst));
  if (m.length !== 5) { skipped.short++; return null; }
  const bad = m.filter((t) => !byTitle.has(t));
  if (bad.length) { problems.push(`${label}: DB에 없는 이름 ${bad.join(', ')}`); skipped.unknown++; return null; }
  if (new Set(m).size !== 5) { skipped.duplicate++; return null; }
  list.forEach((x, i) => {
    const c = byTitle.get(m[i]);
    if (x.burst && !c.burstFlex && `B${c.burst}` !== x.burst) problems.push(`${label}: ${m[i]} 화면 ${x.burst} ≠ DB B${c.burst}`);
  });
  return m;
}

let out, file;
if (kind === 'tower') {
  const POOL = { Tribe: ['tribe', null], Elysion: ['elysion', 'elysion'], Missilis: ['missilis', 'missilis'], Tetra: ['tetra', 'tetra'], 'Over-Spec': ['overspec', 'pilgrim'] };
  const pools = [];
  for (const [name, rows] of Object.entries(raw.pools)) {
    const [pool, tower] = POOL[name];
    const seen = new Set();
    const outRows = [];
    for (const r of rows.sort((a, b) => a.rank - b.rank)) {
      if (seen.has(r.rank)) continue; seen.add(r.rank);
      // 타워 행의 버스트 배지는 멤버 순서대로 "#n | 풀 | B1 | B2 | …" — 아이콘 이름과 같은 순서
      const bursts = (r.text.match(/\| (B[123]) /g) || []).map((x) => x.slice(2, 4)).slice(0, 5);
      const m = members(r.members.map((n, i) => ({ name: n, burst: bursts[i] })), `${name} #${r.rank}`);
      if (!m) continue;
      const g = (lab) => (r.text.match(new RegExp(`([\\d.,]+%?) \\| ${lab}`)) || [])[1];
      outRows.push({ rank: r.rank, m, u: num(g('Uses')), floors: num(g('Floors')), pct: Number(String(g('% of clears') || '0').replace('%', '')) });
    }
    pools.push({ pool, tower, rows: outRows });
  }
  out = {
    meta: { source: 'enikk.app', sourceUrl: 'https://enikk.app/tower#compositions', server: 'ALL', asOf: raw.asOf, header: String(raw.header || '').replace(/\s+/g, ' ').trim(), skipped,
      note: '타워 > Compositions > Most Used Compositions, 풀마다 화면에 있는 조합 전부(u 사용 수 · floors · pct 그 풀 안 클리어 몫). 순위가 비는 행은 화면에서 못 펼친 것. 엔진은 읽지 않는다 — scripts/importEnikkWide.mjs 머리 주석.' },
    pools,
  };
  file = 'towerRosters.json';
} else {
  const seasons = [];
  for (const [raid, s] of Object.entries(raw.seasons)) {
    const outRows = [];
    const seen = new Set();
    for (const r of s.rows) {
      const m = members(r.members, `시즌 ${raid}`);
      if (!m) continue;
      const k = [...m].sort().join('|');
      // 같은 조합이 서버별로 따로 잡힌다(soloRaidTeams.json caveat) — 넓은 표에선 합친다
      const [maxD, avgD, , parses] = r.text.split(' | ');
      if (seen.has(k)) { const o = outRows.find((x) => x.k === k); o.u += num(parses); continue; }
      seen.add(k);
      outRows.push({ k, m, u: num(parses), maxDamage: maxD, avgDamage: avgD });
    }
    seasons.push({ raid: Number(raid), weakness: s.weakness, boss: s.boss, rows: outRows.map(({ k, ...x }) => x).sort((a, b) => b.u - a.u) });
  }
  out = {
    meta: { source: 'enikk.app', sourceUrl: 'https://enikk.app/soloraid', asOf: raw.asOf, skipped,
      note: '솔로레이드 시즌 > Teams(Sort by Parse Count) 상위 행. u = parses(같은 조합의 서버별 행은 합쳤다). 엔진은 읽지 않는다 — scripts/importEnikkWide.mjs 머리 주석. 엔진의 시즌 표는 data/soloRaidTeams.json(상위 25).' },
    seasons: seasons.sort((a, b) => b.raid - a.raid),
  };
  file = 'soloRaidRosters.json';
}
if (problems.length) console.error(problems.join('\n'));
fs.writeFileSync(path.join(ROOT, 'data', file), JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(`${file} · 건너뜀 ${JSON.stringify(skipped)} · 문제 ${problems.length}`);
