-- =============================================================================
-- AI 관련 테이블에서 익명 쓰기 권한 회수 (2026-08-09)
--
-- ⚠️ 적용 순서가 있습니다. 이 파일을 먼저 돌리면 배포된 사이트의 캐시·레이트리밋·
--    일일 상한이 조용히 깨집니다. 반드시 아래 순서대로:
--
--    1. Vercel 환경변수 SUPABASE_SERVICE_ROLE_KEY 추가
--       (Supabase → Project Settings → API Keys → service_role)
--       이름에 NEXT_PUBLIC_ 을 붙이면 브라우저 번들에 실려 나갑니다. 절대 붙이지 말 것.
--    2. app/api/ai-recommend/route.js 배포 (이미 service role 키를 쓰도록 고쳐둠)
--    3. 배포된 사이트에서 AI 추천을 한 번 눌러 캐시/카운터가 정상 기록되는지 확인
--    4. 그 다음에 이 파일을 적용
--
-- =============================================================================
-- 무엇이 문제였나
--
-- 서버 라우트가 공개 키(NEXT_PUBLIC_SUPABASE_ANON_KEY)로 DB에 쓰고 있었습니다.
-- 서버가 공개 키를 쓰니 서버가 써야 하는 테이블을 전부 anon 에게 열어줘야 했고,
-- 그 결과 실제로 이런 게 가능했습니다:
--
--   ai_explain_cache : 브라우저에 노출된 공개 키만으로 캐시된 AI 설명문을 통째로
--                      바꿔 쓸 수 있었음. 그 글은 사이트가 유저에게 보여주는 추천
--                      근거이고 캐시라 계속 재사용되므로 내용 변조 통로였습니다.
--                      → 2026-08-09에 컬럼 단위로 먼저 막아둠
--                        (lock_ai_explain_cache_reasoning_column)
--   ai_explain_usage : 남의 사용량을 최대로 올려 차단하거나 자기 것만 되돌릴 수 있었음
--   increment_ai_daily_budget() : 인증 검사 없이 아무나 호출 가능 →
--                      반복 호출로 하루 상한을 몇 초 만에 태워 AI 설명을 꺼버릴 수 있었음
--
-- 세 구멍의 원인이 전부 "서버가 공개 키를 쓴다" 하나였습니다.
-- =============================================================================

-- 1. 캐시 — 서버(service role)만 쓴다. service role 은 RLS와 GRANT를 통째로 우회하므로
--    아래 회수는 서버 동작에 영향이 없다.
revoke insert, update, delete on public.ai_explain_cache from anon, authenticated;
drop policy if exists ai_explain_cache_insert on public.ai_explain_cache;
drop policy if exists ai_explain_cache_update on public.ai_explain_cache;
-- 읽기는 남긴다. 캐시 내용은 어차피 화면에 그대로 나가는 공개 정보이고,
-- 혹시 클라이언트에서 직접 읽는 경로가 생기더라도 깨지지 않게 한다.

-- 2. 레이트리밋 — 이건 읽기까지 막는다. ip_hash 별 사용량은 공개할 이유가 없고,
--    남의 사용량을 들여다볼 수 있으면 IP 추측 공격의 힌트가 된다.
revoke select, insert, update, delete on public.ai_explain_usage from anon, authenticated;
drop policy if exists ai_explain_usage_select on public.ai_explain_usage;
drop policy if exists ai_explain_usage_insert on public.ai_explain_usage;
drop policy if exists ai_explain_usage_update on public.ai_explain_usage;

-- 3. 일일 예산 — 조회는 남긴다(운영 확인용, 숫자 하나라 민감하지 않다).
--    증가 함수는 서버만 부를 수 있게 한다. 이게 서킷 브레이커를 지키는 핵심이다.
revoke execute on function public.increment_ai_daily_budget() from anon, authenticated, public;
revoke insert, update, delete on public.ai_daily_budget from anon, authenticated;

-- 4. is_board_admin() 은 그대로 둔다.
--    SECURITY DEFINER 지만 호출자 자신의 is_admin 만 돌려주고(auth.uid() 기준),
--    RLS 정책 안에서 쓰이므로 authenticated 가 실행할 수 있어야 한다.
--    익명 호출은 auth.uid() 가 null 이라 항상 false 를 받는다.

-- =============================================================================
-- 적용 후 확인용 (직접 돌려볼 것)
--
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema='public' and table_name in
--     ('ai_explain_cache','ai_explain_usage','ai_daily_budget')
--     and grantee in ('anon','authenticated');
--   -- 기대: ai_explain_cache 의 SELECT, ai_daily_budget 의 SELECT 만 남는다
--
--   select proname, array_to_string(proacl,' | ') from pg_proc p
--   join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname='increment_ai_daily_budget';
--   -- 기대: anon=X / authenticated=X 가 사라지고 postgres, service_role 만 남는다
-- =============================================================================
