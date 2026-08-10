-- 번역 API용 추가분 (2026-08-09) — 적용 완료 (마이그레이션 translate_budget_and_src_hash)

-- 1. 원문이 그대로면 다시 번역하지 않기 위한 지문.
--    용어집이 바뀌었을 때만(glossary_ver) 또는 원문이 고쳐졌을 때만(src_hash) AI를 부른다.
--    이게 없으면 같은 글에 번역을 반복 요청하는 것만으로 비용을 태울 수 있다.
alter table public.content_translations add column if not exists src_hash text;

-- 2. 번역 일일 총 상한 (서킷 브레이커).
--    AI 설명(ai_daily_budget)과 따로 센다 — 하나가 터졌다고 다른 하나까지 멈출 이유가 없고,
--    어느 쪽이 비용을 쓰는지 구분이 안 되면 원인을 못 찾는다.
--
--    ⚠️ ai_daily_budget 과 달리 SECURITY DEFINER 함수를 두지 않는다.
--    번역 라우트는 service role 로 도는 서버 코드라 테이블에 직접 쓰면 되고,
--    함수를 만들면 §7-4에서 겪은 "anon이 카운터를 태워 기능을 꺼버리는" 통로가 다시 생긴다.
create table if not exists public.translate_daily_budget (
  usage_date date primary key,
  count integer not null default 0
);
alter table public.translate_daily_budget enable row level security;
revoke all on public.translate_daily_budget from anon, authenticated;
-- 정책 없음 + 권한 없음 = 클라이언트에서는 읽지도 쓰지도 못한다. service role 만 접근한다.
