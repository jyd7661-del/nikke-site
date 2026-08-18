// 스킬 설명의 **한국어 공식 문구**를 나무위키에서 가져온다.
//
// ■ 무엇을 가져오고 무엇을 가져오지 않는가 (2026-08-13 유저 결정)
//
//   가져오는 것: 게임 내 공식 스킬명과 효과 문구. 이건 위키 기여자가 쓴 글이 아니라
//                개발사(시프트업)의 텍스트를 위키가 옮겨 적어둔 것이다.
//   가져오지 않는 것: '평가'·'여담'·'대사' 등 **위키 기여자가 직접 쓴 서술**. 나무위키의
//                CC BY-NC-SA 2.0 KR이 덮는 게 이 부분이고, 우리는 광고를 달기 때문에
//                비영리 조건과 양립하지 않는다. extractSkills가 '평가'를 만나면 즉시 멈춘다.
//
// ■ 왜 이 스크립트를 믿을 수 있는가 — 숫자 대조
//
//   나무위키도 우리 영어 데이터(prydwen)와 같은 **레벨 10 기준**이다. 실측으로 확인했다:
//     헬름 3.08% / 1237.5%, 목단 3.51% / 14.7%, 라플라스 3.57% / 81.66% / 897.6%,
//     도로시 1.56초 / 216% — 전부 정확히 일치.
//   그래서 "영어 설명에 있는 숫자가 한국어 설명에도 전부 있는가"를 기계로 검사할 수 있다.
//   엉뚱한 문서를 긁거나(동명이인 문서) 파싱이 한 칸 밀리면 숫자가 어긋나므로 조용히
//   통과하지 못한다. 이 프로젝트에서 가장 위험한 게 '조용한 누락'이라 이 대조가 핵심이다.
//   **검증에 실패한 캐릭터는 저장하지 않는다.** 부분적으로 맞는 데이터보다 없는 게 낫다.
//
// 사용법:
//   node scripts/refreshSkillsKrFromNamu.mjs            # 조사만 (기본)
//   node scripts/refreshSkillsKrFromNamu.mjs --write    # 검증 통과분만 저장

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const DB = path.join(ROOT, 'data/characterDatabase.json');
const CACHE = path.join(os.tmpdir(), 'namu-cache');
const WRITE = process.argv.includes('--write');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// 나무위키 문서 제목이 우리 name_kr에서 기계적으로 안 나오는 경우만 여기 적는다.
// 근거 없이 추측해서 넣지 말 것 — 틀린 문서를 긁으면 숫자 대조에서 걸린다.
// 아래 값은 전부 실제로 열어보고 '스킬 1' 절이 있는 것을 확인한 제목이다.
const TITLE_OVERRIDE = {
  // 동명 문서가 없어 괄호 없는 제목을 쓴다
  soline: '솔린',
  // 알트는 콜론 앞뒤 공백이 나무위키 쪽과 다르다 ("이름: 알트" 아님, "이름 : 알트")
  'snow-white-innocent-days': '스노우 화이트 : 이노센트 데이즈',
  'quency-escape-queen': '퀀시 : 이스케이프 퀸',
  'guillotine-winter-slayer': '길로틴 : 윈터 슬레이어',
};

fs.mkdirSync(CACHE, { recursive: true });

