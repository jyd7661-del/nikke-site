-- ai_recommend_feedback에 context 열 추가 (2026-10-26).
--
-- 왜: 첫 👎(10-25 보스전 철갑)는 조합 5명만 남아 그 사람의 보유 니케를 몰랐고, 짐작으로 재현해야 했다.
-- 👎일 때만 그때 조건(보유 니케 title 목록·애장품·타워·역할·포함 니케·제외 목록)을 jsonb로 남긴다.
-- 값은 lib/feedbackContext.js가 정리해 넣는다. 👍과 이전 행은 null.
-- 기존 insert 정책(ai_recommend_feedback_insert)이 그대로 적용된다. 읽기는 여전히 service role만.
alter table ai_recommend_feedback add column if not exists context jsonb;
