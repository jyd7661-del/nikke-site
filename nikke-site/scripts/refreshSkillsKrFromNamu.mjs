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
const normalizeLine = (l) => l
  .replace(/[Ⅰ-Ⅲ]/g, (ch) => 'I'.repeat(ch.charCodeAt(0) - 0x215f))
  .replace(/\|/g, '')
  .trim();

function toLines(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '\n');
  return decode(stripped).split('\n').map((x) => normalizeLine(x)).filter(Boolean);
}

// 스킬1 / 스킬2 / 버스트 세 블록만 뽑는다.
function extractSkills(html) {
  const lines = toLines(html);
  const start = lines.findIndex((l) => l === '스킬 1');
  if (start < 0) return null;
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
  const isBurst = (l) => /^버스트\s*(I{1,3}|[123])$/.test(l);
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

// 숫자 대조 — 영어 설명의 숫자가 한국어 설명에 전부 있는가.
// 천단위 콤마·후행 0 차이를 없애려고 Number로 정규화한다.
const numsOf = (s) => new Set(
  (String(s).match(/\d[\d,]*\.?\d*/g) || [])
    .map((n) => Number(n.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
    .map((n) => String(n))
);

function verify(krSkills, enSkills, burst) {
  const problems = [];
  // 버스트 단계 대조 — 슬롯 문자열의 로마숫자를 숫자로
  const roman = { I: 1, II: 2, III: 3 };
  const slot = krSkills[2].slot.replace(/^버스트\s*/, '');
  const krBurst = roman[slot] || Number(slot);
  if (krBurst && String(krBurst) !== String(burst)) {
    problems.push(`버스트 불일치: DB ${burst} vs 나무위키 ${krSkills[2].slot}`);
  }
  for (let i = 0; i < 3; i++) {
    const en = numsOf(enSkills[i]?.desc);
    const kr = numsOf(krSkills[i].desc);
    const missing = [...en].filter((n) => !kr.has(n));
    // 영어에만 있는 숫자가 절반 넘게 빠지면 다른 스킬을 본 것이다.
    if (en.size && missing.length > Math.floor(en.size / 2)) {
      problems.push(`스킬${i + 1} 숫자 불일치: 영어 ${[...en].join('/')} vs 한국어 ${[...kr].join('/')}`);
    }
  }
  return problems;
}

const raw = JSON.parse(fs.readFileSync(DB, 'utf8'));
const cdb = Array.isArray(raw) ? raw : raw.characters;

const ok = []; const failed = [];
for (const c of cdb) {
  if (!c.name_kr || !(c.skills || []).length) { failed.push([c.id, '데이터 없음']); continue; }
  const titles = TITLE_OVERRIDE[c.id]
    ? [TITLE_OVERRIDE[c.id]]
    : [`${c.name_kr}(승리의 여신: 니케)`, c.name_kr];
  let kr = null; let used = '';
  for (const t of titles) {
    const html = fetchNamu(t);
    if (!html) continue;
    const s = extractSkills(html);
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
