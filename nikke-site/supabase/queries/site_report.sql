-- 사이트 현황 보고 — 조회문 (2026-10-21). 양식·읽는 법은 docs/site-report.md.
-- claude.ai Supabase 커넥터의 execute_sql로 **이 파일 통째로** 한 번에 보낸다(결과 1행, JSON 열들).
-- 기준: 이번 = 어제까지 7일, 지난 = 그 전 7일. 오늘은 하루가 안 끝나 넣지 않는다(UTC 날짜).
with b as (select (current_date - 7) as s, (current_date - 1) as e, (current_date - 14) as ps, (current_date - 8) as pe)
select
  -- 1. 방문
  (select json_build_object(
     'this_people', (select count(*) from daily_visitors, b where view_date between s and e),
     'prev_people', (select count(*) from daily_visitors, b where view_date between ps and pe),
     'this_loads',  (select coalesce(sum(views),0) from page_views, b where view_date between s and e),
     'prev_loads',  (select coalesce(sum(views),0) from page_views, b where view_date between ps and pe),
     'daily', (select json_agg(json_build_object('d', d, 'people', p, 'loads', l) order by d) from (
        select v.view_date d, v.p, coalesce(pv.l,0) l from
          (select view_date, count(*) p from daily_visitors, b where view_date between s and e group by 1) v
          left join (select view_date, sum(views) l from page_views, b where view_date between s and e group by 1) pv using (view_date)) x)
  )) as visits,
  -- 2. 유입처 · 국가 (traffic_sources는 2026-10-21부터)
  (select json_agg(t) from (select source, sum(landings) n from traffic_sources, b where view_date between s and e group by 1 order by 2 desc limit 10) t) as sources,
  (select json_agg(t) from (select source, sum(landings) n from traffic_sources, b where view_date between ps and pe group by 1 order by 2 desc limit 10) t) as sources_prev,
  (select json_agg(t) from (select country, sum(landings) n from traffic_sources, b where view_date between s and e group by 1 order by 2 desc limit 8) t) as countries,
  (select json_agg(t) from (select landing, sum(landings) n from traffic_sources, b where view_date between s and e group by 1 order by 2 desc limit 8) t) as landings,
  -- 3. 많이 본 페이지 (언어 접두어는 따로 센다)
  (select json_agg(t) from (select path, sum(views) n from page_views, b where view_date between s and e group by 1 order by 2 desc limit 10) t) as top_pages,
  (select json_build_object(
     'ko', coalesce(sum(views) filter (where path !~ '^/(en|ja)(/|$)'),0),
     'en', coalesce(sum(views) filter (where path ~ '^/en(/|$)'),0),
     'ja', coalesce(sum(views) filter (where path ~ '^/ja(/|$)'),0)) from page_views, b where view_date between s and e) as lang_loads,
  -- 4. 추천 사용 (엔진 추천은 서버 기록이 없다 — AI 설명 호출이 하한선 대리 지표)
  (select json_build_object(
     'explain_calls', (select coalesce(sum(count),0) from ai_explain_usage, b where usage_date between s and e),
     'explain_users', (select count(distinct ip_hash) from ai_explain_usage, b where usage_date between s and e),
     'prev_calls',    (select coalesce(sum(count),0) from ai_explain_usage, b where usage_date between ps and pe),
     'prev_users',    (select count(distinct ip_hash) from ai_explain_usage, b where usage_date between ps and pe),
     'feedback', (select json_agg(json_build_object('d', created_at::date, 'mode', mode, 'rating', rating)) from ai_recommend_feedback, b where created_at::date between s and e),
     'roster_savers_new', (select count(distinct user_id) from owned_nikke, b where created_at::date between s and e)
  )) as usage,
  -- 4b. 추천 선택지(recommend_usage, 2026-10-23~) — 조합을 내보낸 횟수. 캐시 적중 포함이라 위 AI 설명 호출보다 크다
  (select json_agg(t) from (select mode, role, with_nikke, dropped, sum(n) n from recommend_usage, b where usage_date between s and e group by 1,2,3,4 order by 5 desc) t) as recommend,
  -- 4c. 화면 기능 사용(feature_usage, 2026-10-25~) — 서버를 안 거치는 화면 계산(싱크로 우선순위 등). 기능 · 언어별
  (select json_agg(t) from (select feature, lang, sum(n) n from feature_usage, b where usage_date between s and e group by 1,2 order by 3 desc) t) as features,
  -- 5. AI 비용 (원, 우리 DB 기준 — 청구서와는 기간·환율이 다를 수 있다)
  (select json_build_object(
     'week_krw', (select round(coalesce(sum(krw),0)) from ai_daily_budget, b where usage_date between s and e),
     'month_krw', (select round(coalesce(sum(krw),0)) from ai_daily_budget where usage_date >= date_trunc('month', current_date)),
     'week_calls', (select coalesce(sum(count),0) from ai_daily_budget, b where usage_date between s and e)
  )) as ai_cost,
  -- 5b. 가입 (auth.users — 커넥터는 읽을 수 있다. 운영자 계정 제외)
  (select json_build_object(
     'total', (select count(*) from auth.users where id <> 'c16d0c32-19b3-478e-9620-27f6f5dc5153'),
     'new_this', (select count(*) from auth.users, b where created_at::date between s and e),
     'new_prev', (select count(*) from auth.users, b where created_at::date between ps and pe),
     'signin_this', (select count(*) from auth.users, b where last_sign_in_at::date between s and e and id <> 'c16d0c32-19b3-478e-9620-27f6f5dc5153')
  )) as signups,
  -- 6. 커뮤니티
  (select json_build_object(
     'posts', (select count(*) from posts, b where created_at::date between s and e),
     'comments', (select count(*) from comments, b where created_at::date between s and e),
     'combos', (select count(*) from user_combos, b where created_at::date between s and e)
  )) as community,
  (select json_build_object('s', s, 'e', e) from b) as period;
