-- 사진으로 보유 니케 넣기 (베타, 2026-11-02)
--
-- 왜: 게임 「니케」 목록 캡처를 하이쿠 5.5가 읽어 보유 니케를 한 번에 고른다(app/api/roster-photo).
--   유저 지시(11-02): "시험 기능(beta)이라는 말과 함께 사람들이 올린 사진과 실제 결과를 비교해서 점점 기능을 개선해 나가는 방향".
--   그래서 사진 한 장마다 **사진 + AI가 읽은 것 + 사용자가 확인하고 넣은 것**을 남긴다. 둘의 차이가 곧 오답 목록이다.
--   비교·개선은 scripts/reviewRosterPhotos.mjs.
-- 무엇을:
--   roster_photo_scans  사진 한 장 = 한 행. IP는 SHA-256 해시만(하루 한도용). 로그인했으면 user_id.
--   storage roster-photos  사진 원본(줄인 것). 비공개 버킷 — 서버(service_role)만 읽고 쓴다.
-- 공개 범위: RLS 켜고 anon·authenticated 정책 없음. 2026-10-30부터 새 테이블은 Data API 권한이 자동으로 안 붙어 service_role에 GRANT를 직접 준다.

create table if not exists roster_photo_scans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  usage_date date not null default current_date,
  ip_hash text not null,
  user_id uuid,
  lang text not null,
  orientation text not null,          -- 'portrait' | 'landscape'
  parts integer not null,             -- AI에 보낸 조각 수(세로 1 · 가로 3)
  photo_path text,                    -- storage roster-photos 안의 경로. 올리기 실패면 null
  model text not null,
  krw numeric(10, 2) not null default 0,
  ms integer,
  ai_cards jsonb not null,            -- [{seen, id, treasure, sure, rescued?, part}] — 합치기 전 원본
  confirmed_ids jsonb,                -- 사용자가 「넣기」를 누를 때 체크돼 있던 화면 id
  confirmed_treasure jsonb,           -- 그중 💎
  confirmed_at timestamptz
);

create index if not exists roster_photo_scans_ip_day on roster_photo_scans (ip_hash, usage_date);
create index if not exists roster_photo_scans_created on roster_photo_scans (created_at desc);

alter table roster_photo_scans enable row level security;
grant select, insert, update on roster_photo_scans to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roster-photos', 'roster-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

-- 2026-11-03 운영자(profiles.is_admin)만 캡처 사진을 읽는다 — 서비스 키 없이 올라온 사진을 결과와 대조하려고(유저 허락, MCP로 적용함)
create policy "roster photos admin read" on storage.objects for select to authenticated
  using (bucket_id = 'roster-photos' and public.is_board_admin());
