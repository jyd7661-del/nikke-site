-- 게시판 비밀글 + 운영자 권한 (2026-08-09).
--
-- 요구: 버그 제보에는 계정 정보·스크린샷·개인 상황이 섞이기 쉬워 보호가 필요하다.
-- 다만 버그 게시판 전체를 무조건 비밀로 하면 (1) 중복 제보가 늘고 (2) "알고 있다"는 신호를
-- 줄 수 없으며 (3) 색인 페이지가 줄어 애드센스 심사에 불리하다(HANDOFF §9의 "콘텐츠가 얇다"
-- 위험과 같은 방향). 그래서 **글 단위 선택**으로 하고, 버그 카테고리만 기본값을 비밀로 둔다.
--
-- 목록 노출: 남의 비밀글은 **목록에도 안 나온다.** RLS 하나로 끝나 새는 경로가 없다.
-- (제목만 보이게 하려면 뷰를 따로 만들어야 하는데, 제목에 민감한 내용을 쓰면 그대로 노출된다)

alter table posts add column if not exists is_private boolean not null default false;
alter table profiles add column if not exists is_admin boolean not null default false;

-- 운영자 판정.
--
-- 정책 안에서 profiles를 직접 조회하면 profiles 자신의 RLS와 얽혀 재귀나 성능 문제가 생길 수
-- 있어, security definer 함수로 분리한다. 인자가 없고 호출자 본인의 관리자 여부만 돌려주므로
-- 남의 정보를 캐낼 수 있는 함수가 아니다.
create or replace function is_board_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

grant execute on function is_board_admin() to anon, authenticated;

-- 글: 공개글이거나, 내 글이거나, 내가 운영자일 때만 보인다.
drop policy if exists "posts_select_all" on posts;
drop policy if exists "posts_select_visible" on posts;
create policy "posts_select_visible" on posts for select using (
  is_private = false
  or user_id = auth.uid()
  or is_board_admin()
);

-- 댓글: **글을 볼 수 없으면 댓글도 보이면 안 된다.**
-- 이걸 빠뜨리면 post_id만 알면 비밀글의 댓글을 읽을 수 있다 — 정작 본문은 막아놓고
-- 옆문이 열려 있는 셈이라, 비밀글 기능에서 가장 흔한 구멍이다.
drop policy if exists "comments_select_all" on comments;
drop policy if exists "comments_select_visible" on comments;
create policy "comments_select_visible" on comments for select using (
  exists (
    select 1 from posts p
    where p.id = comments.post_id
      and (p.is_private = false or p.user_id = auth.uid() or is_board_admin())
  )
);

-- 운영자 지정. 새 운영자를 추가할 때는 profiles.is_admin을 true로 바꾸면 된다.
-- (본인이 자기 is_admin을 바꾸지 못하도록, profiles의 update 정책은 그대로 둔다 —
--  profiles_update_own이 열려 있으므로 아래 ⚠️ 참고)
insert into profiles (id, is_admin)
values ('c16d0c32-19b3-478e-9620-27f6f5dc5153', true)
on conflict (id) do update set is_admin = true;

-- ⚠️ 권한 상승 차단 — 여기서 한 번 뚫렸다(2026-08-09 실측).
--
-- profiles에는 profiles_update_own 정책이 있어 사용자가 자기 행을 수정할 수 있다. 그대로 두면
-- **누구나 자기 is_admin을 true로 바꿔 남의 비밀글을 전부 읽을 수 있다.**
--
-- 처음에는 `revoke update (is_admin) ...` 로 컬럼 단위만 회수했는데 **효과가 없었다.**
-- Postgres에서 **테이블 단위 UPDATE 권한이 남아 있으면 컬럼 단위 회수는 무시된다.**
-- (실제로 테스트 계정이 자기 is_admin을 true로 바꾸는 데 성공했다)
-- 테이블 단위를 먼저 회수하고, 허용할 컬럼만 다시 부여해야 한다.
revoke update on profiles from anon, authenticated;
grant update (nickname) on profiles to anon, authenticated;

-- 검증(2026-08-09): 일반 사용자가 자기 is_admin 변경 → 반영 안 됨 / 닉네임 변경 → 정상.
-- 제3자: 공개글만 보임(비밀글 0, 비밀글 댓글 0). 작성자·운영자: 비밀글과 그 댓글 모두 보임.
