// 스킬 설명의 **일본어 공식 문구**를 nikke.wikiru.jp에서 가져온다.
//
// ■ 왜 한국어보다 늦게 만들었나 — 검증 방법이 없었다
//
//   wikiru는 신뢰도가 한 단계 낮다. 실측 사례: 헬름 버스트 스킬을
//     wikiru  「■防御力が最も高い1機に」   (방어력이 가장 높은)
//     한/영   「공격력이 가장 높은」/「highest ATK」
//   숫자(1237.5)는 양쪽이 같아서 **숫자 대조로는 이 오류를 절대 못 잡는다.**
//   그래서 한국어를 확보하기 전까지는 일본어를 들여올 수 없었다.
//
//   이제 한국어가 582/588 있으므로, **스킬 단위로 한국어와 대조**할 수 있다.
//   숫자에 더해 '대상 지정 표현'(누구에게 거는가)까지 맞춰 본다. 헬름 건이 여기서 걸린다.
//
//   ⚠️ 페이지 전체에서 표현을 찾으면 안 된다. 헬름 페이지에는 攻撃力が最も高い와
//      防御力が最も高い가 **둘 다** 있어서(다른 스킬·주석에) 집합 비교로는 통과해버린다.
//      2026-08-18에 실제로 그렇게 놓쳤다. 반드시 스킬 하나씩 비교한다.
//
// ■ 페이지 구조 (실측)
//
//     スキル1
//     &dagger;
//     陣頭指揮        ← 스킬명
//     パッシブ         ← 종류
//     Lv / 効果
//     1  <레벨1 설명>
//     ...
//     5  <레벨5 설명>
//     6 7 8 9 10      ← 6~9는 본문이 비어 있다
//     <레벨10 설명>    ← 우리가 쓰는 값
//     &uarr;
//
//   레벨 1~5와 10만 본문이 있다. '10'만 있는 줄 다음부터 &uarr; 전까지가 레벨 10 설명이다.
//   우리 영어·한국어 데이터가 레벨 10 기준이므로 여기를 맞춘다.
//
// 사용법:
//   node scripts/refreshSkillsJaFromWikiru.mjs           # 조사만
//   node scripts/refreshSkillsJaFromWikiru.mjs --write   # 검증 통과분만 저장

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const DB = path.join(ROOT, 'data/characterDatabase.json');
const CACHE = path.join(os.tmpdir(), 'wikiru-cache');
const WRITE = process.argv.includes('--write');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

fs.mkdirSync(CACHE, { recursive: true });