function fetchNamu(title) {
  const key = path.join(CACHE, encodeURIComponent(title).slice(0, 120) + '.html');
  if (fs.existsSync(key)) return fs.readFileSync(key, 'utf8');
  let html;
  try {
    // ⚠️ node fetch는 이 사이트들에서 403이 난다(TLS 지문 차이). curl로 우회한다.
    //    prydwen 스크래퍼에서 이미 겪은 문제다.
    html = execFileSync('curl', ['-sS', '--compressed', '-A', UA, '-L', '--max-time', '30',
      'https://namu.wiki/w/' + encodeURIComponent(title)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
  if (!html || html.includes('해당 문서를 찾을 수 없습니다')) return null; // 소프트 404는 캐시하지 않는다
  fs.writeFileSync(key, html);
  return html;
}

const decode = (s) => s
  .replace(/&#91;/g, '[').replace(/&#93;/g, ']')
  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

// 버스트 슬롯 표기가 문서마다 다르다. 실측으로 확인한 변종:
//   '버스트 III'  (ASCII I 세 개)      — 다수
//   '버스트 Ⅲ'    (전각 로마숫자 U+2162) — 마나
//   '버스트 I|I'  (위키 표 구분자가 샘)  — 솔린
// 정규화하지 않으면 이 캐릭터들만 조용히 빠진다. 실제로 빠졌다(2026-08-13).
// ⚠️ '|'를 그냥 지우면 안 된다. 처음에 지웠다가 '버스트 I|I'가 '버스트 II'가 되어,
//    솔린 알트(실제 버스트 I)를 II로 읽고 "DB 3 vs 나무위키 II"라는 **가짜 충돌**을 만들었다.
//    '|'는 위키 표 구분자가 샌 것이므로 **앞부분만** 취한다: '버스트 I|I' → '버스트 I'.
// 실측으로 확인한 버스트 표기 변종 (2026-08-13, 2026-08-18):
//   '버스트 III'  ASCII 대문자 I ×3            — 다수
//   '버스트 Ⅲ'    전각 로마숫자 U+2162          — 마나
//   '버스트 lll'  **소문자 L** ×3 (U+6C)        — 그레이브·팬텀·퀀시·길로틴
//                 인포박스는 대문자 I인데 스킬 절만 소문자 l을 쓰는 문서가 많다
//   '버스트 I|I'  위키 표 구분자가 샘            — 솔린
//   '버스트 Λ'    그리스 대문자 람다 U+39B       — 레드 후드
//                 단계(Step 1/2/3) 어디서나 쓸 수 있는 유연 버스트의 특수 표기다
// 정규화하지 않으면 해당 캐릭터만 조용히 빠진다. 실제로 8명이 그렇게 빠져 있었다.
const normalizeLine = (l) => l
  .replace(/[Ⅰ-Ⅲ]/g, (ch) => 'I'.repeat(ch.charCodeAt(0) - 0x215f))
  // 버스트 표기 자리의 소문자 l 만 대문자 I 로 본다. 본문 전체를 치환하면 스킬 설명의
  // 영문 단어까지 망가진다.
  .replace(/^(버스트\s*)([lI]{1,3})$/, (_, head, body) => head + body.replace(/l/g, 'I'))
  // '버스트 I|I' (솔린) — 파이프를 **I로 읽는다**. 로마자 III의 가운데 획이 '|'로 들어간 오식이다.
  //
  // 2026-08-13에는 반대로 처리했다("앞부분만 취해 버스트 I"). 유저가 "솔린도 1버스트야"라고
  // 해서 그게 맞다고 봤는데, 그건 **알트(프로스트 티켓)** 이야기였다. 2026-08-18에 숫자로
  // 판별했다 — 이 문서의 스킬 절 숫자가 기본 솔린(버스트 3)의 영어 데이터와 7/7 전부 일치하고
  // 프로스트 티켓과는 6/9만 맞는다. 따라서 이 절은 기본 솔린이고 'I|I'는 III다.
  // 인포박스도 '버스트 III'이고 prydwen도 3이다.
  .replace(/^(버스트\s*)([I|]{2,4})$/, (_, head, body) => head + body.replace(/\|/g, 'I'))
  .trim();

// 레드 후드처럼 단계 유연 버스트는 로마숫자 대신 Λ로 적힌다. 슬롯 숫자를 못 읽으므로
// 버스트 대조를 건너뛰되, **그 사실을 기록해** 조용히 넘어가지 않게 한다.
const FLEX_BURST_MARK = 'Λ';

function toLines(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '\n');
  return decode(stripped).split('\n').map((x) => normalizeLine(x)).filter(Boolean);
}

// 스킬1 / 스킬2 / 버스트 세 블록을 **한 벌** 뽑는다. start는 '스킬 1'이 있는 줄 번호.
function extractSkillsAt(lines, start) {
  // ⚠️ 여기서 멈추는 것이 라이선스 경계다. '평가' 이후는 위키 기여자의 글이다.
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^(버스트 컷신|평가|대사|여담|둘러보기|기타)$/.test(lines[i])) { end = i; break; }
  }
  const seg = lines.slice(start, end);

  // ⚠️ 헤더를 그냥 전부 모아 순서대로 자르면 안 된다. 두 가지 함정이 있다:
  //    1) 인포박스에도 '버스트 III' 같은 줄이 있어서 스킬 절보다 **앞**에 나온다(마나: 277번 줄).
  //    2) 같은 헤더가 연달아 두 번 나오는 문서가 있다(크러스트: 396·397번 줄 둘 다 '버스트 II').
  //    그래서 "스킬 1 → 그 뒤 첫 스킬 2 → 그 뒤 첫 버스트" 순서로 하나씩 찾아 내려간다.
  // Λ(단계 유연 버스트, 레드 후드)도 버스트 헤더다. 숫자가 아니어서 슬롯 대조는 못 하지만
  // 헤더로 인식하지 못하면 그 캐릭터의 스킬을 통째로 못 가져온다.
  const isBurst = (l) => new RegExp('^버스트\\s*(I{1,3}|[123]|' + FLEX_BURST_MARK + ')$').test(l);
  const i1 = 0; // seg[0] === '스킬 1'
  const i2 = seg.findIndex((l, i) => i > i1 && l === '스킬 2');
  if (i2 < 0) return null;
  const i3 = seg.findIndex((l, i) => i > i2 && isBurst(l));
  if (i3 < 0) return null;
  // 중복 헤더는 건너뛴다
  let i3end = seg.length;
  const bounds = [[i1, i2], [i2, i3], [i3, i3end]];

  const out = [];
  for (const [a, b0] of bounds) {
    const b = seg.slice(a, b0);
    const slot = b[0];
    let j = 1;
    // 슬롯 다음의 메타 줄(패시브/액티브/재사용 시간/초/중복 헤더)을 건너뛰고 이름 줄을 찾는다
    while (j < b.length && (/^(패시브|액티브|재사용 시간|[\d.]+초)$/.test(b[j]) || isBurst(b[j]) || b[j] === slot)) j++;
    const name = b[j] || '';
    const desc = b.slice(j + 1).join(' ').replace(/\s+/g, ' ').trim();
    if (!name || !desc) return null;
    out.push({ slot, name, desc });
  }
  return out.length === 3 ? out : null;
}

// 한 문서에 **여러 캐릭터가 들어 있다.** 나무위키는 기본 캐릭터와 알트를 한 문서에서 다룬다.
// 실측: '솔린' 문서에는 '버스트 III'(기본 솔린)와 '버스트 I'(솔린 : 프로스트 티켓)가 둘 다 있다.
// 첫 번째 '스킬 1'만 보고 자르면 엉뚱한 캐릭터의 스킬을 가져오게 되고, 그게 실제로
// "솔린 버스트가 3인데 나무위키는 I"이라는 가짜 충돌을 만들어냈다(2026-08-13).
//
// 그래서 문서 안의 모든 '스킬 1' 위치에서 후보를 뽑고, **우리 영어 데이터의 숫자와 가장 잘
// 맞는 후보**를 고른다. 이미 신뢰하는 검증(숫자 대조)을 선택 기준으로 재사용하는 셈이라,
// 고른 결과가 곧 검증된 결과다.
// 2026-08-18 보강: 숫자 점수만으로 고르면 **버스트가 다른 절을 집는 일이 생긴다.**
//   솔린 문서에는 기본 솔린(버스트 III)과 솔린 : 프로스트 티켓(버스트 I)이 함께 있는데,
//   두 캐릭터의 스킬 수치가 겹치는 부분이 있어 점수가 비슷하게 나온다.
//   버스트는 우리가 이미 확실히 아는 값이므로, **버스트가 맞는 후보를 먼저 거른다.**
//   그러고도 남는 후보가 여럿이면 그때 숫자 점수로 고른다.
function extractSkillsBest(html, enSkills, burst) {
  const lines = toLines(html);
  const starts = [];
  lines.forEach((l, i) => { if (l === '스킬 1') starts.push(i); });
  if (!starts.length) return null;

  const roman = { I: 1, II: 2, III: 3 };
  const burstOf = (cand) => {
    const slot = cand[2].slot.replace(/^버스트\s*/, '');
    if (slot === FLEX_BURST_MARK) return null;   // 단계 유연 — 숫자가 없다
    return roman[slot] || Number(slot) || null;
  };

  const cands = starts.map((s) => extractSkillsAt(lines, s)).filter(Boolean);
  if (!cands.length) return null;

  // 버스트가 맞는 것(또는 유연 버스트라 판단 불가한 것)만 남긴다.
  const matching = cands.filter((c) => { const b = burstOf(c); return b === null || String(b) === String(burst); });
  const pool = matching.length ? matching : cands;

  let best = null; let bestScore = -1;
  for (const cand of pool) {
    let hit = 0; let total = 0;
    for (let i = 0; i < 3; i++) {
      const en = numsOf(enSkills[i]?.desc);
      const kr = numsOf(cand[i].desc);
      total += en.size;
      for (const n of en) if (hasNear(kr, n)) hit++;
    }
    const score = total ? hit / total : 0;
    if (score > bestScore) { bestScore = score; best = cand; }
  }
  return best;
}

// 숫자 대조 — 영어 설명의 숫자가 한국어 설명에 전부 있는가.
// 천단위 콤마·후행 0 차이를 없애려고 Number로 정규화한다.
const numsOf = (s) => new Set(
  (String(s).match(/\d[\d,]*\.?\d*/g) || [])
    .map((n) => Number(n.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
);

// 상대오차 0.5% 안이면 같은 값으로 본다.
// 헬름 : 아쿠아마린 3번 스킬이 영어 164.73 / 한국어 164.83으로 한 자리 달랐다. 어느 한쪽의
// 오타이고 값 자체는 같은 것이라 유저가 "비슷하니까 무시하자"고 판단했다(2026-08-13).
// 진짜로 다른 값(홍련 : 흑영 250.47 vs 283.03 = 13% 차이)은 이 폭에 절대 들어오지 않으므로
// 검사가 무뎌지지 않는다.
const NEAR = 0.005;
const hasNear = (set, n) => {
  for (const m of set) {
    if (m === n) return true;
    const scale = Math.max(Math.abs(m), Math.abs(n));
    if (scale > 0 && Math.abs(m - n) / scale <= NEAR) return true;
  }
  return false;
};

function verify(krSkills, enSkills, burst) {
  const problems = [];
  const skippedBurstCheck = [];
  // 버스트 단계 대조 — 슬롯 문자열의 로마숫자를 숫자로
  const roman = { I: 1, II: 2, III: 3 };
  const slot = krSkills[2].slot.replace(/^버스트\s*/, '');
  if (slot === FLEX_BURST_MARK) {
    // 단계 유연 버스트는 슬롯 숫자가 없다. 대조를 건너뛰되 **건너뛰었다는 사실을 남긴다** —
    // 조용히 통과시키면 나중에 "이 캐릭터는 버스트를 확인했다"고 잘못 믿게 된다.
    skippedBurstCheck.push(`${burst}단계로 기록된 캐릭터 — 나무위키 표기가 Λ(단계 유연)라 버스트 대조 생략`);
  } else {
    const krBurst = roman[slot] || Number(slot);
    if (krBurst && String(krBurst) !== String(burst)) {
      problems.push(`버스트 불일치: DB ${burst} vs 나무위키 ${krSkills[2].slot}`);
    }
  }
  for (let i = 0; i < 3; i++) {
    const en = numsOf(enSkills[i]?.desc);
    const kr = numsOf(krSkills[i].desc);
    const missing = [...en].filter((n) => !hasNear(kr, n));
    // 영어에만 있는 숫자가 절반 넘게 빠지면 다른 스킬을 본 것이다.
    if (en.size && missing.length > Math.floor(en.size / 2)) {
      problems.push(`스킬${i + 1} 숫자 불일치: 영어 ${[...en].join('/')} vs 한국어 ${[...kr].join('/')}`);
    }
  }
  if (skippedBurstCheck.length) skipped.push(...skippedBurstCheck);
  return problems;
}

const raw = JSON.parse(fs.readFileSync(DB, 'utf8'));
const cdb = Array.isArray(raw) ? raw : raw.characters;

const ok = []; const failed = []; const skipped = [];
for (const c of cdb) {
  if (!c.name_kr || !(c.skills || []).length) { failed.push([c.id, '데이터 없음']); continue; }
  const titles = TITLE_OVERRIDE[c.id]
    ? [TITLE_OVERRIDE[c.id]]
    : [`${c.name_kr}(승리의 여신: 니케)`, c.name_kr];
  let kr = null; let used = '';
  for (const t of titles) {
    const html = fetchNamu(t);
    if (!html) continue;
    const s = extractSkillsBest(html, c.skills, c.burst);
    if (s) { kr = s; used = t; break; }
  }
  if (!kr) { failed.push([c.id, '문서/스킬 절 못 찾음']); continue; }
  const problems = verify(kr, c.skills, c.burst);
  if (problems.length) { failed.push([c.id, problems.join(' | ')]); continue; }
  ok.push([c, kr, used]);
}

console.log(`검증 통과 ${ok.length}명 / 실패 ${failed.length}명 (전체 ${cdb.length})`);
if (failed.length) {
  console.log('\n■ 실패 목록 (저장하지 않음)');
  for (const [id, why] of failed.slice(0, 40)) console.log(`   ${id.padEnd(30)} ${why.slice(0, 120)}`);
  if (failed.length > 40) console.log(`   ... 외 ${failed.length - 40}명`);
}

if (!WRITE) {
  console.log('\n조사만 했습니다. 저장하려면 --write');
  process.exit(0);
}

for (const [c, kr] of ok) {
  c.skills.forEach((s, i) => {
    s.name_kr = kr[i].name;
    s.desc_kr = kr[i].desc;
  });
}
const meta = Array.isArray(raw) ? null : raw;
if (meta) {
  meta.dataFreshness = meta.dataFreshness || {};
}
fs.writeFileSync(DB, JSON.stringify(raw, null, 2) + '\n');
console.log(`\n저장 완료 — ${ok.length}명의 desc_kr/name_kr`);
