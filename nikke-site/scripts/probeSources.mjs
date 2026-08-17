// 1차 출처 6곳에 **지금 이 환경에서** 접속이 되는지만 확인한다.
//
// ■ 왜 이게 따로 필요한가 (2026-08-17)
//
//   주간 조사를 클라우드 routine으로 옮겼다가 실패했다. 그 샌드박스는 허용목록 방식 egress
//   프록시라 외부 웹이 전면 차단돼 있었다(패키지 저장소와 Anthropic만 통과).
//   **스크래핑이 전부인 작업을 옮기면서 "새 환경에서 그 사이트가 열리나"를 먼저 확인하지
//   않은 것이 원인이다.** 같은 실수를 반복하지 않으려고 그 확인을 스크립트로 만든다.
//
//   실행 환경마다 결과가 다르다:
//     사용자 PC        — 전부 열림 (지금까지 이 환경에서 스크래핑해 왔다)
//     클라우드 routine  — 전부 막힘 (403 CONNECT)
//     GitHub Actions   — ? 데이터센터 IP를 차단하는 사이트가 있어 직접 돌려봐야 안다
//
// ■ 주의
//
//   prydwen은 node의 fetch를 403으로 막는다(TLS 지문 차이). 실제 스크래퍼가 쓰는 것과 같은
//   방식(curl + 브라우저 UA)으로 찔러야 결과가 의미 있다.
//   HTTP 200이어도 Cloudflare 챌린지 페이지일 수 있으므로, 각 사이트에서 **실제로 있어야 하는
//   문자열**이 본문에 들어 있는지까지 본다. 200만 보고 "된다"고 판단하면 안 된다.

import { execFileSync } from 'node:child_process';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const SOURCES = [
  { name: 'prydwen.gg', url: 'https://www.prydwen.gg/nikke/characters/helm', must: 'rating_story' },
  { name: 'nikke.gg', url: 'https://nikke.gg/tier-list/', must: 'Tier List' },
  { name: 'game8.jp', url: 'https://game8.jp/nikke/492712', must: 'ニケ' },
  { name: 'enikk.app', url: 'https://enikk.app/champion-arena', must: 'Arena' },
  { name: 'namu.wiki', url: 'https://namu.wiki/w/' + encodeURIComponent('헬름(승리의 여신: 니케)'), must: '스킬 1' },
  { name: 'nikke.wikiru.jp', url: 'https://nikke.wikiru.jp/?%E3%83%98%E3%83%AB%E3%83%A0', must: 'スキル' },
];

let ok = 0;
const rows = [];

for (const s of SOURCES) {
  let body = '';
  let status = '';
  try {
    // -w로 상태코드를 본문 뒤에 붙여 받는다(별도 요청을 두 번 보내지 않으려고).
    body = execFileSync('curl', [
      '-sS', '--compressed', '-A', UA, '-L', '--max-time', '30',
      '-w', '\\n__HTTP__%{http_code}', s.url,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = body.match(/__HTTP__(\d{3})\s*$/);
    status = m ? m[1] : '?';
  } catch (e) {
    rows.push({ name: s.name, status: '연결 실패', found: false, note: String(e.message || '').split('\n')[0].slice(0, 60) });
    continue;
  }
  const found = body.includes(s.must);
  if (status === '200' && found) ok++;
  rows.push({
    name: s.name,
    status,
    found,
    // 200인데 기대 문자열이 없으면 챌린지/차단 페이지를 받은 것이다.
    note: status === '200' && !found ? `200이지만 '${s.must}'가 없음 — 차단/챌린지 페이지 의심` : '',
  });
}

console.log('■ 1차 출처 접근 확인');
for (const r of rows) {
  const mark = r.status === '200' && r.found ? '✅' : '❌';
  console.log(`   ${mark} ${r.name.padEnd(18)} HTTP ${String(r.status).padEnd(12)} ${r.note}`);
}
console.log();
console.log(`${ok}/${SOURCES.length} 접근 가능`);

// 하나라도 막혀 있으면 실패로 끝낸다 — 스크래핑 작업을 이 환경에 두면 안 된다는 신호다.
if (ok < SOURCES.length) {
  console.log('⚠️ 일부 출처가 막혀 있다. 이 환경에서는 주간 조사를 돌릴 수 없다.');
  process.exit(1);
}
console.log('이 환경에서 주간 조사를 돌릴 수 있다.');
