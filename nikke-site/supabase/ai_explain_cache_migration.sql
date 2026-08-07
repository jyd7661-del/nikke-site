-- AI 추천 설명문 캐시.
--
-- [왜 필요한가]
-- 조합 "구성"은 lib/synergyEngine.js가 전부 결정하고 AI는 이미 확정된 5명을 설명하는 문장만
-- 만든다. 그런데 그 엔진은 완전히 결정적이다 — 같은 보유 캐릭터 + 같은 모드 + 같은 애장품이면
-- 항상 같은 5명, 항상 같은 근거 문장이 나온다. 즉 AI에게 보내는 입력이 완전히 같은 요청이
-- 반복해서 발생하고, 그때마다 돈을 내고 같은 답을 다시 받고 있었다.
--
-- 2026-08-08 측정 기준 요청 1건당 입력 약 2,245토큰 + 출력 400토큰이라, Sonnet 5 표준가
-- ($3/$15 per 1M, 2026-09-01부터 적용)로 환산하면 1건에 약 18원이다. 광고로 상쇄하려면
-- 페이지뷰 10회 이상이 필요한 금액이라, 호출 자체를 줄이는 것이 유일하게 효과 있는 대책이다.
--
-- [캐시 키]
-- 로스터가 아니라 "AI에게 실제로 보낸 입력"을 해싱한다(모드/언어/멤버/근거 문장/아키타입 노트).
-- 그래야 서로 다른 로스터라도 결론이 같은 조합으로 수렴하면 같은 캐시를 공유한다.
-- 근거 문장이 바뀌면(= 엔진 로직이나 데이터가 바뀌면) 키가 달라져 자연히 새로 생성되므로,
-- 별도의 무효화 절차가 필요 없다. 이게 로스터 해시 대신 입력 해시를 쓰는 이유다.
create table if not exists ai_explain_cache (
  cache_key text primary key,
  reasoning text not null,
  lang text not null,
  mode text not null,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

-- 오래되고 한 번도 재사용되지 않은 항목을 정리할 때 쓴다.
create index if not exists ai_explain_cache_created_idx on ai_explain_cache (created_at);

alter table ai_explain_cache enable row level security;

-- 이 테이블에는 개인 식별 정보가 없다(조합 구성과 그 설명문뿐). 서버 API 라우트가 사용하는
-- anon 키에 select/insert/update를 허용한다.
-- (다른 테이블에는 이 정책을 적용하지 마세요 -- 이 테이블에 한정된 예외입니다.)
drop policy if exists "ai_explain_cache_select" on ai_explain_cache;
create policy "ai_explain_cache_select" on ai_explain_cache for select using (true);

drop policy if exists "ai_explain_cache_insert" on ai_explain_cache;
create policy "ai_explain_cache_insert" on ai_explain_cache for insert with check (true);

drop policy if exists "ai_explain_cache_update" on ai_explain_cache;
create policy "ai_explain_cache_update" on ai_explain_cache for update using (true);
