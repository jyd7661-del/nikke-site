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
     -- 재방문(2026-10-29~): 그날 첫 화면에서 "앞선 날에 온 적 있음"이 실려 온 방문자(TrafficBeacon · returning_visitor_migration.sql)
     'today_returning', (select count(*) from daily_visitors, b where view_date = t and is_returning),
     'yday_returning',  (select count(*) from daily_visitors, b where view_date = y and is_returning),
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
     'feedback_today', (select json_agg(json_build_object('mode', mode, 'rating', rating, 'roster_n', jsonb_array_length(context->'titles'))) from ai_recommend_feedback, b where created_at::date = t and mode <> '__selftest')
  )) as usage,
  -- 추천 선택지(recommend_usage, 2026-10-23~): 모드 · 역할(any/healer/tank, 스테이지 밖은 -) · 포함 니케 · 조건 못 지킴
  (select json_agg(t) from (select mode, role, with_nikke, dropped, sum(n) n from recommend_usage, b where usage_date = b.t group by 1,2,3,4 order by 5 desc) t) as recommend_today,
  -- 화면 기능 사용(feature_usage, 2026-10-25~): 싱크로 우선순위 등 서버를 안 거치는 화면 계산 · 언어별
  (select json_agg(t) from (select feature, lang, sum(n) n from feature_usage, b where usage_date = b.t group by 1,2 order by 3 desc) t) as features_today,
  -- ⚠️ 하위 표 별칭을 t로 쓰지 말 것 — b.t(날짜)로 읽혀 json_agg가 바깥 집계가 된다(11-02 "more than one row" 오류).
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
     'by', (select json_agg(x) from (select lang, orientation, source, count(*) n from roster_photo_scans r2, b where r2.usage_date = b.t group by 1,2,3) x)
  ) from roster_photo_scans, b where usage_date = b.t) as roster_photo_today,
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
