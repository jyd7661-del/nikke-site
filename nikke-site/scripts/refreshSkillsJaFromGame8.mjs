// 스킬 설명의 **일본어 공식 문구**를 game8.jp에서 가져온다.
//
// ■ 왜 game8인가 (2026-08-18, 출처 3곳을 같은 잣대로 재고 골랐다)
//
//   | 출처            | 총 커버리지 | 2024 | 2025 | 2026 |
//   |-----------------|-----------|------|------|------|
//   | nikke.wikiru.jp |  71/196   |  0%  |  0%  |  0%  |  2023-02 이후 멈춤
//   | kamigame.jp     | 148/196   | 89%  | 33%  |  0%  |  2025 중 멈춤
//   | game8.jp        | 172/196   | 80%  | 86%  |100%  |  ← 채택
//
//   **총 커버리지만 보면 kamigame도 쓸 만해 보인다.** 연도별로 쪼개야 죽은 출처가 드러난다.
//   유저 지적이 이 잣대를 만들었다 — "데이터가 일정부분 없는 사이트는 신뢰도가 낮다.
//   없다는 건 업데이트가 오랫동안 안 됐다는 거고, 그럼 그 사이트 데이터들도 신뢰하기 어렵다."
//
//   그 추론이 수치로 입증됐다. wikiru가 옛 값을 주던 캐릭터를 game8과 대조하니:
//     diesel  wikiru 22.04 / 11.02 (상향 전)  ->  game8 25.92 / 12.96  = 우리 영어와 일치
//     noise   wikiru 15.16 (상향 전)          ->  game8 5/5 일치
//   wikiru가 헬름 버스트를 「防御力が最も高い」로 적었던 자리를 game8은 「攻撃力が最も高い」로
//   적는다 — 한국어·영어와 같다.
//
// ■ 페이지 구조 (실측)
//
//     ヘルムのスキル一覧
//     ※スキル効果はLv10時の最大値を掲載しています   <- 사이트가 레벨10 기준임을 명시한다
//     通常攻撃（スナイパーライフル）                  <- 평타. 우리는 안 쓴다
//     【 効果 】
//     ・…
//     スキル（陣頭指揮）                            <- 스킬1. 괄호 안이 스킬명
//     【 クールタイム 】・無し
//     【 効果 】
//     ・最後の弾丸が命中した時、味方全体に「…14.64%増加（10秒）」
//     スキル（砲門開放）                            <- 스킬2
//     バーストスキル（イージスキャノン）               <- 버스트
//
//   ⚠️ '効果' 절이 'クールタイム' 절보다 뒤에 온다. 그냥 '・' 줄을 다 모으면 쿨타임의
//      '・40秒'까지 설명에 섞인다. **마지막 '効果' 이후**만 취해야 한다.
//
// ■ 검증 — 숫자 + **스킬별 대상 조건**
//
//   숫자만 대조하면 헬름의 防御力/攻撃力 같은 오류를 절대 못 잡는다(숫자는 양쪽 다 1237.5).
//   그래서 한국어(582/588 확보분)와 **스킬 하나씩** 대상 지정 표현을 맞춰 본다.
//   ⚠️ 페이지 전체에서 표현을 찾으면 안 된다 — 한 페이지에 攻撃力…와 防御力…가 둘 다 있으면
//      집합 비교로는 통과해버린다. 2026-08-18에 실제로 그렇게 놓쳤다.
//
// 사용법:
//   node scripts/refreshSkillsJaFromGame8.mjs           # 조사만
//   node scripts/refreshSkillsJaFromGame8.mjs --write   # 검증 통과분만 저장

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const DB = path.join(ROOT, 'data/characterDatabase.json');
const MAPFILE = path.join(ROOT, 'data/game8PageMap.json');
const CACHE = path.join(os.tmpdir(), 'game8-cache');
const WRITE = process.argv.includes('--write');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

fs.mkdirSync(CACHE, { recursive: true });

function fetchPage(url) {
  const key = path.join(CACHE, url.replace(/[^0-9]/g, '') + '.html');
  if (fs.existsSync(key)) return fs.readFileSync(key, 'utf8');
  let html;
  try {
    html = execFileSync('curl', ['-sS', '--compressed', '-A', UA, '-L', '--max-time', '30', url],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
  html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]*>/g, '\n')
).split('\n').map((x) => x.trim()).filter(Boolean);

