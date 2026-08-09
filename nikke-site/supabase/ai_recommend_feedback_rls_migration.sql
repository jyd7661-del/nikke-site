-- ai_recommend_feedback 테이블의 RLS 활성화 (2026-08-09).
--
-- 왜 필요한가: 이 테이블만 RLS가 꺼져 있어 Supabase 어드바이저가 critical로 잡았다.
-- anon 키는 프론트 번들에 그대로 들어가므로 사실상 공개된 값인데, RLS가 없으면 그 키를 가진
-- 누구나 전체 행을 읽고 수정·삭제할 수 있다. 피드백이 조작되면 "어떤 추천이 좋았나"를
-- 판단하는 근거가 통째로 오염된다. ip_hash가 들어 있어 읽기를 막는 것도 의미가 있다.
--
-- 왜 insert만 여는가: 2026-08-09 기준 이 테이블을 쓰는 코드는
-- app/api/ai-recommend/feedback/route.js의 insert **하나뿐**이다(전 코드 grep으로 확인).
-- select/update/delete 정책을 만들지 않으면 anon은 그 동작을 할 수 없다. 분석은 Supabase
-- 대시보드나 service role로 하면 되고, 그쪽은 RLS를 우회하므로 영향이 없다.
--
-- ⚠️ 나중에 이 테이블을 읽는 코드를 추가한다면(예: "피드백 좋았던 조합" 힌트) anon 키로는
-- 읽히지 않는다. 그때는 서버에서 service role 키를 쓰거나 select 정책을 따로 추가할 것.
-- 정책 없이 읽으려 하면 에러가 아니라 **빈 결과**가 돌아와 조용히 실패한다.
alter table ai_recommend_feedback enable row level security;

drop policy if exists "ai_recommend_feedback_insert" on ai_recommend_feedback;
create policy "ai_recommend_feedback_insert" on ai_recommend_feedback
  for insert with check (true);
