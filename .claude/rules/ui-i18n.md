---
paths:
  - "nikke-site/components/**"
  - "nikke-site/app/**"
---

# 화면 코드를 고칠 때

- 문구는 **반드시 `lib/i18n.js`의 키**를 통한다. 한국어를 JSX에 직접 쓰지 않는다.
- **컴포넌트마다** `const { lang, t } = useLanguage()`를 받는다. 한 파일에 컴포넌트가 여럿이면
  스코프가 각각이다. 훅 없이 `t()`를 쓰면 **콘솔 에러도 없이 그 컴포넌트만 통째로 렌더되지 않는다.**
  실제로 `AiRecommendSection`이 이 버그로 AI 추천 화면을 통째로 날렸다(2026-08-11).
- 모듈 스코프 상수는 `t()`를 못 부른다. **문구 대신 키를 들고 있다가** 화면에서 푼다
  (`labelKey`, `daysKey` 패턴).
- 값이 끼어드는 문구는 **함수형 키**로 만든다. 언어마다 어순이 달라 문자열을 잘라 붙이면 깨진다.
- 날짜는 `dateLocale(lang)`을 쓴다. `'ko-KR'` 하드코딩 금지.
- 캐릭터 이름은 `lib/characterNames.js`의 `characterName()` / `memberName()`으로만 얻는다.
- 키를 추가·삭제하면 **한/영/일 세 언어 모두** 손댄다. 하나라도 빠지면 `testI18n`이 잡는다.
- 고친 뒤 반드시 `/verify` (기준선 `testI18n` 22건).

자세한 내용: `docs/i18n.md`
