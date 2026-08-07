-- AI 추천 기능의 사용량 제한(레이트리밋)을 위한 테이블.
-- 로그인 여부와 무관하게(비로그인 사용자 포함) IP 해시 기준으로 하루 사용 횟수를 제한합니다.
-- 개인 식별 정보를 남기지 않기 위해 원본 IP가 아니라 SHA-256 해시만 저장합니다.
--
-- [테이블 이름에 대한 주의] 2026-08-07 기준, 이 테이블을 실제로 쓰는 곳은
-- app/api/ai-recommend/route.js 하나뿐입니다. 이름이 ai_explain_usage인 것은 과거
-- app/api/ai-explain 라우트가 먼저 이 테이블을 만들었기 때문이고, 그 라우트는 어디에서도
-- 호출되지 않는 죽은 코드였기에 삭제했습니다. 테이블 이름은 이미 운영 중인 데이터가 있어
-- 그대로 두었습니다 — 이름을 바꾸려면 Supabase 마이그레이션이 필요하고, 잘못하면 기존
-- 사용량 기록이 끊깁니다. 이름만 옛 기능을 가리킬 뿐 용도는 AI 추천 레이트리밋입니다.
create table if not exists ai_explain_usage (
  ip_hash text not null,
  usage_date date not null,
  count integer not null default 0,
  primary key (ip_hash, usage_date)
);

alter table ai_explain_usage enable row level security;

-- 이 테이블은 익명 IP 해시 + 날짜 + 횟수만 담고 있어 민감정보가 없으므로,
-- 서버 API 라우트가 사용하는 anon 키에 select/insert/update를 허용합니다.
-- (다른 테이블에는 이 정책을 적용하지 마세요 -- 이 테이블에 한정된 예외입니다.)
drop policy if exists "ai_explain_usage_select" on ai_explain_usage;
create policy "ai_explain_usage_select" on ai_explain_usage for select using (true);

drop policy if exists "ai_explain_usage_insert" on ai_explain_usage;
create policy "ai_explain_usage_insert" on ai_explain_usage for insert with check (true);

drop policy if exists "ai_explain_usage_update" on ai_explain_usage;
create policy "ai_explain_usage_update" on ai_explain_usage for update using (true);
