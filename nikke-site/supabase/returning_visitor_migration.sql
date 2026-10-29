-- 재방문자 세기 (2026-10-29, 유저 "보고에 2일 이상 온 사람 접속수도 세줘")
--
-- 왜 새로 필요한가
--   daily_visitors.visitor_hash = sha256(ip|ua|날짜)라 날마다 값이 바뀐다(traffic_migration.sql) — 일부러 날짜를 넘겨
--   같은 사람을 이어붙이지 못하게 만들었다. 그래서 지금 데이터로는 "전에 온 사람"을 셀 수 없다.
--   이 성질은 그대로 둔다. 대신 브라우저가 "이전 날에 온 적 있음" 한 비트만 보내고(components/TrafficBeacon.js),
--   그날의 방문자 행에 표시만 한다. 서버에는 여전히 날짜를 넘는 식별자가 없다.
--
-- 기존 record_visitor(p_hash, p_date)는 남겨 둔다 — 배포가 바뀌는 사이 옛 라우트가 부를 수 있다.
alter table daily_visitors add column if not exists is_returning boolean not null default false;

create or replace function record_visitor_ret(p_hash text, p_date date, p_returning boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into daily_visitors (visitor_hash, view_date, is_returning)
  values (p_hash, p_date, coalesce(p_returning, false))
  on conflict (visitor_hash, view_date)
  do update set is_returning = daily_visitors.is_returning or excluded.is_returning;
$$;

-- 실행 권한은 서버 라우트(service_role)만 — 열어 두면 누구나 숫자를 부풀릴 수 있다(traffic_migration.sql과 같은 이유).
revoke all on function record_visitor_ret(text, date, boolean) from public, anon, authenticated;
