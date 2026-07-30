-- AI 조합 설명 기능(app/api/ai-explain)의 사용량 제한(레이트리밋)을 위한 테이블.
-- 로그인 여부와 무관하게(비로그인 사용자 포함) IP 해시 기준으로 하루 사용 횟수를 제한합니다.
-- 개인 식별 정보를 남기지 않기 위해 원본 IP가 아니라 SHA-256 해시만 저장합니다.
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
