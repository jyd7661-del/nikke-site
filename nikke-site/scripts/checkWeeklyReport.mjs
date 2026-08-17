// 주간 조사 예약 작업이 (1) 돌긴 했는지 (2) 결과를 사람이 처리했는지 알려준다.
//
// ■ 왜 필요한가 — 지금은 아무도 모르는 채로 지나간다 (2026-08-14 점검)
//
//   예약 작업 `nikke-site-data-research`는 **Cowork(claude.ai)에서** 돈다. 클로드 코드에는
//   예약 실행 기능이 없어서 여기서는 list_scheduled_tasks가 비어 있고, 그 작업이 돌았는지
//   실패했는지 **이 환경에서는 볼 방법이 전혀 없다.**
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

const reports = fs.readdirSync(DIR)
  // `-auto` 접미사도 센다. 2026-08-18에 주간 점검이 코드(scripts/weeklyCheck.mjs)로 바뀌면서
  // 파일명이 `YYYY-MM-DD-auto.md`가 됐는데, 이 필터가 `YYYY-MM-DD.md`만 보고 있어서
  // **자동 보고서가 생겨도 감지기가 못 봤다.** 예약이 도는데 "안 돈다"고 나오는 셈이라,
  // 감지기를 믿을 수 없게 만드는 종류의 버그다.
  .filter((f) => /^\d{4}-\d{2}-\d{2}(-auto)?\.md$/.test(f))
  .map((f) => f.slice(0, 10))
  .sort();

const reviewed = fs.existsSync(MARKER)
  ? (JSON.parse(fs.readFileSync(MARKER, 'utf8')).reviewed || [])
  : [];

const pending = reports.filter((d) => !reviewed.includes(d));
const last = reports[reports.length - 1];
// ⚠️ 보고서 날짜를 UTC 자정으로 파싱하면 안 된다. 파일명은 **로컬 날짜**로 붙는데
//    (weeklyCheck.mjs 참고) 여기서 UTC로 재면 한국 기준 최대 9시간이 어긋나 경과일이
//    하루 밀린다. 양쪽 다 로컬 자정 기준으로 맞춘다.
const localMidnight = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
const todayMidnight = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); })();
const days = last ? Math.round((todayMidnight - localMidnight(last)) / 86400000) : null;

console.log('■ 주간 조사 예약 작업');
if (!last) {
  console.log('   보고서가 하나도 없습니다 — 예약 작업이 한 번도 돌지 않았을 수 있습니다.');
} else {
  const stale = days > STALE_DAYS;
  console.log(`   마지막 보고서 ${last} (${days}일 전)` + (stale ? '  ⚠️ 예약 작업이 멈췄을 수 있습니다' : ''));
  if (stale) {
    // 2026-08-18에 실행 위치를 이 PC의 작업 스케줄러로 옮겼다(경위는 docs/weekly-research.md).
    console.log('   → 이 PC의 작업 스케줄러 `니케 주간 점검` 상태를 확인하세요:');
    console.log('     schtasks /Query /TN "니케 주간 점검" /FO LIST /V');
    console.log('     PC가 그 시각에 꺼져 있었으면 실행이 건너뛰어집니다.');
  }
}
if (pending.length) {
  console.log(`   ⚠️ 미처리 보고서 ${pending.length}건: ${pending.join(', ')}`);
  // 보고서가 두 종류다. 안내를 섞으면 엉뚱한 절차를 찾게 되므로 나눠서 말한다.
  //   `-auto`  scripts/weeklyCheck.mjs 가 만든 자동 점검. 데이터를 고치지 않고 찾아내기만 한다
  //   접미사 없음  예전 AI 세션 보고서. 1절은 이미 파일에 반영돼 있어 diff 확인이 필요했다
  const autos = pending.filter((d) => fs.existsSync(path.join(DIR, `${d}-auto.md`)));
  const manual = pending.filter((d) => !autos.includes(d));
  if (autos.length) {
    console.log(`      · 자동 점검 ${autos.join(', ')} — 데이터는 안 건드렸습니다. 보고서를 읽고`);
    console.log('        반영할 것을 정한 뒤 reports/reviewed.json 에 날짜를 추가하세요.');
  }
  if (manual.length) {
    console.log(`      · AI 조사 ${manual.join(', ')} — 1절(A등급)은 이미 파일에 반영돼 있으니 diff를 보고`);
    console.log('        커밋하고, 2~6절(제안)은 반영 여부를 정한 뒤 reviewed.json 에 날짜를 추가하세요.');
  }
} else {
  console.log('   미처리 보고서 없음');
}

process.exit(0);
