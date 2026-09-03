#!/usr/bin/env node
/**
 * 무기 데이터 수집 — Fandom 위키의 무기 타입별 페이지 6개. (2026-09-03)
 *
 *   node scripts/refreshWeaponsFromFandom.mjs          # 받아서 비교만
 *   node scripts/refreshWeaponsFromFandom.mjs --write  # data/weapons.json 갱신
 *
 * 왜 필요한가
 *   평타 딜을 계산할 수 없어서 조합 비교기가 **모더니아를 3점**으로 만들었다.
 *   그의 3.05%는 *스킬* 추가딜이고, **평타 자체의 1발당 계수는 무기에 붙어 있다.**
 *   그 값이 여기 있다.
 *
 * 표 구조: Icon | Weapon name | Capacity | Reload time | Description
 *   Description 안에 "Deals N% of ATK as damage" (1발당 계수)와
 *   "Deals N% damage when attacking core" (코어 배율)가 들어 있다.
 *
 * ⚠️ **연사속도(초당 발사 수)는 여기에 없다.** 그래서 이 파일만으로는 평타 DPS를 못 낸다.
 *    장탄수 ÷ 연사속도 + 재장전 = 한 탄창 주기인데 가운데 항이 비어 있다.
 *    커뮤니티 글에도 수치는 이미지 표로만 있어 옮기지 못했다(2026-09-03 확인).
 *    인게임 무기 정보에서 사람이 옮기는 것이 남은 길이다.
 *
 * ⚠️ 출처와 예의
 *   Fandom은 CC BY-SA 위키라 출처를 밝히면 인용할 수 있다. 그래도 **페이지 6개만** 받고
 *   캐시한다. robots.txt가 Cloudflare 챌린지에 막혀 읽히지 않으므로(2026-09-03) 그 이상
 *   자동으로 훑지 않는다 — enikk에 대해 "그 선을 우리가 먼저 깨지 않는다"고 정한 것과 같다.
 *   Node 내장 fetch는 막히므로 curl을 쓴다(prydwen 수집기와 같은 이유).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'weapons.json');
const WRITE = process.argv.includes('--write');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const CACHE = path.join(os.tmpdir(), 'fandom-weapons');
fs.mkdirSync(CACHE, { recursive: true });

const BASE = 'https://nikke-goddess-of-victory-international.fandom.com/wiki/';
// 우리 characterDatabase의 weapon 코드 → 위키 문서 제목
const PAGES = {
  ar: 'Assault_Rifle',
  smg: 'Submachine_Gun',
  sg: 'Shotgun',
  sr: 'Sniper_Rifle',
  rl: 'Rocket_Launcher',
  mg: 'Machine_Gun',
};

function fetchPage(title) {
  const key = path.join(CACHE, title + '.html');
  if (fs.existsSync(key)) return fs.readFileSync(key, 'utf8');
  const html = execFileSync('curl',
    ['-sS', '-L', '--compressed', '-A', UA, '--max-time', '30', BASE + title],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(key, html);
  return html;
}

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'")
  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function parseWeapons(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  for (const t of tables) {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/g) || [];
    if (rows.length < 3) continue;
    const head = (rows[0].match(/<t[hd][\s\S]*?<\/t[hd]>/g) || []).map(strip);
    // 우리가 원하는 표인지 헤더로 확인한다 — 다른 표를 잘못 읽으면 조용히 틀린다
    if (!/weapon name/i.test(head.join(' ')) || !/capacity/i.test(head.join(' '))) continue;
    const iName = head.findIndex((h) => /weapon name/i.test(h));
    const iCap = head.findIndex((h) => /capacity/i.test(h));
    const iRel = head.findIndex((h) => /reload/i.test(h));
    const iDesc = head.findIndex((h) => /description/i.test(h));
    const out = [];
    rows.slice(1).forEach((r) => {
      const c = (r.match(/<t[hd][\s\S]*?<\/t[hd]>/g) || []).map(strip);
      if (c.length <= Math.max(iName, iCap, iRel, iDesc)) return;
      const name = c[iName]; if (!name) return;
      // 첫 칸(아이콘)에 **캐릭터 문서 링크**가 들어 있다 — 이게 무기↔캐릭터 매핑이다.
      // 무기 표에 캐릭터 이름 열은 없지만 링크는 있고, 그 제목이 우리 `title`과 형식이 같다
      // (예: /wiki/Asuka:_WILLE → "Asuka: WILLE").
      const links = [...r.matchAll(/href="\/wiki\/([^"#]+)"/g)].map((x) => decodeURIComponent(x[1]).replace(/_/g, ' '));
      const owner = links.find((l) => !/^Category:/.test(l) && !/^(Machine Gun|Assault Rifle|Submachine Gun|Shotgun|Sniper Rifle|Rocket Launcher)$/.test(l)) || null;
      const desc = iDesc >= 0 ? c[iDesc] : '';
      const shot = desc.match(/Deals ([\d.]+)% of ATK as damage/i);
      const core = desc.match(/Deals ([\d.]+)% damage when attacking core/i);
      out.push({
        name,
        owner,
        capacity: Number(c[iCap]) || null,
        reloadSec: Number(c[iRel]) || null,
        shotCoefPct: shot ? Number(shot[1]) : null,
        coreMultPct: core ? Number(core[1]) : null,
      });
    });
    if (out.length) return out;
  }
  return [];
}

const result = { meta: {
  asOf: new Date().toISOString().slice(0, 10),
  source: 'Fandom — NIKKE Goddess of Victory International Wiki, 무기 타입별 문서 6개 (CC BY-SA)',
  grade: 'B',
  gradeNote: '위키가 인게임 값을 옮긴 것이라 우리에게는 2차 출처다. 인게임과 대조하지 않았다.',
  missing: '연사속도(초당 발사 수)가 없다. 장탄수 ÷ 연사속도 + 재장전 = 탄창 주기인데 가운데 항이 비어 평타 DPS를 못 낸다.',
  collectedBy: 'scripts/refreshWeaponsFromFandom.mjs',
}, byType: {} };

let totalRows = 0;
for (const [code, title] of Object.entries(PAGES)) {
  let rows = [];
  try { rows = parseWeapons(fetchPage(title)); } catch (e) { console.log(`${code}: 실패 — ${String(e.message).slice(0, 60)}`); }
  result.byType[code] = rows;
  totalRows += rows.length;
  const withCoef = rows.filter((r) => r.shotCoefPct != null).length;
  console.log(`${code.padEnd(4)} ${title.padEnd(18)} ${String(rows.length).padStart(3)}종  ` +
    `1발당 계수 있음 ${withCoef}  장탄수 있음 ${rows.filter((r) => r.capacity).length}  재장전 있음 ${rows.filter((r) => r.reloadSec).length}`);
}
console.log(`\n합계 ${totalRows}종`);

if (WRITE) {
  // ⚠️ **덮어쓰지 말고 병합한다.** 이 스크립트가 만드는 것은 Fandom에서 온 부분(meta·byType)뿐이다.
  //    fireRate(아카라이브 출처)와 derived(우리가 계산한 값)는 여기서 안 만드므로 그대로
  //    덮어쓰면 조용히 사라진다 — 2026-09-03에 실제로 한 번 날렸다.
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* 첫 실행 */ }
  const merged = { ...prev, meta: result.meta, byType: result.byType };
  fs.writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n');
  console.log(`→ ${path.relative(ROOT, OUT)} 갱신 (fireRate·derived는 보존)`);
} else {
  console.log('\n(--write 를 붙이면 data/weapons.json 에 씁니다)');
}
