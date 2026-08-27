-- 자체 방문 계측 (2026-08-26)
--
-- 왜 만드는가
--   Vercel Web Analytics는 대시보드라 사람이 로그인해야 본다. 그래서 "주간 성장·수익 리포트
--   자동화"(승인됨, 대기 중)가 읽을 수가 없었다. 우리 DB에 숫자가 있으면 예약 작업이 돈다.
--
-- 두 값을 **따로** 센다 (유저 요구)
--   1) 인원수      = daily_visitors 의 행 수
--   2) 로딩 횟수   = page_views.views 의 합
--   비율(로딩/인원)이 크면 한 사람이 여러 페이지를 돈 것 → 콘텐츠 품질 신호.
--   로딩 횟수는 광고 노출과 비례 → 수익 신호.
--
-- 개인정보
--   IP도 UA도 저장하지 않는다. visitor_hash = sha256(ip|ua|날짜)이고 **날짜가 해시에 들어가
--   매일 값이 바뀐다.** 그래서 하루를 넘겨 같은 사람인지 이어붙일 수 없다(추적 불가).
--   원본 IP를 복원하려면 IP와 UA를 이미 알고 있어야 하므로 식별 정보로 쓸 수 없다.
--   개인정보처리방침의 "자동 수집 정보: 방문 통계"에 해당한다.
--
-- 공개 범위 — **운영자만 본다**
--   RLS를 켜되 anon 정책을 **하나도 만들지 않는다.** 그러면 anon 키로는 읽기도 쓰기도 안 된다.
--   쓰기는 서버 라우트(service_role 키, RLS 우회)만, 읽기는 Supabase 대시보드나
--   scripts/trafficReport.mjs(역시 service_role)만 가능하다.
--   ⚠️ 그래서 이 값들은 브라우저 번들이나 공개 페이지에 절대 실리면 안 된다.

create table if not exists page_views (
  path text not null,
  view_date date not null,
  views integer not null default 0,
  primary key (path, view_date)
);

create table if not exists daily_visitors (
  visitor_hash text not null,
  view_date date not null,
  primary key (visitor_hash, view_date)
);

alter table page_views enable row level security;
alter table daily_visitors enable row level security;

-- anon 정책을 만들지 않는다 = anon은 select/insert/update 전부 불가.
-- (기존 ai_explain_usage는 anon 쓰기가 열려 있는데, 그 성질을 여기 물려주지 않는다)
drop policy if exists "page_views_anon" on page_views;
drop policy if exists "daily_visitors_anon" on daily_visitors;

-- 페이지 로딩 1회 기록. INSERT ... ON CONFLICT 로 원자적으로 증가시킨다.
-- select 후 update로 나누면 동시 요청에서 카운트가 샌다.
create or replace function bump_page_view(p_path text, p_date date)
returns void
language sql
security definer
set search_path = public
as $$
  insert into page_views (path, view_date, views)
  values (p_path, p_date, 1)
  on conflict (path, view_date)
  do update set views = page_views.views + 1;
$$;

-- 방문자 1명 기록. 같은 날 같은 해시는 한 번만 남는다.
create or replace function record_visitor(p_hash text, p_date date)
returns void
language sql
security definer
set search_path = public
as $$
  insert into daily_visitors (visitor_hash, view_date)
  values (p_hash, p_date)
  on conflict (visitor_hash, view_date) do nothing;
$$;

-- ⚠️ 이 함수들의 실행 권한도 anon에 주지 않는다. 서버 라우트는 service_role로 부르므로
--    권한이 필요 없고, 열어두면 누구나 카운터를 부풀릴 수 있다.
revoke all on function bump_page_view(text, date) from public, anon;
revoke all on function record_visitor(text, date) from public, anon;

-- 조회용 인덱스 — 날짜로 훑는 질의가 대부분이다.
create index if not exists page_views_date_idx on page_views (view_date);
create index if not exists daily_visitors_date_idx on daily_visitors (view_date);
