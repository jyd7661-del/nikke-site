-- =============================================================================
-- AI 조합 구성(폴백 구간) 운영 전환 — 2026-09-15 (docs/ai-teams-plan.md)
--
-- 유저 결정: 하루 예산 10,000원 · 소넷 · 폴백 구간만. 이 파일은 그 셋을 받치는 표 셋이다.
--   1. ai_daily_budget.krw + add_ai_daily_cost()  — 상한을 횟수에서 **원 단위**로. 조합 구성은 건당
--      19~52원이라 횟수 상한(1,000회)으로는 청구를 못 막는다(1.9만~5.2만 원/일).
--   2. ai_team_cache     — 로스터 해시 → AI가 고른 5명. temperature 0만으론 같은 답이 보장되지
--      않아(소넷이 같은 문항에 8/20만 같은 답) 이 캐시가 결정성을 만든다.
--   3. ai_team_shadow    — 실제 호출 기록(엔진 답·AI 답·검산 위반·비용·지연). shadow 모드에서
--      실제 방문자 로스터로 위반률·차이율을 재는 곳.
--
-- ⚠️ 적용 순서: 이 파일 → Vercel 환경변수 AI_TEAMS_MODE=shadow (AI_DAILY_BUDGET_KRW 기본 10000,
--    AI_TEAM_MODEL 기본 claude-sonnet-5) → 재배포. 파일을 안 돌리고 켜면 라우트가 krw 조회 실패를
--    보고 AI 조합 구성을 **건너뛴다**(보호 없이 도는 것보다 안 도는 게 낫다 — route.js readDailyKrw).
-- ⚠️ 서버(service role)만 쓴다. anon에겐 읽기도 열지 않는다 — shadow 표엔 로스터 해시와 조합이
--    있고, 이건 화면에 나가는 정보가 아니다.
-- =============================================================================

-- 1. 원 단위 예산
alter table public.ai_daily_budget add column if not exists krw numeric(12,2) not null default 0;

create or replace function public.add_ai_daily_cost(p_krw numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v numeric;
begin
  insert into ai_daily_budget (usage_date, count, krw)
  values (current_date, 0, coalesce(p_krw, 0))
  on conflict (usage_date)
  do update set krw = ai_daily_budget.krw + coalesce(p_krw, 0)
  returning krw into v;
  return v;
end;
$$;
-- increment_ai_daily_budget()와 같은 원칙: anon·authenticated는 못 부른다(2026-08-09 회수와 일관).
revoke execute on function public.add_ai_daily_cost(numeric) from public, anon, authenticated;

-- 2. AI 조합 응답 캐시
create table if not exists public.ai_team_cache (
  cache_key text primary key,          -- sha256({v, model, 정렬된 보유 id, mode, boss, tower})
  members jsonb not null,              -- title 5개
  reasoning text,                      -- AI의 영문 구성 이유(설명 프롬프트 참고용)
  model text not null,
  prompt_version text not null,
  mode text not null,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);
create index if not exists ai_team_cache_created_idx on public.ai_team_cache (created_at);
alter table public.ai_team_cache enable row level security;
revoke all on public.ai_team_cache from anon, authenticated;

-- 3. 실제 호출 기록(shadow·on 공통)
create table if not exists public.ai_team_shadow (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  mode text not null,
  boss text,
  tower text,
  roster_hash text not null,
  roster_size integer not null,
  engine_members jsonb not null,       -- 엔진 폴백 답(title)
  ai_members jsonb,                    -- AI 답(title) — 파싱 실패면 null
  flaws jsonb not null default '[]',   -- 검산 위반(영문 한 줄들). 비어 있으면 통과
  identical boolean not null default false,
  cost_krw numeric(10,2) not null default 0,
  latency_ms integer,
  model text not null,
  prompt_version text not null,
  retried boolean not null default false,
  served_ai boolean not null default false,  -- on 모드에서 실제로 AI 답이 화면에 나갔는가
  usage jsonb
);
create index if not exists ai_team_shadow_created_idx on public.ai_team_shadow (created_at);
alter table public.ai_team_shadow enable row level security;
revoke all on public.ai_team_shadow from anon, authenticated;

-- 확인용(선택): 오늘 지출과 shadow 요약
-- select usage_date, count, krw from ai_daily_budget order by usage_date desc limit 7;
-- select count(*) as calls, sum(cost_krw) as krw, avg(latency_ms) as ms,
--        sum((jsonb_array_length(flaws) > 0)::int) as flawed, sum(identical::int) as same_as_engine
--   from ai_team_shadow where created_at > now() - interval '7 days';
