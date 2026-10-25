-- 사이트 현황 저녁 보고 — 조회문 (2026-10-22). 양식·읽는 법은 docs/site-report.md "저녁 보고".
-- claude.ai Supabase 커넥터의 execute_sql로 **이 파일 통째로** 한 번에 보낸다(결과 1행, JSON 열들).
-- 기준: 오늘 = UTC 오늘(한국 21시 실행이면 09시부터 12시간치). 비교 = 어제 하루 · 지난 7일 하루 평균.
-- 반나절이라 추세 판단에 쓰지 않는다 — 이상 신호(0·급증·오류)만 본다.
with b as (select current_date as t, (current_date - 1) as y, (current_date - 7) as s)
select
  (select json_build_object(
     'today_people', (select count(*) from daily_visitors, b where view_date = t),
     'yday_people',  (select count(*) from daily_visitors, b where view_date = y),
     'avg7_people',  (select round(count(*) / 7.0, 1) from daily_visitors, b where view_date between s and y),
     'today_loads',  (select coalesce(sum(views),0) from page_views, b where view_date = t),
     'yday_loads',   (select coalesce(sum(views),0) from page_views, b where view_date = y),
     'avg7_loads',   (select round(coalesce(sum(views),0) / 7.0, 1) from page_views, b where view_date between s and y)
  )) as visits,
  (select json_agg(t) from (select source, sum(landings) n from traffic_sources, b where view_date = b.t group by 1 order by 2 desc limit 5) t) as sources_today,
  (select json_agg(t) from (select country, sum(landings) n from traffic_sources, b where view_date = b.t group by 1 order by 2 desc limit 5) t) as countries_today,
  (select json_agg(t) from (select path, sum(views) n from page_views, b where view_date = b.t group by 1 order by 2 desc limit 5) t) as top_pages_today,
  (select json_build_object(
     'today_calls', (select coalesce(sum(count),0) from ai_explain_usage, b where usage_date = t),
     'today_users', (select count(distinct ip_hash) from ai_explain_usage, b where usage_date = t),
     'yday_calls',  (select coalesce(sum(count),0) from ai_explain_usage, b where usage_date = y),
     'feedback_today', (select json_agg(json_build_object('mode', mode, 'rating', rating)) from ai_recommend_feedback, b where created_at::date = t)
  )) as usage,
  -- 추천 선택지(recommend_usage, 2026-10-23~): 모드 · 역할(any/healer/tank, 스테이지 밖은 -) · 포함 니케 · 조건 못 지킴
  (select json_agg(t) from (select mode, role, with_nikke, dropped, sum(n) n from recommend_usage, b where usage_date = b.t group by 1,2,3,4 order by 5 desc) t) as recommend_today,
  -- 화면 기능 사용(feature_usage, 2026-10-25~): 싱크로 우선순위 등 서버를 안 거치는 화면 계산 · 언어별
  (select json_agg(t) from (select feature, lang, sum(n) n from feature_usage, b where usage_date = b.t group by 1,2 order by 3 desc) t) as features_today,
  (select json_build_object(
     'today_krw', (select round(coalesce(sum(krw),0)) from ai_daily_budget, b where usage_date = t),
     'month_krw', (select round(coalesce(sum(krw),0)) from ai_daily_budget where usage_date >= date_trunc('month', current_date))
  )) as ai_cost,
  (select json_build_object(
     'new_today', (select count(*) from auth.users, b where created_at::date = t),
     'total', (select count(*) from auth.users where id <> 'c16d0c32-19b3-478e-9620-27f6f5dc5153')
  )) as signups,
  (select json_build_object(
     'posts', (select count(*) from posts, b where created_at::date = t),
     'comments', (select count(*) from comments, b where created_at::date = t),
     'combos', (select count(*) from user_combos, b where created_at::date = t)
  )) as community,
  (select json_build_object('today', t, 'yday', y) from b) as period;
