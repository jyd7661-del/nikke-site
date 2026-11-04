-- 사이트 현황 보고 — 조회문 (2026-10-21). 양식·읽는 법은 docs/site-report.md.
-- claude.ai Supabase 커넥터의 execute_sql로 **이 파일 통째로** 한 번에 보낸다(결과 1행, JSON 열들).
-- 기준: 이번 = 어제까지 7일, 지난 = 그 전 7일. 오늘은 하루가 안 끝나 넣지 않는다(UTC 날짜).
with b as (select (current_date - 7) as s, (current_date - 1) as e, (current_date - 14) as ps, (current_date - 8) as pe)
select
  -- 1. 방문
  (select json_build_object(
     'this_people', (select count(*) from daily_visitors, b where view_date between s and e),
     'prev_people', (select count(*) from daily_visitors, b where view_date between ps and pe),
     -- 재방문(2026-10-29~): 그날 첫 화면에서 "앞선 날에 온 적 있음"이 실려 온 방문자. 날짜별 합이라 같은 사람이 3일 오면 2로 센다.
     'this_returning', (select count(*) from daily_visitors, b where view_date between s and e and is_returning),
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
     'feedback', (select json_agg(json_build_object('d', created_at::date, 'mode', mode, 'rating', rating, 'roster_n', jsonb_array_length(context->'titles'))) from ai_recommend_feedback, b where created_at::date between s and e and mode <> '__selftest'),
     'roster_savers_new', (select count(distinct user_id) from owned_nikke, b where created_at::date between s and e)
  )) as usage,
  -- 4b. 추천 선택지(recommend_usage, 2026-10-23~) — 조합을 내보낸 횟수. 캐시 적중 포함이라 위 AI 설명 호출보다 크다
  (select json_agg(t) from (select mode, role, with_nikke, dropped, sum(n) n from recommend_usage, b where usage_date between s and e group by 1,2,3,4 order by 5 desc) t) as recommend,
  -- 4c. 화면 기능 사용(feature_usage, 2026-10-25~) — 서버를 안 거치는 화면 계산(싱크로 우선순위 등). 기능 · 언어별
  (select json_agg(t) from (select feature, lang, sum(n) n from feature_usage, b where usage_date between s and e group by 1,2 order by 3 desc) t) as features,
  -- 4d. 캡처로 보유 니케 고르기(베타, roster_photo_scans, 2026-11-02~) — 유저 지시 11-02 "매일 현황보고 할 때 같이 보고".
  --     scans 사진 수 · ips 올린 IP 수 · confirmed 「넣기」까지 간 사진 · cards AI가 읽은 카드 · unknown 목록 밖 · removed AI가 확신했는데 사용자가 뺀 니케(오인식 후보)
  --     · unsure_kept 확신 없음이었는데 사용자가 넣은 니케 · krw 비용 · by 언어/방향/입력 방식(source: file·paste·button, 11-03~ — 그 전은 null). 사진별 비교는 scripts/reviewRosterPhotos.mjs
  (select json_build_object(
     'scans', count(*), 'ips', count(distinct ip_hash), 'confirmed', count(confirmed_at),
     'cards', coalesce(sum(jsonb_array_length(ai_cards)),0),
     'unknown', coalesce(sum((select count(*) from jsonb_array_elements(ai_cards) c where coalesce(c->>'id','none') = 'none')),0),
     -- unknown 중 R·SR 니케(솔저·프로덕트·iDoll — DB는 SSR만 둔다). 11-04: 못 읽음 31장 중 27장이 이것이었다(나머지는 DB에 아직 없는 신캐 3 · 이름 없는 카드 1).
     -- 진짜 놓침 후보 = unknown − unknown_rsr. 신캐 카드도 unknown에 남으니 사진 대조 때 가른다.
     'unknown_rsr', coalesce(sum((select count(*) from jsonb_array_elements(ai_cards) c where coalesce(c->>'id','none') = 'none'
        and c->>'seen' ~* '(솔[저져]|프로덕트|idoll|soldier|goldier|product|roduct|uct [0-9]|ict [0-9]|doll|ソルジャー|プロダクト|アイドール|^(flower|ocean|sun)$)')),0),
     'removed', coalesce(sum((select count(distinct c->>'id') from jsonb_array_elements(ai_cards) c
        where confirmed_at is not null and c->>'id' <> 'none' and (c->>'sure')::boolean is not false and c->>'rescued' is null
          and not (confirmed_ids ? (c->>'id')))),0),
     'unsure_kept', coalesce(sum((select count(distinct c->>'id') from jsonb_array_elements(ai_cards) c
        where confirmed_at is not null and ((c->>'sure')::boolean is false or c->>'rescued' is not null) and confirmed_ids ? (c->>'id'))),0),
     'krw', round(coalesce(sum(krw),0)),
     'by', (select json_agg(x) from (select lang, orientation, source, count(*) n from roster_photo_scans r2, b where r2.usage_date between s and e group by 1,2,3) x)
  ) from roster_photo_scans, b where usage_date between s and e) as roster_photo,
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
