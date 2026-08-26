/**
 * 화면에 나가는 **데이터**가 사이트 언어와 맞는가. (2026-08-25)
 *
 * ■ testI18n.mjs와 무엇이 다른가
 *   testI18n은 `lib/i18n.js`의 **UI 라벨**만 본다. 그런데 유저가 실제로 본 것은
 *   "한국어 화면인데 조합 이름·설명이 영어"였다 — 라벨은 멀쩡했고 **데이터**가 영어였다.
 *   라벨 검사가 24건 전부 통과하는 동안 아무도 몰랐다. 검사의 판정 단위가 고장의 단위와
 *   달랐던 것이다(CLAUDE.md 설계 원칙 4).
 *
 * ■ 어쩌다 이렇게 됐나
 *   prydwen에서 가져온 조합은 **원문이 영어**다. 번역 작업이 `ko -> en/ja` 방향이라
 *   en은 원문 그대로 100%, ja는 번역해서 100%가 됐는데 **ko 칸에는 영어가 그대로 남았다.**
 *   기본 언어이자 주 사용자층인 한국어가 가장 안 된 상태였다.
 *
 * ■ 판정 규칙 — 오탐을 내지 않는 것이 먼저다
 *   "그 언어의 글자가 **하나라도** 있는가"만 본다. 비율로 재면 고유명사가 긴 항목
 *   (`Blaze-ing Through Campaign ft. Rapi (라피 캠페인 조합)`)이 전부 걸려서 아무도 안 믿게 된다.
 *
 *   ⚠️ 일본어를 **가나로만** 판정하면 안 된다. 실측에서 42건이 오탐으로 걸렸는데
 *      전부 괄호 안 설명이 한자뿐이었다(`神編成`·`貫通天国`·`夏至`). 가나 또는 한자로 본다.
 *
 * ■ 래칫(ratchet)
 *   남은 backlog가 커서 전부 ERROR로 세우면 검사가 늘 빨간불이라 아무 작업도 푸시할 수 없다.
 *   그래서 **EXPECTED보다 늘어나면 ERROR**(퇴행), 줄어들면 "숫자를 낮춰라"라고 알린다.
 *   이 숫자는 **줄어들기만 해야 한다.**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const HAS_KO = (s) => /[가-힣]/.test(s || '');
// 가나 또는 한자. 한자만으로 된 일본어 표기가 실제로 많다(神編成 등).
const HAS_JA = (s) => /[ぁ-んァ-ヶ一-龯]/.test(s || '');
// 영어 칸에 들어가면 안 되는 것: 한글, 그리고 가나(한자는 영어 문장에도 안 나오지만
// 일본어 고유명사 인용이 있을 수 있어 가나만 본다).
const HAS_CJK_KANA = (s) => /[가-힣ぁ-んァ-ヶ]/.test(s || '');
const nz = (s) => typeof s === 'string' && s.trim().length > 0;

// ---------------------------------------------------------------------------
// 남아 있는 backlog. **줄어들기만 해야 한다.**
// 2026-08-25 최초 측정값에서 시작한다.
// ---------------------------------------------------------------------------
const EXPECTED = {
  'archetype.name(ko)': 0,     // 2026-08-25에 466건을 한국어로 옮겨 0이 됐다
  'archetype.note(ko)': 203,   // 설명이 통째로 영어
  'skill.desc_kr': 6,          // 나무위키가 막은 캐릭터. idoll-flower는 "채우지 않기로" 결정된 건이다
  'skill.desc_ja': 9,          // game8이 아직 안 채운 페이지 (yukiko 등)
  'squad(번역 없음)': 62,        // 부대 이름. 지어내면 B등급이라 1차 출처에서 옮겨와야 한다
  'raidBoss(번역 없음)': 5,      // 솔로레이드 보스명. 위와 같은 이유
};

const errors = [];
const backlog = {};
const err = (code, msg) => errors.push(`[${code}] ${msg}`);
const mark = (key, id) => { (backlog[key] = backlog[key] || []).push(id); };

// ---------------------------------------------------------------------------
// 1. 아키타입 (data/synergyNotes.json) — 도감 "등장 조합"과 AI 설명이 쓴다
// ---------------------------------------------------------------------------
const syn = read('synergyNotes.json').archetypes || [];
syn.forEach((a) => {
  const who = a.id || '(id 없음)';
  ['name', 'note'].forEach((f) => {
    if (nz(a[f]) && !HAS_KO(a[f])) mark(`archetype.${f}(ko)`, who);
    // _ja / _en 은 backlog가 아니라 **이미 다 된 것**이라 곧바로 ERROR다.
    if (nz(a[`${f}_ja`]) && !HAS_JA(a[`${f}_ja`])) {
      err('DATA_JA_NOT_JA', `아키타입 '${who}'의 ${f}_ja에 일본어가 없다 — 일본어 화면에 다른 언어가 그대로 나간다`);
    }
    if (nz(a[`${f}_en`]) && HAS_CJK_KANA(a[`${f}_en`])) {
      err('DATA_EN_NOT_EN', `아키타입 '${who}'의 ${f}_en에 한글/가나가 섞여 있다`);
    }
    // 번역 칸이 아예 비어 있으면 화면이 한국어로 폴백한다 — 그건 누락이다.
    ['_en', '_ja'].forEach((sfx) => {
      if (nz(a[f]) && !nz(a[`${f}${sfx}`])) {
        err('DATA_TRANSLATION_MISSING', `아키타입 '${who}'의 ${f}${sfx}가 비었다 — 그 언어 화면이 한국어로 폴백한다`);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 2. 투자·운용 노트 (data/characterInvestmentNotes.json) — 도감 "투자 · 운용"
// ---------------------------------------------------------------------------
const INV_FIELDS = ['treasureNote', 'investmentProfile', 'skillPriority', 'overloadPriority', 'notes'];
(read('characterInvestmentNotes.json').characters || []).forEach((n) => {
  const who = n.name || '(이름 없음)';
  INV_FIELDS.forEach((f) => {
    if (!nz(n[f])) return;
    if (!HAS_KO(n[f])) mark('investment.ko', `${who}/${f}`);
    if (nz(n[`${f}_ja`]) && !HAS_JA(n[`${f}_ja`])) {
      err('DATA_JA_NOT_JA', `투자노트 '${who}'의 ${f}_ja에 일본어가 없다`);
    }
    if (nz(n[`${f}_en`]) && HAS_CJK_KANA(n[`${f}_en`])) {
      err('DATA_EN_NOT_EN', `투자노트 '${who}'의 ${f}_en에 한글/가나가 섞여 있다`);
    }
    ['_en', '_ja'].forEach((sfx) => {
      if (!nz(n[`${f}${sfx}`])) {
        err('DATA_TRANSLATION_MISSING', `투자노트 '${who}'의 ${f}${sfx}가 비었다 — 그 언어 화면이 한국어로 폴백한다`);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 3. 스킬 (data/characterDatabase.json) — 도감 "스킬"
//    원문이 영어(prydwen)이므로 ko/ja가 없으면 영어로 폴백한다. 폴백은 설계이지만
//    **몇 건인지는 눈에 보여야 한다** — 조용히 늘어나는 것을 막는다.
// ---------------------------------------------------------------------------
const db = read('characterDatabase.json');
db.forEach((c) => {
  (c.skills || []).forEach((s, i) => {
    const who = `${c.id}#${i + 1}`;
    if (!nz(s.desc_kr) || !HAS_KO(s.desc_kr)) mark('skill.desc_kr', who);
    if (!nz(s.desc_ja) || !HAS_JA(s.desc_ja)) mark('skill.desc_ja', who);
  });
});

// ---------------------------------------------------------------------------
// 4. 화면에 그대로 나가는데 번역이 아예 없는 값
//    (지어내면 B등급이라 여기서는 **세기만** 한다 — 값은 1차 출처에서 옮겨와야 한다)
// ---------------------------------------------------------------------------
const squads = [...new Set(db.map((c) => c.squad).filter(nz))];
squads.filter((s) => !HAS_KO(s)).forEach((s) => mark('squad(번역 없음)', s));
const bosses = [...new Set((read('soloRaidTeams.json').seasons || []).map((s) => s.boss).filter(nz))];
bosses.filter((b) => !HAS_KO(b)).forEach((b) => mark('raidBoss(번역 없음)', b));

// ---------------------------------------------------------------------------
// 판정
// ---------------------------------------------------------------------------
const line = '─'.repeat(72);
console.log(line);
console.log('데이터 다국어 검사 — 화면에 나가는 값이 사이트 언어와 맞는가');
console.log(line);

const keys = [...new Set([...Object.keys(EXPECTED), ...Object.keys(backlog)])].sort();
let regressed = 0;
let improved = 0;
keys.forEach((k) => {
  const now = (backlog[k] || []).length;
  const was = EXPECTED[k] ?? 0;
  let flag = '  ';
  if (now > was) { flag = '❌'; regressed += 1; }
  else if (now < was) { flag = '⬇️'; improved += 1; }
  console.log(`${flag} ${k.padEnd(26)} 남음 ${String(now).padStart(4)}   (기준 ${was})`);
  if (now > was) {
    err('DATA_I18N_REGRESSION',
      `${k}: 미번역이 ${was}건에서 ${now}건으로 **늘었다**. 새로 넣은 데이터에 번역을 빠뜨렸다 — ` +
      `예: ${(backlog[k] || []).slice(0, 3).join(', ')}`);
  }
});

console.log(line);
if (errors.length) {
  console.log(`❌ ERROR ${errors.length}건`);
  errors.slice(0, 20).forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
  if (errors.length > 20) console.log(`   … 외 ${errors.length - 20}건`);
  process.exitCode = 1;
} else if (improved) {
  console.log(`✅ 퇴행 없음. ${improved}개 항목이 기준보다 줄었다 — scripts/testDataI18n.mjs의 EXPECTED를 낮출 것.`);
} else {
  console.log('✅ 퇴행 없음.');
}
console.log(line);
