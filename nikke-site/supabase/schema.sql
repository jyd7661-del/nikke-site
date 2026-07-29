-- 니케 조합 추천 사이트 - Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 이 파일 내용을 붙여넣고 실행하세요.

-- 1) 프로필 (닉네임)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  nickname text,
  created_at timestamptz default now()
);

-- 2) 내 보유 니케 (has_treasure: 애장품(Treasure) 장착 여부)
create table if not exists owned_nikke (
  user_id uuid references auth.users on delete cascade,
  character_id text not null,
  has_treasure boolean not null default false,
  created_at timestamptz default now(),
  primary key (user_id, character_id)
);

-- 이미 schema.sql을 예전에 실행해서 owned_nikke 테이블이 있는 경우, has_treasure 컬럼만 추가합니다.
alter table owned_nikke add column if not exists has_treasure boolean not null default false;

-- 3) 유저가 직접 등록하는 조합
create table if not exists user_combos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null,
  purpose text,
  description text,
  members text[] not null,
  created_at timestamptz default now()
);

-- 4) 조합 투표 (추천/비추천)
create table if not exists combo_votes (
  combo_id uuid references user_combos(id) on delete cascade,
  user_id uuid references auth.users on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz default now(),
  primary key (combo_id, user_id)
);

-- 5) 게시판 글
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz default now()
);

-- 6) 댓글
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references auth.users on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- 조합 목록 + 점수(추천-비추천) 뷰
create or replace view combo_scores as
select
  c.*,
  coalesce(sum(v.value), 0)::int as score
from user_combos c
left join combo_votes v on v.combo_id = c.id
group by c.id;

-- ── RLS (Row Level Security) 활성화 ─────────────────────────
alter table profiles enable row level security;
alter table owned_nikke enable row level security;
alter table user_combos enable row level security;
alter table combo_votes enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;

-- profiles: 누구나 읽기 가능, 본인만 쓰기/수정 가능
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_upsert_own" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- owned_nikke: 누구나 읽기(친구 공유용), 본인 데이터만 추가/삭제
create policy "owned_select_all" on owned_nikke for select using (true);
create policy "owned_insert_own" on owned_nikke for insert with check (auth.uid() = user_id);
create policy "owned_update_own" on owned_nikke for update using (auth.uid() = user_id);
create policy "owned_delete_own" on owned_nikke for delete using (auth.uid() = user_id);

-- user_combos: 누구나 읽기, 본인 글만 작성/수정/삭제
create policy "combos_select_all" on user_combos for select using (true);
create policy "combos_insert_own" on user_combos for insert with check (auth.uid() = user_id);
create policy "combos_update_own" on user_combos for update using (auth.uid() = user_id);
create policy "combos_delete_own" on user_combos for delete using (auth.uid() = user_id);

-- combo_votes: 누구나 읽기, 본인 투표만 추가/수정/삭제
create policy "votes_select_all" on combo_votes for select using (true);
create policy "votes_insert_own" on combo_votes for insert with check (auth.uid() = user_id);
create policy "votes_update_own" on combo_votes for update using (auth.uid() = user_id);
create policy "votes_delete_own" on combo_votes for delete using (auth.uid() = user_id);

-- posts: 누구나 읽기, 본인 글만 작성/수정/삭제
create policy "posts_select_all" on posts for select using (true);
create policy "posts_insert_own" on posts for insert with check (auth.uid() = user_id);
create policy "posts_update_own" on posts for update using (auth.uid() = user_id);
create policy "posts_delete_own" on posts for delete using (auth.uid() = user_id);

-- comments: 누구나 읽기, 본인 댓글만 작성/수정/삭제
create policy "comments_select_all" on comments for select using (true);
create policy "comments_insert_own" on comments for insert with check (auth.uid() = user_id);
create policy "comments_update_own" on comments for update using (auth.uid() = user_id);
create policy "comments_delete_own" on comments for delete using (auth.uid() = user_id);
