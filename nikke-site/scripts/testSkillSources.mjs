/**
 * 스킬 원문 3개 국어 교차 검증 — `desc` / `desc_kr` / `desc_ja` (2026-09-07)
 *
 * ■ 왜 만들었나
 *   이 프로젝트가 값을 확정해 온 방식은 **"서로 다른 출처가 맞아떨어지는가"**였다.
 *   무기 6초 상수(장탄수는 Fandom, 연사속도는 아카라이브)도, 풀차지 배율 250%(위키 원문과
 *   아카라이브 역산)도 그렇게 확정했다.
 *
 *   그런데 스킬 원문에는 그 수단이 **이미 있었는데 안 쓰고 있었다.** 594개 스킬 중 582개가
 *   영어·한국어·일본어를 모두 갖고 있다(98%). 수집기와 도감 화면만 이 값을 쓰고,
 *   분석 쪽(analyzeSkillTriggers · simulateTeams · synergyEngine)은 전부 영문만 읽는다.
 *
 *   그리고 영문은 실제로 틀린다. 유저 지적("엠마는 같은 스쿼드에만 적용된다")에서 출발한
 *   조사 중에 발견한 것: 어느 스킬은 EN이 `1 ally unit(s) with the highest HP`인데
 *   KR은 `공격력이 가장 높은 아군 1기`, JA는 `攻撃力が最も高い味方1機`로 **2:1로 영문이
 *   오역**이다.
 *
 * ■ 무엇을 보나 — **숫자 다중집합만** 본다
 *   판정 조건을 셋 다 만족할 때만 불일치로 센다:
 *     ① 세 언어의 숫자 **개수가 같다**  (다르면 어순·표기 차이일 수 있다)
 *     ② KR과 JA가 **서로 일치**한다     (2:1이 성립해야 영문 쪽을 의심할 수 있다)
 *     ③ EN만 값이 다르다
 *   이렇게 좁히면 실측 11건이 나왔고 오탐이 없었다(전부 자릿수 오타 수준). 2026-09-07에
 *   전부 고쳐 지금은 0이다 — 그래서 **하나라도 생기면 실패**한다.
 *
 *   ⚠️ **화살표(▲▼) 방향은 검사하지 않는다.** 재봤더니 582개 중 56건이 어긋나는데
 *      대부분(38건)이 KR≠JA다 — 일본어가 `▲` 대신 `増加`로 쓰는 표기 차이다.
 *      **오탐이 나는 검사는 아무도 믿지 않는다**(원칙 4). 숫자만 본다.
 *
 * ■ 판정 단위 = 고장의 단위
 *   고장은 "스킬 하나의 숫자 하나가 틀린 것"이다. 그래서 스킬×숫자 단위로 세고,
 *   **그 숫자가 우리 계산에 실제로 들어가는지**를 따로 표시한다 — 안 들어가는 오타는
 *   고쳐도 점수가 안 변하고, 들어가는 오타는 조용히 점수를 틀리게 만든다(원칙 3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const CHARS = Array.isArray(cdb) ? cdb : cdb.characters;

// 기준선 — 늘면 실패한다. 데이터를 고쳐 줄었으면 이 값을 함께 낮춘다(검사가 알려준다).
// 2026-09-07에 11건을 KR·JA 다수결로 고쳐 0이 됐다(유저 승인). 이제 **0이 기준선**이라
// 하나라도 생기면 실패한다 — prydwen 수집기가 영문 오타를 다시 들여오면 여기서 걸린다.
const EXPECTED_MISMATCH = 0;
// 세 언어를 다 가진 스킬 수. 줄면 수집기가 깨진 것이다.
const EXPECTED_TRILINGUAL = 582;

// 우리가 실제로 소비하는 숫자인가 — simulateTeams의 버프 통·자체 계수와 같은 모양
const CONSUMED = /(?:ATK|Critical (?:Rate|Damage)|Attack Damage|Charge Damage|Pierce Damage)\s*▲|% of final ATK/i;

const nums = (t) => ((t || '').match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
const eq = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.005);

const problems = [];
let trilingual = 0;
const mismatches = [];

CHARS.forEach((c) => (c.skills || []).forEach((s, i) => {
  if (!(s.desc && s.desc_kr && s.desc_ja)) return;
  trilingual += 1;
  const e = nums(s.desc);
  const k = nums(s.desc_kr);
  const j = nums(s.desc_ja);
  if (e.length !== k.length || k.length !== j.length) return;   // ① 개수가 다르면 제외
  if (!eq(k, j)) return;                                        // ② KR·JA가 갈리면 제외
  if (eq(e, k)) return;                                         // 일치하면 정상
  e.forEach((v, x) => {
    if (Math.abs(v - k[x]) < 0.005) return;
    // 그 숫자가 들어 있는 문장을 뽑아 소비 여부를 본다
    const seg = ((s.desc.match(new RegExp(`[^.]*${String(v).replace('.', '\\.')}[^.]*`)) || [''])[0]).trim();
    mismatches.push({
      who: `${c.name_kr || c.title} S${i + 1}`, en: v, krja: k[x],
      consumed: CONSUMED.test(seg), seg: seg.slice(0, 72),
    });
  });
}));

if (trilingual < EXPECTED_TRILINGUAL) {
  problems.push(`세 언어를 다 가진 스킬이 ${EXPECTED_TRILINGUAL} → ${trilingual}로 줄었다 — 수집기(refreshSkillsKrFromNamu / refreshSkillsJaFromGame8)를 확인할 것`);
}
if (mismatches.length > EXPECTED_MISMATCH) {
  problems.push(`영문 숫자 불일치가 기준선 ${EXPECTED_MISMATCH} → ${mismatches.length}로 늘었다 — 새로 수집한 원문에 오타가 들어왔을 수 있다`);
}

// ---------------------------------------------------------------------------
// **지속시간 표기 오타 검사.** (2026-09-08)
//
// 위 숫자 대조는 `nums()`가 **숫자만** 뽑기 때문에 `for IO sec`(10을 대문자 I·O로 적은 것)이나
// `far 10 sec`(for 오타)를 못 잡는다. 숫자가 아예 숫자로 안 적혔거나 전치사가 틀린 경우다.
// 조합 비교기가 지속시간을 `for N sec`로만 읽으므로 이런 오타는 **그 절의 가동률을 조용히
// 1.0(상시)으로 만든다** — 이 프로젝트가 가장 경계하는 형태다(원칙 3).
//
// 실측으로 6건이 나왔고 전부 KR·JA 2:1로 확정해 고쳤다(2026-09-08):
//   K       `for IO sec` · `far 10 sec`  → KR `[10초 유지]` ×2 · JA `「10秒間維持」` ×2
//   그레이브(2) · 라푼젤 : 퓨어 그레이스 · 브래디  `every I sec` → KR `[1초 간격]`
//
// ⚠️ `every sec`(카츠라기 미사토 · 길로틴 : 윈터 슬레이어)는 **고치지 않았다.** KR은
//    `[1초 간격]`이지만 영어로 "every sec"는 그 자체로 말이 되므로 오타로 단정할 수 없다.
//    허용어로 두고 넘어간다 — 오탐이 나는 검사는 아무도 믿지 않는다(원칙 4).
const DUR_TYPO = /(?<![\d.])\b([A-Za-z]+)\s+sec\b/g;
const DUR_TYPO_OK = new Set(['every']);
const EXPECTED_DUR_TYPO = 0;

// 두 번째 규칙 — `far 10 sec`처럼 **숫자는 멀쩡한데 앞의 낱말이 틀린** 경우.
// 위 규칙은 sec 바로 앞이 낱말일 때만 걸리므로 이건 못 잡는다(역테스트에서 실제로 놓쳤다).
// 원문 전체에서 `<낱말> N sec` 꼴을 훑어 **실제로 쓰이는 낱말 목록**에 없는 것을 잡는다.
// 목록은 실측으로 만들었다 — 새 캐릭터가 새 낱말을 들고 오면 검사가 알려주고 사람이 추가한다.
const DUR_PREP = /\b([A-Za-z]+)\s+\d+(?:\.\d+)?\s*sec\b/g;
const DUR_PREP_OK = new Set(['for', 'every', 'within', 'of', 'in', 'at', 'after', 'over', 'than',
  'and', 'to', 'or', 'lasts', 'last', 'remaining', 'sec']);

const durTypos = [];
CHARS.forEach((c) => (c.skills || []).forEach((sk, i) => {
  const d = sk.desc || '';
  let m; DUR_TYPO.lastIndex = 0;
  let p2; DUR_PREP.lastIndex = 0;
  while ((p2 = DUR_PREP.exec(d))) {
    if (DUR_PREP_OK.has(p2[1].toLowerCase())) continue;
    durTypos.push({ who: `${c.name_kr || c.title} s${i + 1}`, seg: d.slice(Math.max(0, p2.index - 30), p2.index + 18).trim() });
  }
  while ((m = DUR_TYPO.exec(d))) {
    if (DUR_TYPO_OK.has(m[1].toLowerCase())) continue;
    durTypos.push({ who: `${c.name_kr || c.title} s${i + 1}`, seg: d.slice(Math.max(0, m.index - 35), m.index + 12).trim() });
  }
}));
if (durTypos.length > EXPECTED_DUR_TYPO) {
  problems.push(`지속시간 표기 오타가 기준선 ${EXPECTED_DUR_TYPO} → ${durTypos.length}건으로 늘었다`
    + ' — `for N sec`로 안 읽히면 그 절의 가동률이 조용히 1.0이 된다');
  durTypos.forEach((t) => problems.push(`   ${t.who}: "${t.seg}"`));
}

const line = '─'.repeat(84);
console.log(line);
console.log(`스킬 원문 3개 국어 교차 검증 — 세 언어 보유 ${trilingual}개 · 숫자 불일치 ${mismatches.length}건 (기준선 ${EXPECTED_MISMATCH})`);
console.log(`   지속시간 표기 오타 ${durTypos.length}건 (기준선 ${EXPECTED_DUR_TYPO})`);
console.log(line);

const consumed = mismatches.filter((m) => m.consumed);
if (mismatches.length) {
  console.log(`KR·JA가 일치하는데 EN만 다른 값 — **2:1로 영문이 틀렸을 가능성이 높다**`);
  mismatches.forEach((m) => {
    console.log(`  ${m.consumed ? '🔴' : '  '} ${m.who.padEnd(22)} EN ${m.en} → ${m.krja}   ${m.seg}`);
  });
  console.log('');
  console.log(`  🔴 = 이 숫자가 조합 비교기 계산에 **실제로 들어간다** (${consumed.length}건). 나머지는 점수와 무관하다.`);
  console.log('  ※ 고칠지는 사람이 정한다 — 세 전사본 중 다수를 따르는 것도 판단이므로 자동 반영하지 않는다(B등급).');
}

if (mismatches.length < EXPECTED_MISMATCH) {
  console.log(`\n✅ 불일치가 ${EXPECTED_MISMATCH} → ${mismatches.length}로 줄었다. EXPECTED_MISMATCH를 ${mismatches.length}로 낮출 것.`);
}
console.log(line);

if (problems.length) {
  console.log(`\n문제 ${problems.length}건\n`);
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log('');
  process.exit(1);
}
console.log('문제 0건\n');
