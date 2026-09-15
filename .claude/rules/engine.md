---
paths:
  - "nikke-site/lib/synergyEngine.js"
  - "nikke-site/lib/recommend.js"
  - "nikke-site/app/api/ai-recommend/**"
---

# 추천 엔진·AI 라우트를 고칠 때

- **실사용/아키타입 경로는 엔진이, 폴백 구간만 AI가 구성한다**(2026-09-15 코드 투입, `AI_TEAMS_MODE` 기본 off).
  AI 답은 반드시 `lib/aiTeamVerify.js`로 검산하고, 프롬프트는 `lib/aiTeamPrompt.js` 하나뿐이다(실험과 공유 —
  고치면 `PROMPT_VERSION`을 올리고 `docs/ai-teams-plan.md` §5 평가 2종을 돌린다). 엔진은 여전히 결정적이라 캐싱이 가능하다.
  다만 **"절대 맡기지 말 것"은 2026-09-04 유저가 폐기했다** — AI 조합은 최종 목표이고, 전환은
  채점 실험을 거쳐 한다(`CLAUDE.md` 원칙 1). 라우트에서 몰래 바꾸지 말고, 제안을 반사적으로 기각하지도 말 것.
- **아키타입 완전일치는 부분일치보다 항상 강한 근거다**(2026-08-25). 정렬에서 앞에 두고,
  부분일치 점수는 `archetypePartialPoints()`가 **완성도 비례**(완전일치 × 일치/전체)로 준다.
  고치기 전에는 4/5 부분일치(20점)가 완전일치(14점)를 넘겨 **완전일치 조합 이름이 근거의
  73.2%에서 사라졌다.** 이 점수는 게시판 "AI 점수" 배지로도 보이므로 문장만 고쳐선 안 끝난다.
- 다만 **부분일치를 깎아내리지는 않는다.** 채점 대상 팀은 항상 5명이 차 있으므로 4/5
  부분일치는 "빈 칸"이 아니라 **한 자리를 바꿔 넣은 변형**이다(유저 지적). 비례식은 4/5에
  완전일치의 80%를 준다. 천장(`min(…, 14)`)으로 눌렀다가 3/5·4/5가 뭉개져서 되돌린 이력이
  있으니 반복하지 말 것 — `docs/engine.md` 4-3.
- **근거 없는 숫자를 만들지 않는다.** "가중치를 줘서 해결하자"는 여러 번 시도했다가 전부
  실측으로 기각됐다. 대신 조건을 밝히고(`invest`/`expert`/`partner` 경고) 판단은 사용자에게 넘긴다.
- 근거 문장(`reasons`)은 **3개국어다**(2026-08-25 전환). `scoreTeam`/`recommendTeams`/
  `findExactTeamMatch`/`findRealUsageTeamMatch`에 `opts.lang`을 넘기면 그 언어로 조립된다.
  - 문장 골격은 `lib/engineReasons.js`, 인용되는 자료 원문은 데이터 파일의 `_en`/`_ja` 필드.
    **둘 중 하나만 번역하면 문장 절반이 한국어로 남는다.**
  - **엔진 코드에 한국어 문자열을 넣지 말 것** — 새 문장은 `engineReasons.js`에 세 언어를
    같이 넣는다. 어기면 `testI18n`이 잡는다(검사 13).
  - 예전에는 한국어 전용이라 화면에 `lang === 'ko'` 가드를 걸었다. 그 가드는 없어졌다.
- 근거 문장(`reasons`)은 **추천 화면에 한 줄로 안 나간다**(`ResultPanel`이 렌더하지 않는다. 커뮤니티
  페이지는 툴팁뿐). 주 소비자는 AI 프롬프트이고 **AI 설명 캐시 키에도 들어간다** — 문장을 바꾸면 캐시가
  무효화돼 Claude가 새로 호출된다. 화면에 따로 보여야 하는 문장은 `bossDefenseNote`처럼 **필드로** 넘기고,
  필드를 골라 옮기는 `findRealUsageTeamMatch`·`findExactTeamMatch`에도 적을 것. 그래서 문장 속
  캐릭터 이름은 ko/en 모두 영문 `title`을 쓴다(프롬프트의 멤버 목록과 같은 이름이어야
  AI가 같은 캐릭터로 인식한다). 일본어만 `name_ja`를 쓴다.
- 문장을 고치면 `node scripts/testEngineReasons.mjs`가 세 언어를 **실제로 만들어보고**
  `undefined`(인자 누락)와 한국어 누출(데이터 번역 누락)을 잡는다. 기준선 0건.
- 엔진은 `node`로 직접 못 부른다(JSON import에 `with { type: 'json' }`이 없음).
  시험용 사본을 만들었으면 **끝나고 반드시 지운다.**
- 고친 뒤 반드시 `/verify`.

자세한 내용: `docs/engine.md`, `docs/ai.md`
