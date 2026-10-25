-- 화면 기능 사용 횟수 (2026-10-25)
--
-- 왜: 싱크로 우선순위(AI 호출 없는 화면 계산)를 배포했는데 누가 쓰는지 남는 곳이 없었다(10-25 오후 현황 보고 개선점 2).
--   recommend_usage는 /api/ai-recommend가 세는 것이라 서버를 안 거치는 기능은 못 센다.
-- 무엇을: 화면이 /api/track에 { event } 를 보내면 (날짜, 기능 이름, 언어)를 1 센다. 기능 이름은 lib/traffic.js FEATURE_EVENTS 화이트리스트만.
--   IP·로스터·니케는 남기지 않는다.
-- 공개 범위는 recommend_usage_migration.sql과 같다 — RLS 켜고 anon 정책 없음, 함수 실행도 service_role만.

create table if not exists feature_usage (
  usage_date date not null,
  feature text not null,
  lang text not null,
  n integer not null default 0,
  primary key (usage_date, feature, lang)
);

alter table feature_usage enable row level security;

create or replace function bump_feature_usage(p_date date, p_feature text, p_lang text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into feature_usage (usage_date, feature, lang, n)
  values (p_date, p_feature, p_lang, 1)
  on conflict (usage_date, feature, lang)
  do update set n = feature_usage.n + 1;
$$;

-- anon·authenticated는 따로 회수해야 한다(traffic_sources_migration.sql 주석 참고).
revoke all on function bump_feature_usage(date, text, text) from public, anon, authenticated;
grant execute on function bump_feature_usage(date, text, text) to service_role;
grant select, insert, update on feature_usage to service_role;
