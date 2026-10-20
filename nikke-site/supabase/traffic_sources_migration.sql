-- 유입 경로 · 국가 (2026-10-21)
--
-- 왜: "네이버에서 유입이 있나?"에 page_views로는 답할 수 없었다(경로만 있다).
-- 무엇을: 사이트에 처음 들어온 순간(랜딩)마다 (날짜, 유입처, 국가, 첫 페이지)를 1 센다.
--   유입처 = referrer의 도메인만 접은 이름(naver·google·direct·arca.live …). 주소 전체는 남기지 않는다.
--   국가   = Vercel 헤더 x-vercel-ip-country(알파2). IP는 저장하지 않는다.
-- 공개 범위는 traffic_migration.sql과 같다 — RLS 켜고 anon 정책 없음, 함수 실행도 service_role만.

create table if not exists traffic_sources (
  view_date date not null,
  source text not null,
  country text not null,
  landing text not null,
  landings integer not null default 0,
  primary key (view_date, source, country, landing)
);

alter table traffic_sources enable row level security;

create or replace function bump_traffic_source(p_date date, p_source text, p_country text, p_landing text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into traffic_sources (view_date, source, country, landing, landings)
  values (p_date, p_source, p_country, p_landing, 1)
  on conflict (view_date, source, country, landing)
  do update set landings = traffic_sources.landings + 1;
$$;

-- ⚠️ authenticated도 회수한다. Supabase는 public 스키마 함수 실행 권한을 anon·authenticated에 **따로** 준다 —
--    public·anon만 회수하면 로그인한 사람 누구나 카운터를 부풀릴 수 있다(2026-10-21 확인, 아래에서 옛 함수 둘도 함께 막음).
revoke all on function bump_traffic_source(date, text, text, text) from public, anon, authenticated;
revoke all on function bump_page_view(text, date) from authenticated;
revoke all on function record_visitor(text, date) from authenticated;

create index if not exists traffic_sources_date_idx on traffic_sources (view_date);
