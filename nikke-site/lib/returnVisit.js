// 재방문 판정(2026-10-29, 유저 "2일 이상 온 사람 접속수도 세줘"). 브라우저가 지난 방문 날짜(UTC YYYY-MM-DD)만 기억하고,
// 오늘보다 **앞선 날**이면 재방문이다. 같은 날·미래(시계가 틀린 기기)·깨진 값은 재방문이 아니다.
// 서버는 이 판정 결과(참/거짓)만 받는다 — 날짜를 넘는 식별자는 여전히 없다(supabase/returning_visitor_migration.sql).
// lib/traffic.js와 따로 둔 이유: 그쪽은 캐릭터 DB를 가져와 브라우저 번들에 넣으면 모든 페이지가 무거워진다.
const YMD = /^\d{4}-\d{2}-\d{2}$/;
export function isReturningVisit(lastDate, today) {
  return typeof lastDate === 'string' && typeof today === 'string' && YMD.test(lastDate) && YMD.test(today) && lastDate < today;
}