function fetchWikiru(nameJa) {
  const key = path.join(CACHE, encodeURIComponent(nameJa).slice(0, 120) + '.html');
  if (fs.existsSync(key)) return fs.readFileSync(key, 'utf8');
  let html;
  try {
    html = execFileSync('curl', ['-sS', '--compressed', '-A', UA, '-L', '--max-time', '30',
      'https://nikke.wikiru.jp/?' + encodeURIComponent(nameJa)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
  if (!html || !html.includes('スキル')) return null;
  fs.writeFileSync(key, html);
  return html;
}

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

const toLines = (html) => decode(
  html.replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '\n')
).split('\n').map((x) => x.trim()).filter(Boolean);

// 한 스킬 블록에서 **레벨 10 설명**과 스킬명을 뽑는다.
function extractOne(lines, start) {
  // 다음 스킬 절이나 표 끝까지가 이 블록이다.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^(スキル1|スキル2|バーストスキル|通常攻撃|面談|ボイス|コスチューム)$/.test(lines[i])) { end = i; break; }
    if (lines[i] === '&uarr;') { end = i; break; }
  }
  const seg = lines.slice(start, end);
  if (seg.length < 6) return null;

  // 스킬명: &dagger; 다음 줄. 없으면 헤더 다음 줄.
  let nameIdx = seg.findIndex((l) => l === '&dagger;');
  nameIdx = nameIdx >= 0 ? nameIdx + 1 : 1;
  const name = seg[nameIdx] || '';

  // 레벨 10 설명: 마지막으로 나오는 '10'만 있는 줄 다음부터 끝까지.
  let tenIdx = -1;
  for (let i = seg.length - 1; i >= 0; i--) { if (seg[i] === '10') { tenIdx = i; break; } }
  if (tenIdx < 0) return null;
  const desc = seg.slice(tenIdx + 1)
    .filter((l) => !/^(&dagger;|&uarr;|Lv|効果)$/.test(l))
    .join(' ').replace(/\s+/g, ' ').trim();
  if (!name || !desc) return null;
  return { name, desc };
}

// 스킬 3종을 뽑는다. 목차에도 같은 헤더가 있으므로 **본문 쪽**(뒤에 나오는 것)을 쓴다.
function extractSkills(html) {
  const lines = toLines(html);
  const find = (label) => {
    const all = [];
    lines.forEach((l, i) => { if (l === label) all.push(i); });
    // 목차는 헤더들이 연달아 붙어 있다(スキル1 바로 다음 줄이 スキル2). 본문은 사이에 내용이 있다.
    for (const i of all) {
      if (lines[i + 1] && !/^(スキル1|スキル2|バーストスキル|面談)$/.test(lines[i + 1])) return i;
    }
    return -1;
  };
  const idx = [find('スキル1'), find('スキル2'), find('バーストスキル')];
  if (idx.some((i) => i < 0)) return null;
  const out = idx.map((i) => extractOne(lines, i));
  return out.every(Boolean) ? out : null;
}

// ── 검증 ───────────────────────────────────────────────────────────────────
const numsOf = (s) => new Set(
  (String(s).match(/\d[\d,]*\.?\d*/g) || [])
    .map((n) => Number(n.replace(/,/g, ''))).filter(Number.isFinite)
);
const NEAR = 0.005;
const hasNear = (set, n) => {
  for (const m of set) {
    if (m === n) return true;
    const scale = Math.max(Math.abs(m), Math.abs(n));
    if (scale > 0 && Math.abs(m - n) / scale <= NEAR) return true;
  }
  return false;
};

// 대상 지정 표현 — "누구에게 거는가". 숫자가 같아도 이게 다르면 다른 스킬이다.
// 헬름 사례가 정확히 이 검사에 걸린다.
const TARGET_KO = [
  ['공격력이 가장 높은', 'ATK_HIGH'], ['방어력이 가장 높은', 'DEF_HIGH'],
  ['체력이 가장 높은', 'HP_HIGH'], ['공격력이 가장 낮은', 'ATK_LOW'],
  ['조준선에 가장 가까운', 'NEAREST'],
];
const TARGET_JA = [
  ['攻撃力が最も高い', 'ATK_HIGH'], ['防御力が最も高い', 'DEF_HIGH'],
  ['体力が最も高い', 'HP_HIGH'], ['攻撃力が最も低い', 'ATK_LOW'],
  ['照準線に最も近い', 'NEAREST'],
];
const tagsOf = (txt, table) => new Set(table.filter(([k]) => String(txt).includes(k)).map(([, v]) => v));

function verify(ja, character) {
  const problems = [];
  for (let i = 0; i < 3; i++) {
    const skill = character.skills[i];
    const enNums = numsOf(skill?.desc);
    const jaNums = numsOf(ja[i].desc);
    const missing = [...enNums].filter((n) => !hasNear(jaNums, n));
    if (enNums.size && missing.length > Math.floor(enNums.size / 2)) {
      problems.push(`스킬${i + 1} 숫자 불일치: 영어 ${[...enNums].join('/')} vs 일본어 ${[...jaNums].join('/')}`);
      continue;   // 숫자가 어긋나면 다른 스킬을 본 것이라 대상 비교는 의미가 없다
    }
    // 대상 지정 표현 대조 — 한국어가 있는 캐릭터만 (582/588)
    if (skill?.desc_kr) {
      const kt = tagsOf(skill.desc_kr, TARGET_KO);
      const jt = tagsOf(ja[i].desc, TARGET_JA);
      const onlyK = [...kt].filter((x) => !jt.has(x));
      const onlyJ = [...jt].filter((x) => !kt.has(x));
      // 양쪽 다 값이 있는데 서로 다르면 **모순**이다. 한쪽만 있는 것은 표현 차이일 수 있어 넘긴다.
      if (kt.size && jt.size && (onlyK.length || onlyJ.length)) {
        problems.push(`스킬${i + 1} 대상 조건 모순: 한국어 ${[...kt].join(',')} vs 일본어 ${[...jt].join(',')}`);
      }
    }
  }
  return problems;
}

// ── 실행 ───────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(DB, 'utf8'));
const cdb = Array.isArray(raw) ? raw : raw.characters;

const ok = []; const failed = [];
for (const c of cdb) {
  if (!c.name_ja || !(c.skills || []).length) { failed.push([c.id, 'name_ja 또는 스킬 없음']); continue; }
  const html = fetchWikiru(c.name_ja);
  if (!html) { failed.push([c.id, `문서 없음 (${c.name_ja})`]); continue; }
  const ja = extractSkills(html);
  if (!ja) { failed.push([c.id, '스킬 절 파싱 실패']); continue; }
  const problems = verify(ja, c);
  if (problems.length) { failed.push([c.id, problems.join(' | ')]); continue; }
  ok.push([c, ja]);
}

console.log(`검증 통과 ${ok.length}명 / 실패 ${failed.length}명 (전체 ${cdb.length})`);
if (failed.length) {
  console.log('\n■ 실패 목록 (저장하지 않음)');
  const byKind = {};
  for (const [id, why] of failed) {
    const kind = /대상 조건 모순/.test(why) ? '대상 조건 모순'
      : /숫자 불일치/.test(why) ? '숫자 불일치'
        : /문서 없음/.test(why) ? '문서 없음' : '파싱 실패';
    (byKind[kind] = byKind[kind] || []).push([id, why]);
  }
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(`\n  [${kind}] ${list.length}명`);
    list.slice(0, 8).forEach(([id, why]) => console.log(`     ${id.padEnd(28)} ${why.slice(0, 110)}`));
    if (list.length > 8) console.log(`     ... 외 ${list.length - 8}명`);
  }
}

if (!WRITE) { console.log('\n조사만 했습니다. 저장하려면 --write'); process.exit(0); }

for (const [c, ja] of ok) {
  c.skills.forEach((s, i) => { s.name_ja = ja[i].name; s.desc_ja = ja[i].desc; });
}
fs.writeFileSync(DB, JSON.stringify(raw, null, 2) + '\n');
console.log(`\n저장 완료 — ${ok.length}명의 desc_ja/name_ja`);
