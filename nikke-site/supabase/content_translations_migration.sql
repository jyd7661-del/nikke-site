-- =============================================================================
-- 커뮤니티 번역 저장 구조 (2026-08-09) — 적용 완료 (마이그레이션 content_translations)
--
-- 목표: 한국어로 쓴 글을 일본어 설정 사용자가 일본어로 읽는다. 글 쓸 때 미리 세 언어로
-- 번역해 두고(원문 언어는 제외), 화면에서는 번역본을 보여주되 원문도 볼 수 있게 한다.
-- =============================================================================

-- 1. 원문이 무슨 언어인지. 이게 없으면 무엇을 번역해야 하고 무엇이 '원문'인지 알 수 없다.
--    기존 행은 전부 한국어다(적용 시점에 세 테이블 모두 0행이라 실제 백필 대상은 없었음).
alter table public.posts       add column if not exists source_lang text not null default 'ko';
alter table public.comments    add column if not exists source_lang text not null default 'ko';
alter table public.user_combos add column if not exists source_lang text not null default 'ko';

-- 2. 번역본 저장.
--
-- 왜 각 테이블에 컬럼(title_ja, content_ja …)을 안 붙였나:
--   3개 테이블 × 최대 3개 필드 × 대상 언어 = 컬럼이 금방 18개가 되고,
--   언어를 하나 늘릴 때마다 세 테이블을 전부 고쳐야 한다.
-- 그래서 (대상, 언어) 한 행에 필드들을 jsonb로 담는다. 언어 추가가 데이터 추가로 끝난다.
--
-- ⚠️ lang 의 허용값은 lib/i18n.js 의 LOCALES 와 같아야 한다.
--    어긋나면 화면에는 언어가 뜨는데 저장이 거부돼 번역이 통째로 안 된다.
--    scripts/checkData.mjs 의 LOCALE_DRIFT 검사가 이 둘을 비교한다.
create table if not exists public.content_translations (
  entity_type text not null check (entity_type in ('post', 'comment', 'combo')),
  entity_id   uuid not null,
  lang        text not null check (lang in ('ko', 'en', 'ja')),
  -- 번역된 필드들. post={title,content} / comment={content} / combo={name,purpose,description}
  fields      jsonb not null default '{}'::jsonb,
  source_lang text not null,
  status      text not null default 'done' check (status in ('done', 'failed')),
  engine      text,
  -- 용어집이 바뀌면 예전 번역은 낡은 표기를 쓰고 있다. 그때 다시 번역할 대상을 찾기 위한 값.
  glossary_ver text,
  -- 이 번역에서 어떤 이름·용어를 토큰으로 치환했는지. 번역 결과가 이상할 때 원인 낱말을
  -- 바로 짚기 위한 기록이다(2026-08-09 추가, 마이그레이션 content_translations_protected_terms).
  -- 형태: [{"id":"c:rapi","form":"라피"}]
  protected   jsonb,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (entity_type, entity_id, lang)
);

alter table public.content_translations enable row level security;

-- 3. 읽기 권한은 "원본이 보이면 번역도 보인다"로 위임한다.
--
-- ⚠️ 비밀글이 걸려 있다. 번역본을 아무나 읽게 두면 posts의 RLS를 우회해 비밀글 내용이
--    번역본으로 새어 나간다. 정책식 안에서 다른 테이블을 참조하면 그 테이블의 RLS도
--    함께 적용되므로, 아래 exists 는 호출자가 원본을 볼 수 있을 때만 참이 된다.
--    (원본이 지워진 고아 행도 자동으로 안 보이게 된다 — 덤으로 얻는 성질)
create policy content_translations_select on public.content_translations
  for select using (
    case entity_type
      when 'post'    then exists (select 1 from public.posts       p where p.id = entity_id)
      when 'comment' then exists (select 1 from public.comments    c where c.id = entity_id)
      when 'combo'   then exists (select 1 from public.user_combos u where u.id = entity_id)
      else false
    end
  );

-- 4. 쓰기는 서버(service role)만. §7-4에서 "서버 편하자고 anon에게 쓰기를 열어주면
--    그게 곧 구멍이 된다"를 이미 한 번 겪었다. 여기서는 처음부터 닫고 시작한다.
--    service role 은 RLS와 GRANT를 모두 우회하므로 별도 정책이 필요 없다.
revoke all on public.content_translations from anon, authenticated;
grant select on public.content_translations to anon, authenticated;

-- 5. 원본이 지워지면 번역본도 지운다. entity_id 가 다형(polymorphic)이라 FK를 걸 수 없어
--    트리거로 대신한다. 안 지워도 정책상 안 보이지만, 남겨두면 계속 쌓인다.
create or replace function public.delete_content_translations()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.content_translations
   where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end;
$$;
revoke execute on function public.delete_content_translations() from anon, authenticated, public;

drop trigger if exists posts_del_translations on public.posts;
create trigger posts_del_translations after delete on public.posts
  for each row execute function public.delete_content_translations('post');

drop trigger if exists comments_del_translations on public.comments;
create trigger comments_del_translations after delete on public.comments
  for each row execute function public.delete_content_translations('comment');

drop trigger if exists combos_del_translations on public.user_combos;
create trigger combos_del_translations after delete on public.user_combos
  for each row execute function public.delete_content_translations('combo');

-- =============================================================================
-- 적용 후 실제로 돌려본 검증 (2026-08-09, 전부 통과 / 트랜잭션 rollback)
--
-- (1) 비밀글 번역본이 새지 않는가
--     공개글 + 비밀글을 넣고 각각 일본어 번역본을 넣은 뒤 역할별로 조회:
--       anon        → 공개글 번역만
--       다른 사용자 → 공개글 번역만
--       작성자 본인 → 둘 다
--     ※ 이 검사가 통과하지 않으면 비밀글 기능이 번역 때문에 무력화된다.
--
-- (2) 클라이언트가 번역본을 심을 수 있는가
--     authenticated 역할로 insert 시도 → permission denied for table content_translations
--
-- (3) 원본 삭제 시 번역본이 남는가
--     posts 행 삭제 후 남은 번역본 0건
-- =============================================================================
