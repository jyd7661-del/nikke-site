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
- 캐릭터 이름은 `characterName()` / `memberName()`으로만 얻는다. **직접 `name_kr`·`title`·
  `name_ja`를 고르지 않는다** — 규칙이 갈라지면 언어 하나만 조용히 틀린다.
  - 서버 컴포넌트: `lib/characterNames.js`
  - **클라이언트 컴포넌트: `lib/memberName.js`** (정의는 여기 하나뿐이고 `characterNames.js`가
    재수출한다). `characterNames.js`는 `characterDatabase.json` **666KB**를 읽으므로
    클라이언트에서 import하면 그게 통째로 번들에 실린다.
- **클라이언트 컴포넌트에서 `lib/dex.js`를 import하지 않는다.** 같은 이유로 데이터 파일
  1.1MB가 딸려 온다. 도감 라벨은 `lib/dexLabels.js`(glossary 5KB만 읽음)를 쓴다.
  실제로 2026-08-24에 이걸 어겨 `/nikke`의 First Load JS가 **94kB → 347kB**로 뛰었다.
  화면에는 아무 증상이 없고 느려질 뿐이라 **빌드 출력의 First Load JS를 눈으로 확인할 것.**
- 클라이언트 컴포넌트에 넘기는 props는 **RSC 페이로드로 직렬화된다.** 캐릭터 객체를 통째로
  넘기면 `skills`(3개 × 3개국어 설명)까지 실린다. 화면이 쓰는 필드만 추려서 넘긴다.
- 키를 추가·삭제하면 **한/영/일 세 언어 모두** 손댄다. 하나라도 빠지면 `testI18n`이 잡는다.
- 고친 뒤 반드시 `/verify` (기준선 `testI18n` 22건 · `testCharacterNames` 26건).

자세한 내용: `docs/i18n.md`
