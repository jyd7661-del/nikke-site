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
- 근거 문장(`reasons`)의 **주 소비자는 화면이 아니라 AI 프롬프트**다. 그래서 한국어로 둔다.
  화면에 직접 노출되는 곳만 언어 가드를 건다 — 가드를 지우면 `testI18n`이 잡는다.
- 엔진은 `node`로 직접 못 부른다(JSON import에 `with { type: 'json' }`이 없음).
  시험용 사본을 만들었으면 **끝나고 반드시 지운다.**
- 고친 뒤 반드시 `/verify`.

자세한 내용: `docs/engine.md`, `docs/ai.md`
