---
description: 니케 사이트의 자동 검사 5종을 실행하고 기준선과 대조한다. 데이터·i18n·엔진을 고친 뒤에는 항상 실행할 것.
---

# 검사 실행 (`/verify`)

`nikke-site/`에서 아래를 순서대로 실행한다.

```bash
cd nikke-site
node scripts/checkData.mjs
node scripts/testI18n.mjs
node scripts/testCharacterNames.mjs
node scripts/testGlossary.mjs
node scripts/findTotems.mjs
```

## 기준선 — 이 값과 다르면 보고할 것

| 스크립트 | 기준선 | 무엇을 보는가 |
|---|---|---|
| `checkData.mjs` | **ERROR 0 / WARN 3** | 데이터 정합성. WARN 3건은 `name_ja` 도입으로 생긴 `NAME_SUBSTRING`이며 정상 |
| `testI18n.mjs` | **22건 통과** | 키 집합·중복·값 타입·함수형 호출·빈 값·폴백, 코드가 쓰는 키 존재, 컴포넌트마다 `useLanguage`, `t` 가림, 날짜 하드코딩, 근거 문장 가드 |
| `testCharacterNames.mjs` | **26건 통과** | 언어별 표기, 폴백, 3개국어 검색, 로스터 168명 전수 |
| `testGlossary.mjs` | **35건 통과** | 번역 시 이름 보호 치환(`⟦N⟧`) |
| `findTotems.mjs` | **1군 0명** | 토템 후보 누락 |

## 판정

- **`checkData`가 ERROR를 내면 그 변경은 되돌리는 것이 원칙이다.** 먼저 고치고 다시 돌린다.
- 통과 건수가 줄었으면 검사를 지운 것이 아닌지 확인한다. 늘었으면 이유를 설명한다.
- WARN이 3건보다 많아졌으면 **새로 생긴 경고만** 골라 보고한다.

## 검사를 새로 만들었다면

**반드시 역테스트한다** — 일부러 고장을 넣어 그 검사가 실제로 잡는지 확인하고,
**어느 검사에 걸렸는지까지** 본다. 기존 검사에 먼저 걸리면 새 검사는 검증되지 않은 것이다.
그리고 **판정 단위를 고장의 단위와 맞춘다**(파일 단위로 짠 검사가 컴포넌트 스코프 버그를 놓친 적 있음).
자세한 내용은 `CLAUDE.md`의 설계 원칙 3·4번.
