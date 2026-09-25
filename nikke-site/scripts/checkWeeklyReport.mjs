// 주간 조사 예약 작업이 (1) 돌긴 했는지 (2) 결과를 사람이 처리했는지 알려준다.
//
// ■ 왜 필요한가 — 지금은 아무도 모르는 채로 지나간다 (2026-08-14 점검)
//
//   (2026-08-14 당시) 예약 작업 `nikke-site-data-research`는 **Cowork(claude.ai)에서** 돌았다 —
//   그 작업이 돌았는지 실패했는지 클로드 코드에서는 볼 방법이 없었다.
//   2026-09-24부터는 미니 PC WSL cron이 코드 점검·AI 조사 두 실행기를 돌린다(아래 KINDS).
//   작업은 공유 폴더를 통해 이 저장소의 파일을 고치고 reports/에 보고서를 남기며,
//   **커밋은 하지 않는다**(사람이 diff를 보고 커밋하는 설계).
//
//   그런데 그걸 알아챌 경로가 없었다:
//     - CLAUDE.md의 세션 시작 체크리스트는 검사 스크립트 6종뿐. reports/ 이야기가 없다
//     - 유일한 흔적인 '미커밋 변경'은 CLAUDE.md가 "git status에 41개가 뜨는데 30개는 줄바꿈
//       차이"라고 적어둬서 **무시하도록 학습된** 신호다
//     - 실제로 새어나갔다: reports/2026-08-07.md 와 2026-08-10.md 가 둘 다 무관한 커밋
//       e2ccf26('니케 이름을 선택 언어로 표시')에 섞여 들어갔다. 검토하고 커밋한 게 아니라
//       쓸어담긴 것이다. 2026-08-10 보고서의 판단 대기 5건은 지금도 열려 있다
//     - 그리고 **작업이 조용히 멈춰도 아무도 모른다.** 보고서가 안 생기는 건 '아무 일도 안
//       일어난 것'과 구분되지 않는다
//
// ■ 판정
//
//   `reports/reviewed.json`에 처리 끝난 회차를 적는다. 거기 없는 보고서는 미처리로 뜬다.
//   그리고 마지막 보고서가 STALE_DAYS를 넘으면 작업이 멈췄을 가능성을 알린다.
//
//   ⚠️ 이 검사는 **항상 exit 0**이다. 여기서 걸리는 건 코드 결함이 아니라 운영 신호이고,
//      예약 작업이 늦었다고 무관한 코드 푸시를 막으면 안 되기 때문이다. checkData의
//      WARN 3과 같은 성격이다 — 막지는 않되 세션 시작 화면에 반드시 보이게 한다.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DIR = path.join(ROOT, 'reports');
const MARKER = path.join(DIR, 'reviewed.json');
// 매주 월요일이므로 7일이 정상. 실행이 늦거나 하루 밀리는 것까지 감안해 9일로 둔다.
const STALE_DAYS = 9;

if (!fs.existsSync(DIR)) {
  console.log('주간 보고서 — reports/ 폴더가 없습니다. 예약 작업 설정을 확인하세요.');
  process.exit(0);
}

// 보고서가 두 종류이고 **실행기도 둘이다.** 따로 세야 한다.
//   `YYYY-MM-DD-auto.md`  scripts/weekly-check.sh(월 10:00) → weeklyCheck.mjs. 코드만, 데이터를 안 고친다
//   `YYYY-MM-DD.md`       scripts/weekly-research.sh(월 10:30) → 클로드 코드 무인 실행. 데이터를 고치고 커밋은 안 한다
//
// ⚠️ 2026-09-24까지는 둘을 한 목록으로 셌다. 그래서 **AI 조사가 08-10 이후 5주간 결과를 안 남겼는데
//    "마지막 보고서 3일 전"으로 멀쩡해 보였다** — 코드 점검 `-auto`가 매주 그 자리를 채웠기 때문이다.
//    (그 전엔 반대로 `-auto`를 안 세서 "안 돈다"고 나온 적도 있다. 2026-08-18)
//    감지기가 보는 단위와 고장의 단위(실행기)가 달랐다 — 설계 원칙 4.
const all = fs.readdirSync(DIR)
  .filter((f) => /^\d{4}-\d{2}-\d{2}(-auto)?\.md$/.test(f))
  .map((f) => f.slice(0, -3))
  .sort();
const KINDS = [
  { key: 'auto', label: '코드 점검(weekly-check.sh, 월 10:00)', log: '~/nikke-weekly.log', stems: all.filter((s) => s.endsWith('-auto')) },
  { key: 'ai', label: 'AI 조사(weekly-research.sh, 월 10:30)', log: '~/nikke-research.log', stems: all.filter((s) => !s.endsWith('-auto')) },
];

// reviewed.json: 날짜만 적으면(예전 방식) 그 날짜의 두 보고서를 모두 처리한 것으로 본다.
// 하나만 처리했으면 파일 이름 그대로(`2026-09-28-auto`) 적는다.
const reviewed = fs.existsSync(MARKER)
  ? (JSON.parse(fs.readFileSync(MARKER, 'utf8')).reviewed || [])
  : [];
const isReviewed = (stem) => reviewed.includes(stem) || reviewed.includes(stem.slice(0, 10));

// ⚠️ 보고서 날짜를 UTC 자정으로 파싱하면 안 된다. 파일명은 **로컬 날짜**로 붙는데
//    (weeklyCheck.mjs 참고) 여기서 UTC로 재면 한국 기준 최대 9시간이 어긋나 경과일이
//    하루 밀린다. 양쪽 다 로컬 자정 기준으로 맞춘다.
const localMidnight = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
const todayMidnight = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); })();

console.log('■ 주간 조사 예약 작업');
for (const k of KINDS) {
  const last = k.stems[k.stems.length - 1];
  if (!last) {
    console.log(`   ${k.label}: 보고서가 하나도 없습니다 — 한 번도 돌지 않았을 수 있습니다`);
    continue;
  }
  const days = Math.round((todayMidnight - localMidnight(last.slice(0, 10))) / 86400000);
  const stale = days > STALE_DAYS;
  console.log(`   ${k.label}: 마지막 ${last.slice(0, 10)} (${days}일 전)` + (stale ? '  ⚠️ 멈췄을 수 있습니다' : ''));
  if (stale) {
    // 2026-09-24부터 미니 PC WSL cron에서 돈다(docs/pc-migration.md 2-4). WSL이 그 시각에 꺼져 있었으면 건너뛴다.
    console.log(`     → crontab -l 로 등록을 확인하고 로그 ${k.log} 끝부분을 보세요`);
  }
}

const pending = all.filter((s) => !isReviewed(s));
if (pending.length) {
  console.log(`   ⚠️ 미처리 보고서 ${pending.length}건: ${pending.join(', ')}`);
  const autos = pending.filter((s) => s.endsWith('-auto'));
  const manual = pending.filter((s) => !s.endsWith('-auto'));
  if (autos.length) {
    console.log(`      · 코드 점검 ${autos.join(', ')} — 데이터는 안 건드렸습니다. 보고서를 읽고`);
    console.log('        반영할 것을 정한 뒤 reports/reviewed.json 에 추가하세요.');
  }
  if (manual.length) {
    console.log(`      · AI 조사 ${manual.join(', ')} — 1절은 이미 파일에 반영돼 **커밋 안 된 채** 있습니다. git diff를 보고`);
    console.log('        커밋하고, 제안 절의 반영 여부를 정한 뒤 reports/reviewed.json 에 추가하세요.');
  }
} else {
  console.log('   미처리 보고서 없음');
}

process.exit(0);