// スキル（이름） / バーストスキル（이름） 헤더로 스킬 3종을 잡는다.
// 通常攻撃(평타)은 헤더 형식이 달라 자연히 제외된다.
function extractSkills(html) {
  const lines = toLines(html);
  const heads = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(バーストスキル|スキル)（(.+)）$/);
    if (m) heads.push({ i, kind: m[1], name: m[2] });
  });
  // ⚠️ 버스트 헤더가 항상 'バーストスキル（…）'인 것은 아니다. 미ント·프리카·플로라·E.H. 등은
  //    **세 개 모두 'スキル（…）'** 로 적혀 있다. 종류로만 고르면 "버스트가 없다"고 판단해
  //    통째로 빠진다(2026-08-18에 21명이 그렇게 빠졌다).
  //    그래서 종류를 우선하되, 없으면 **나온 순서대로 앞 3개**를 스킬1/2/버스트로 본다.
  const normal = heads.filter((h) => h.kind === 'スキル');
  const burst = heads.filter((h) => h.kind === 'バーストスキル');
  let picked;
  if (normal.length >= 2 && burst.length >= 1) {
    picked = [normal[0], normal[1], burst[0]];
  } else if (heads.length >= 3) {
    picked = heads.slice(0, 3);
  } else {
    return null;
  }

  const out = [];
  for (const head of picked) {
    const next = heads.find((h) => h.i > head.i);
    let end = next ? next.i : lines.length;
    for (let i = head.i + 1; i < end; i++) {
      if (/のモーション動画$|^モーション動画$|^関連記事$/.test(lines[i])) { end = i; break; }
    }
    const seg = lines.slice(head.i, end);
    // 마지막 '効果' 이후의 '・' 줄만 설명이다(쿨타임 절의 '・40秒'을 걸러내려면 이렇게 해야 한다).
    let effIdx = -1;
    seg.forEach((l, i) => { if (l === '効果') effIdx = i; });
    if (effIdx < 0) return null;
    const desc = seg.slice(effIdx + 1)
      .filter((l) => l.startsWith('・'))
      .map((l) => l.replace(/^・/, ''))
      .join(' ').replace(/\s+/g, ' ').trim();
    if (!desc) return null;
    out.push({ name: head.name, desc });
  }
  return out;
}

// 숫자 대조 (한국어 수집기와 같은 규칙)
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

// 대상 지정 표현 — "누구에게 거는가". 숫자가 같아도 이게 다르면 다른 내용이다.
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

function verify(ja, c) {
  const problems = [];
  for (let i = 0; i < 3; i++) {
    const s = c.skills[i];
    const en = numsOf(s && s.desc);
    const jp = numsOf(ja[i].desc);
    const missing = [...en].filter((n) => !hasNear(jp, n));
    if (en.size && missing.length > Math.floor(en.size / 2)) {
      problems.push(`스킬${i + 1} 숫자 불일치: 영어 ${[...en].join('/')} vs 일본어 ${[...jp].join('/')}`);
      continue;   // 숫자가 어긋나면 다른 스킬을 본 것이라 대상 비교는 의미가 없다
    }
    if (s && s.desc_kr) {
      const kt = tagsOf(s.desc_kr, TARGET_KO);
      const jt = tagsOf(ja[i].desc, TARGET_JA);
      const diff = [...kt].filter((x) => !jt.has(x)).concat([...jt].filter((x) => !kt.has(x)));
      // 양쪽 다 값이 있는데 서로 다르면 모순이다. 한쪽만 있는 것은 표현 차이일 수 있어 넘긴다.
      if (kt.size && jt.size && diff.length) {
        problems.push(`스킬${i + 1} 대상 조건 모순: 한국어 ${[...kt].join(',')} vs 일본어 ${[...jt].join(',')}`);
      }
    }
  }
  return problems;
}

const raw = JSON.parse(fs.readFileSync(DB, 'utf8'));
const cdb = Array.isArray(raw) ? raw : raw.characters;
const pageMap = JSON.parse(fs.readFileSync(MAPFILE, 'utf8'));

const ok = []; const failed = [];
for (const c of cdb) {
  if (!c.name_ja || !(c.skills || []).length) { failed.push([c.id, 'name_ja 또는 스킬 없음']); continue; }
  const url = pageMap[c.name_ja];
  if (!url) { failed.push([c.id, `페이지 매핑 없음 (${c.name_ja})`]); continue; }
  const html = fetchPage(url);
  if (!html) { failed.push([c.id, '페이지 받기 실패']); continue; }
  const ja = extractSkills(html);
  if (!ja) { failed.push([c.id, '스킬 절 파싱 실패']); continue; }
  const problems = verify(ja, c);
  if (problems.length) { failed.push([c.id, problems.join(' | ')]); continue; }
  ok.push([c, ja]);
}

console.log(`검증 통과 ${ok.length}명 / 실패 ${failed.length}명 (전체 ${cdb.length})`);
if (failed.length) {
  const kinds = {};
  for (const [id, why] of failed) {
    const k = /대상 조건 모순/.test(why) ? '대상 조건 모순'
      : /숫자 불일치/.test(why) ? '숫자 불일치'
        : /매핑 없음/.test(why) ? '페이지 매핑 없음'
          : /파싱 실패/.test(why) ? '파싱 실패' : '기타';
    (kinds[k] = kinds[k] || []).push([id, why]);
  }
  console.log('\n■ 실패 내역 (저장하지 않음)');
  for (const [k, list] of Object.entries(kinds)) {
    console.log(`\n  [${k}] ${list.length}명`);
    list.slice(0, 8).forEach(([id, why]) => console.log(`     ${id.padEnd(28)} ${why.slice(0, 105)}`));
    if (list.length > 8) console.log(`     ... 외 ${list.length - 8}명`);
  }
}

if (!WRITE) { console.log('\n조사만 했습니다. 저장하려면 --write'); process.exit(0); }

for (const [c, ja] of ok) {
  c.skills.forEach((s, i) => { s.name_ja = ja[i].name; s.desc_ja = ja[i].desc; });
}
fs.writeFileSync(DB, JSON.stringify(raw, null, 2) + '\n');
console.log(`\n저장 완료 — ${ok.length}명의 desc_ja/name_ja`);
