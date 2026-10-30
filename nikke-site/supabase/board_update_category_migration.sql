-- 게시판 "업데이트" 분류 (2026-10-30, 유저: "게시판에 큰 업데이트가 있으면 업데이트 내용을 작성해둘까?" → "전부 진행해" → "적용해")
-- 운영자(profiles.is_admin, is_board_admin())만 쓰고 고칠 수 있다. 화면(lib/board.js adminOnly)은 버튼만 숨기고, 막는 것은 여기다.
-- 정책은 drop 없이 alter policy로 바꾼다(권한 검사가 drop 든 SQL을 막는다). CHECK 식은 바꾸는 명령이 없어 drop/add.

alter table posts drop constraint if exists posts_category_check;
alter table posts add constraint posts_category_check
  check (category = any (array['free', 'bug', 'suggestion', 'update']));

alter policy "posts_insert_own" on posts
  with check (auth.uid() = user_id and (category <> 'update' or is_board_admin()));

-- 남의 글은 원래 못 고친다(using). with_check는 내 글을 "업데이트"로 바꾸는 것을 막는다.
alter policy "posts_update_own" on posts
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and (category <> 'update' or is_board_admin()));
