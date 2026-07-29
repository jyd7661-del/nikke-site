-- 애장품(Treasure) 보유 여부 추가 마이그레이션
-- schema.sql을 이미 한 번 실행했던 기존 프로젝트라면, 아래 내용을 Supabase 대시보드 > SQL Editor 에서
-- 추가로 한 번만 실행해주세요. (schema.sql을 처음부터 다시 실행하면 정책이 중복돼 에러가 납니다.)
-- 새로 프로젝트를 만드는 경우에는 이 파일 대신 schema.sql만 실행하면 됩니다(이미 반영되어 있음).

alter table owned_nikke add column if not exists has_treasure boolean not null default false;

create policy "owned_update_own" on owned_nikke for update using (auth.uid() = user_id);
