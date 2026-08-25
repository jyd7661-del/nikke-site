---
paths:
  - "nikke-site/lib/synergyEngine.js"
  - "nikke-site/lib/recommend.js"
  - "nikke-site/app/api/ai-recommend/**"
---

# 추천 엔진·AI 라우트를 고칠 때

- **AI는 조합을 만들지 않는다.** 구성·점수·근거는 100% `synergyEngine.js`가 결정하고,
  AI는 확정된 5명을 한 문단으로 설명만 한다. 이 구조 덕분에 엔진이 결정적이고 캐싱이 가능하다.
  **절대 AI에게 조합 구성을 돌려주지 말 것.**
- **근거 없는 숫자를 만들지 않는다.** "가중치를 줘서 해결하자"는 여러 번 시도했다가 전부
  실측으로 기각됐다. 대신 조건을 밝히고(`invest`/`expert`/`partner` 경고) 판단은 사용자에게 넘긴다.
- 근거 문장(`reasons`)은 **3개국어다**(2026-08-25 전환). `scoreTeam`/`recommendTeams`/
  `findExactTeamMatch`/`findRealUsageTeamMatch`에 `opts.lang`을 넘기면 그 언어로 조립된다.
  - 문장 골격은 `lib/engineReasons.js`, 인용되는 자료 원문은 데이터 파일의 `_en`/`_ja` 필드.
    **둘 중 하나만 번역하면 문장 절반이 한국어로 남는다.**
  - **엔진 코드에 한국어 문자열을 넣지 말 것** — 새 문장은 `engineReasons.js`에 세 언어를
    같이 넣는다. 어기면 `testI18n`이 잡는다(검사 13).
  - 예전에는 한국어 전용이라 화면에 `lang === 'ko'` 가드를 걸었다. 그 가드는 없어졌다.
- 근거 문장은 화면에도 나가지만 **주 소비자는 여전히 AI 프롬프트**다. 그래서 문장 속
  캐릭터 이름은 ko/en 모두 영문 `title`을 쓴다(프롬프트의 멤버 목록과 같은 이름이어야
  AI가 같은 캐릭터로 인식한다). 일본어만 `name_ja`를 쓴다.
- 문장을 고치면 `node scripts/testEngineReasons.mjs`가 세 언어를 **실제로 만들어보고**
  `undefined`(인자 누락)와 한국어 누출(데이터 번역 누락)을 잡는다. 기준선 0건.
- 엔진은 `node`로 직접 못 부른다(JSON import에 `with { type: 'json' }`이 없음).
  시험용 사본을 만들었으면 **끝나고 반드시 지운다.**
- 고친 뒤 반드시 `/verify`.

자세한 내용: `docs/engine.md`, `docs/ai.md`
