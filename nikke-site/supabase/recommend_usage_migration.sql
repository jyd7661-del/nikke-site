-- 추천 선택지 사용 횟수 (2026-10-23)
--
-- 왜: 도감 "이 니케 포함 조합"(requireTitles)과 스테이지 "힐러/탱커 포함"(requireRole)을 배포했는데
--   사이트 현황 보고에 숫자가 안 잡혔다. ai_explain_usage는 캐시 적중이면 안 세고, 어느 선택으로 눌렀는지도 모른다.
-- 무엇을: /api/ai-recommend가 조합을 내보낼 때마다 (날짜, 모드, 역할 선택, 포함 니케 여부, 조건을 못 지켰는지)를 1 센다.
--   어느 니케를 골랐는지·IP·로스터는 남기지 않는다.
--   role = 'any'(상관없음) | 'healer' | 'tank' | '-'(스테이지가 아닌 모드라 선택지가 없음)
--   dropped = 그 조건(역할·포함 니케)으로 조합을 못 만들어 조건 없이 추천했다(roleDropped || requireDropped)
-- 공개 범위는 traffic_sources_migration.sql과 같다 — RLS 켜고 anon 정책 없음, 함수 실행도 service_role만.

create table if not exists recommend_usage (
  usage_date date not null,
  mode text not null,
  role text not null,
  with_nikke boolean not null,
  dropped boolean not null,
  n integer not null default 0,
  primary key (usage_date, mode, role, with_nikke, dropped)
);

alter table recommend_usage enable row level security;

create or replace function bump_recommend_usage(p_date date, p_mode text, p_role text, p_with boolean, p_dropped boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into recommend_usage (usage_date, mode, role, with_nikke, dropped, n)
  values (p_date, p_mode, p_role, p_with, p_dropped, 1)
  on conflict (usage_date, mode, role, with_nikke, dropped)
  do update set n = recommend_usage.n + 1;
$$;

-- anon·authenticated는 따로 회수해야 한다(traffic_sources_migration.sql 주석 참고).
revoke all on function bump_recommend_usage(date, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function bump_recommend_usage(date, text, text, boolean, boolean) to service_role;
grant select, insert, update on recommend_usage to service_role;
