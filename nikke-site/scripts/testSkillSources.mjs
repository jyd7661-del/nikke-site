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

const line = '─'.repeat(84);
console.log(line);
console.log(`스킬 원문 3개 국어 교차 검증 — 세 언어 보유 ${trilingual}개 · 숫자 불일치 ${mismatches.length}건 (기준선 ${EXPECTED_MISMATCH})`);
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
