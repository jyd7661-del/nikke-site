-- AI 설명 생성의 "일일 총 호출 상한"(서킷 브레이커)용 테이블.
--
-- 왜 필요한가: 기존 레이트리밋(ai_explain_usage)은 IP 해시당 하루 30회다. IP가 많아지면
-- 총액은 얼마든지 늘어나므로, 트래픽이 몰리거나 크롤러/어뷰징이 붙으면 청구를 막을 수단이
-- 없었다. 광고를 붙이고 공개하기 전에 반드시 있어야 하는 안전장치다.
--
-- 무엇을 세는가: **실제로 Anthropic API를 호출한 횟수만** 센다. 캐시 적중은 비용이 0이라
-- 세지 않고, 상한에 걸려도 캐시된 설명은 계속 나간다.
--
-- 상한에 걸리면 어떻게 되나: 에러를 내지 않고 근거 문장(fallbackReasoning)으로 대체한다.
-- 조합 구성·점수·근거는 전부 엔진이 정하므로(HANDOFF §2-1) AI 문장이 빠져도 결과물의
-- 핵심은 그대로다. 사용자를 막는 것보다 설명만 담백해지는 쪽이 낫다.
create table if not exists ai_daily_budget (
  usage_date date primary key,
  count integer not null default 0
);

alter table ai_daily_budget enable row level security;

-- 읽기만 anon에 허용한다. 증가는 아래 security definer 함수로만 가능하게 해서,
-- anon 키를 가진 누구나 카운터를 조작해 상한을 우회하거나 서비스를 막는 일을 방지한다.
-- (ai_explain_usage는 insert/update가 열려 있는데, 그건 이 테이블에 물려주지 않는다)
drop policy if exists "ai_daily_budget_select" on ai_daily_budget;
create policy "ai_daily_budget_select" on ai_daily_budget for select using (true);

-- 원자적 증가. select 후 update 방식은 동시 요청에서 갱신이 유실돼 카운터가 실제보다
-- 적게 남는다 — 서킷 브레이커에서 그건 "보호가 조용히 약해지는" 방향이라 특히 나쁘다.
-- upsert 한 문장으로 처리하고 증가된 값을 돌려준다.
create or replace function increment_ai_daily_budget()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  insert into ai_daily_budget (usage_date, count)
  values (current_date, 1)
  on conflict (usage_date)
  do update set count = ai_daily_budget.count + 1
  returning count into v;
  return v;
end;
$$;

grant execute on function increment_ai_daily_budget() to anon, authenticated;
