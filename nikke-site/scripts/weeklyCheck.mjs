// 주간 자동 점검 — **사람 없이, AI 없이** 코드만으로 데이터가 낡았는지 찾아낸다.
//
// ■ 왜 이 스크립트인가 (2026-08-17)
//
//   주간 조사를 통째로 AI 세션에 맡겨 왔는데, 그 일의 상당 부분은 AI가 필요 없다:
//     "새 캐릭터가 나왔나 / 티어가 바뀌었나 / 스킬 자료가 낡았나"
//   → 받아와서 우리 데이터와 비교하면 끝나는 기계적인 일이다.
//   판단이 필요한 것은 **출처가 갈릴 때 어느 쪽을 택하느냐**뿐이다.
//
//   그래서 이 스크립트는 **찾아내기만 하고 고치지 않는다.** 데이터 파일을 건드리지 않는다.
//   바뀐 게 없으면 아무 것도 하지 않고, 뭔가 어긋났을 때만 보고서를 남긴다.
//   무엇을 반영할지는 사람이 보고서를 보고 정한다(설계 원칙 2 — 조건을 밝히고 판단은 사용자에게).
//
// ■ 어디서 돌려야 하나 — 이게 이번에 배운 것
//
//   실행 환경마다 접근 가능한 출처가 다르다(scripts/probeSources.mjs로 확인):
//     사용자 PC        6/6  ← 여기서 돌린다
//     GitHub Actions   4/6  prydwen·나무위키가 403 (데이터센터 IP 차단)
//     클라우드 routine  0/6  허용목록 프록시로 외부 웹 전면 차단
//   그래서 맨 먼저 접근 확인을 하고, 막혀 있으면 **엉뚱한 결론을 내지 않고 그대로 멈춘다.**
//   "출처가 안 열려서 못 봤다"와 "봤는데 바뀐 게 없다"는 전혀 다른 결과인데, 구분하지
//   않으면 조용히 후자로 오해된다.
//
// 사용법:
//   node scripts/weeklyCheck.mjs            # 점검만, 보고서는 화면에
//   node scripts/weeklyCheck.mjs --report   # reports/YYYY-MM-DD-auto.md 로 저장

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPO = path.resolve(ROOT, '..');
const WRITE = process.argv.includes('--report');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const get = (url) => {
  try {
    return execFileSync('curl', ['-sS', '--compressed', '-A', UA, '-L', '--max-time', '30', url],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
};

// 캐릭터 페이지는 196개라 매주 전부 새로 받으면 상대 사이트에 부담이고 느리다.
// scripts/refreshSkillsFromPrydwen.mjs와 **같은 캐시 폴더**를 쓰고, 하루 지난 것만 다시 받는다.
// (티어가 하루 사이에 바뀌는 일은 드물고, 주 1회 실행이므로 사실상 매번 새로 받는 셈이다)
const CACHE = path.join(os.tmpdir(), 'prydwen-cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
fs.mkdirSync(CACHE, { recursive: true });
const getCharPage = (slug) => {
  const f = path.join(CACHE, slug + '.html');
  try {
    if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < CACHE_TTL_MS) {
      return fs.readFileSync(f, 'utf8');
    }
  } catch { /* 캐시가 깨졌으면 그냥 새로 받는다 */ }
  const html = get('https://www.prydwen.gg/nikke/characters/' + slug);
  if (html && html.includes('rating_story')) fs.writeFileSync(f, html);
  return html;
};

const cdbRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/characterDatabase.json'), 'utf8'));
const cdb = Array.isArray(cdbRaw) ? cdbRaw : cdbRaw.characters;
const freshness = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dataFreshness.json'), 'utf8'));

const findings = [];   // 사람이 봐야 할 것
const notes = [];      // 확인은 했고 이상 없는 것

// ── 0. 접근 확인 ───────────────────────────────────────────────────────────
// prydwen이 막혀 있으면 아래 검사 대부분이 무의미하다. 명확히 구분해서 멈춘다.
const prydwenList = get('https://www.prydwen.gg/nikke/characters');
if (!prydwenList || !prydwenList.includes('/nikke/characters/')) {
  console.log('❌ prydwen.gg에 접근하지 못했습니다 — 이 환경에서는 점검할 수 없습니다.');
  console.log('   (node scripts/probeSources.mjs 로 어느 출처가 막혔는지 확인하세요)');
  process.exit(2);   // 2 = 환경 문제. 1(=발견 있음)과 구분한다.
}

// ── 1. 신규 캐릭터 ─────────────────────────────────────────────────────────
// prydwen 목록에는 있는데 우리 DB에 없는 캐릭터를 찾는다.
//
// ⚠️ slug만 비교하면 **오탐이 쏟아진다.** prydwen과 우리의 id 규칙이 다르기 때문이다:
//      prydwen `aqua-marine-helm`          = 우리 `helm-aquamarine`
//      prydwen `e-h`                       = 우리 `eh`
//      prydwen `innocent-dayss-snow-white` = 우리 `snow-white-innocent-days`
//    처음에 slug를 정규화(하이픈 분해·정렬)해 비교했더니 6건 중 4건이 오탐이었다.
//    "오탐이 나는 검사는 아무도 믿지 않는다"(CLAUDE.md 원칙 4).
//
// 그래서 **페이지에 적힌 실제 이름**을 우리 title과 대조한다. 그걸로도 안 맞는 것만
// 아래 별칭 표에 적는다. 표에 없고 이름도 안 맞으면 그때가 진짜 신규다.
const SLUG_ALIAS = {
  // prydwen이 우리와 다른 이름을 쓰는 경우만. 근거를 함께 적을 것.
  siren: 'little-mermaid',                          // prydwen "Siren" = 우리 "Little Mermaid"
  'asuka-shikinami-langley-wille': 'asuka-wille',   // prydwen은 풀네임, 우리는 축약
};

const haveIds = new Set(cdb.map((c) => c.id));
const normName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const byNormTitle = new Map(cdb.map((c) => [normName(c.title), c.id]));

const slugs = [...new Set([...prydwenList.matchAll(/\/nikke\/characters\/([a-z0-9-]+)/g)].map((m) => m[1]))];
// *-treasure 는 prydwen이 애장품 버전을 별도 페이지로 두는 것. 우리는 investmentNotes로
// 처리하므로 신규가 아니다.
const candidates = slugs.filter((s) => !s.endsWith('-treasure') && !haveIds.has(s) && !SLUG_ALIAS[s]);

const truly = [];
const resolvedByName = [];
for (const slug of candidates) {
  const page = getCharPage(slug);
  const c = (page || '').replace(/\\"/g, '"');
  const g = (k) => { const m = c.match(new RegExp('"' + k + '"\\s*:\\s*("[^"]*"|null)')); return m ? m[1].replace(/"/g, '') : null; };
  // ⚠️ 이름은 `unitName`/`fullName` 같은 독립 키로 있지 않다. **slug 바로 뒤**에 붙어 있다:
  //      "slug":"aqua-marine-helm","name":"Helm: Aquamarine"
  //    최상위 `name` 키는 Next.js 메타데이터라 "Next.MetadataOutlet" 같은 값이 나온다 — 쓰면 안 된다.
  const nameMatch = c.match(new RegExp('"slug"\\s*:\\s*"' + slug + '"\\s*,\\s*"name"\\s*:\\s*"([^"]+)"'));
  const pageName = nameMatch ? nameMatch[1] : null;
  const hit = pageName ? byNormTitle.get(normName(pageName)) : null;
  if (hit) { resolvedByName.push(`${slug} = ${hit}`); continue; }
  const rated = ['rating_story', 'rating_boss', 'rating_pvp'].every((k) => { const v = g(k); return v && v !== 'null'; });
  truly.push({ slug, name: pageName || '?', burst: g('burst_type') || '?', rated });
}

if (truly.length) {
  const ready = truly.filter((d) => d.rated);
  findings.push({
    title: `신규 캐릭터 ${truly.length}명이 prydwen에 있고 우리 DB에 없음`,
    body: truly.map((d) => `- \`${d.slug}\` (${d.name}, 버스트 ${d.burst}) — 티어 ${d.rated ? '**있음 → 추가 가능**' : '아직 없음(추가 불가)'}`).join('\n') +
      (ready.length
        ? `\n\n→ ${ready.length}명은 티어가 붙어 **지금 추가할 수 있습니다.**`
        : '\n\n→ 전원 티어 미부여. prydwen이 평가를 붙일 때까지 기다립니다(`tiers`가 없으면 `checkData`가 `SHAPE_TIER` ERROR를 냅니다. 값을 지어내지 마세요).'),
  });
} else {
  notes.push(`신규 캐릭터 없음 (prydwen ${slugs.length}개 slug 대조)`);
}
if (resolvedByName.length) {
  notes.push(`id 표기만 다른 것 ${resolvedByName.length}건을 이름으로 해소: ${resolvedByName.join(', ')}`);
}

// ── 2. 티어 변동 ───────────────────────────────────────────────────────────
// prydwen 캐릭터 페이지의 rating_* 와 우리 tiers 를 전수 대조한다.
// ⚠️ 여기서 **자동으로 고치지 않는다.** 2026-08-15에 prydwen 하나만 보고 8건을 고치려다,
//    nikke.gg·game8·enikk를 더 대조하니 7건에서 prydwen이 아웃라이어였다.
//    단일 출처는 '확인할 거리'이지 정답이 아니다.
const MAP = { story: 'rating_story', bossing: 'rating_boss', pvp: 'rating_pvp' };
const drift = [];
for (const c of cdb) {
  const page = getCharPage(c.id);
  if (!page) continue;
  const clean = page.replace(/\\"/g, '"');
  for (const [ours, theirs] of Object.entries(MAP)) {
    const m = clean.match(new RegExp('"' + theirs + '"\\s*:\\s*"([^"]*)"'));
    if (!m) continue;
    if (c.tiers?.[ours] && m[1] && c.tiers[ours] !== m[1]) {
      drift.push(`- ${c.name_kr} ${ours}: 우리 **${c.tiers[ours]}** vs prydwen **${m[1]}**`);
    }
  }
}
if (drift.length) {
  findings.push({
    title: `prydwen 티어와 어긋나는 값 ${drift.length}건`,
    body: drift.join('\n') +
      '\n\n⚠️ **바로 고치지 마세요.** prydwen은 한 곳일 뿐입니다. nikke.gg·game8·enikk를 함께 대조해' +
      ' 2곳 이상이 일치하는 값만 반영합니다. 2026-08-15에 8건 중 7건이 prydwen 아웃라이어였습니다.' +
      ' 경위는 `docs/open-items.md`.',
  });
} else {
  notes.push('prydwen 티어와 어긋나는 값 없음');
}

// ── 3. 자료 신선도 ─────────────────────────────────────────────────────────
// dataFreshness.json에 적힌 기준일과 staleAfterDays를 지금 날짜와 대조한다.
const today = new Date();
for (const [key, meta] of Object.entries(freshness)) {
  if (!meta || typeof meta !== 'object' || !meta.asOf || !meta.staleAfterDays) continue;
  const days = Math.floor((today - Date.parse(meta.asOf + 'T00:00:00Z')) / 86400000);
  if (days > meta.staleAfterDays) {
    findings.push({
      title: `\`${key}\` 자료가 낡았습니다 — 기준일 ${meta.asOf} (${days}일 전, 상한 ${meta.staleAfterDays}일)`,
      body: meta.refreshMethod ? `갱신 방법: \`${meta.refreshMethod}\`` : '',
    });
  } else {
    notes.push(`${key} 신선도 정상 (${days}/${meta.staleAfterDays}일)`);
  }
}

// ── 4. 검사 6종 ────────────────────────────────────────────────────────────
// 데이터는 안 건드렸지만, 다른 경로로 깨졌을 수 있으니 기준선을 확인한다.
let verifyOut = '';
let verifyOk = true;
try {
  verifyOut = execFileSync('npm', ['run', 'verify'], { cwd: ROOT, encoding: 'utf8', shell: true });
} catch (e) {
  verifyOut = String(e.stdout || '') + String(e.stderr || '');
  verifyOk = false;
}
const errLine = (verifyOut.match(/ERROR (\d+) \/ WARN (\d+)/) || [])[0] || '(파악 실패)';
if (!verifyOk || !/ERROR 0/.test(verifyOut)) {
  findings.push({ title: `검사 실패 — ${errLine}`, body: '```\n' + verifyOut.slice(-1200) + '\n```' });
} else {
  notes.push(`검사 6종 기준선 정상 (${errLine})`);
}

// ── 보고 ───────────────────────────────────────────────────────────────────
// ⚠️ toISOString()은 **UTC 기준**이라 쓰면 안 된다. 한국(UTC+9)에서 오전 9시 이전에 돌면
//    전날 날짜가 찍힌다. 실제로 2026-08-18 08:43에 실행했는데 파일명이 2026-08-17로 나왔다.
//    예약이 월요일 10:00이라 평소엔 안 드러나지만, 손으로 돌리거나 실행이 밀리면 바로 어긋난다.
//    보고서 날짜는 사람이 보는 날짜여야 하므로 **로컬 시간**으로 만든다.
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const lines = [
  `# 주간 자동 점검 (${stamp})`,
  '',
  '`scripts/weeklyCheck.mjs`가 자동 생성했습니다. **데이터 파일은 건드리지 않았습니다** —',
  '찾아내기만 하고 무엇을 반영할지는 사람이 정합니다.',
  '',
];
if (findings.length) {
  lines.push(`## 확인이 필요한 것 ${findings.length}건`, '');
  findings.forEach((f, i) => { lines.push(`### ${i + 1}. ${f.title}`, '', f.body, ''); });
} else {
  lines.push('## 확인이 필요한 것 없음', '', '이번 회차에는 어긋난 것이 없습니다.', '');
}
lines.push('## 이상 없이 확인한 항목', '', ...notes.map((n) => `- ${n}`), '');
const md = lines.join('\n');

console.log(md);

if (WRITE) {
  const out = path.join(REPO, 'reports', `${stamp}-auto.md`);
  fs.writeFileSync(out, md);
  console.log(`\n보고서 저장: ${path.relative(REPO, out)}`);
}

// 0 = 이상 없음 / 1 = 확인할 것 있음 / 2 = 환경 문제(출처 접근 불가)
process.exit(findings.length ? 1 : 0);
