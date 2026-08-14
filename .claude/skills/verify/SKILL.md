---
description: 니케 사이트의 자동 검사 7종을 실행하고 기준선과 대조한다. 데이터·i18n·엔진·광고 배치를 고친 뒤에는 항상 실행할 것.
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
node scripts/checkAdPlacement.mjs
node scripts/checkWeeklyReport.mjs
```

## 기준선 — 이 값과 다르면 보고할 것

| 스크립트 | 기준선 | 무엇을 보는가 |
|---|---|---|
| `checkData.mjs` | **ERROR 0 / WARN 3** | 데이터 정합성. WARN 3건은 `name_ja` 도입으로 생긴 `NAME_SUBSTRING`이며 정상 |
| `testI18n.mjs` | **22건 통과** | 키 집합·중복·값 타입·함수형 호출·빈 값·폴백, 코드가 쓰는 키 존재, 컴포넌트마다 `useLanguage`, `t` 가림, 날짜 하드코딩, 근거 문장 가드 |
| `testCharacterNames.mjs` | **26건 통과** | 언어별 표기, 폴백, 3개국어 검색, 로스터 168명 전수 |
| `testGlossary.mjs` | **35건 통과** | 번역 시 이름 보호 치환(`⟦N⟧`) |
| `findTotems.mjs` | **1군 0명** | 토템 후보 누락 |
| `checkAdPlacement.mjs` | **ERROR 0** (판정 대상 `app/combos/page.js` 1개) | 콘텐츠 없는 화면에 광고를 그리는 페이지. 2026-08-13 애드센스 반려 재발 방지 |
| `checkWeeklyReport.mjs` | **마지막 보고서 9일 이내 / 미처리 목록** | 주간 조사 예약 작업이 돌았는지, 그 결과를 사람이 처리했는지 |

## `checkWeeklyReport`는 막지 않는다

이 검사는 **항상 exit 0**이다. 여기서 걸리는 것은 코드 결함이 아니라 운영 신호이고,
예약 작업이 늦었다고 무관한 코드 푸시를 막으면 안 되기 때문이다(`checkData`의 WARN 3과 같은 성격).
막지 않는 대신 **세션 시작 화면에 반드시 보이게** 하는 것이 목적이다.

- **미처리 보고서**가 뜨면 → 1절(A등급)은 이미 파일에 반영돼 있으니 diff를 보고 커밋하고,
  2~6절(B등급 제안)의 반영 여부를 정한 뒤 `reports/reviewed.json`에 날짜를 추가한다.
- **"예약 작업이 멈췄을 수 있습니다"**가 뜨면 → 그 작업은 Cowork(claude.ai)에서 돈다.
  **클로드 코드에서는 보이지 않으므로** 사람이 claude.ai에서 상태를 확인해야 한다.

## 빌드가 있어야 도는 검사

`checkCanonical`은 `.next/server/app/*.html`을 읽으므로 **`next build` 뒤에만** 의미가 있다.
그래서 `npm run verify`에 넣지 않았다(빌드 없이 돌리면 늘 실패한다).

```bash
npx next build && npm run check:canonical
```

| 스크립트 | 기준선 | 무엇을 보는가 |
|---|---|---|
| `checkCanonical.mjs` | **ERROR 0 / 201개** | 사이트맵에 실리는 주소마다 자기 자신을 가리키는 canonical이 있는가 |

`/`·`/combos`·`/board`는 `'use client'`라 페이지에서 metadata를 export할 수 없어 **별도 레이아웃
파일**로 canonical을 붙였다. 이 구조는 (1) 레이아웃을 지우면 태그가 사라지고 (2) 자식 라우트가
부모의 canonical을 **상속**해 엉뚱한 주소를 가리키게 되는데, 둘 다 화면에는 아무 증상이 없다.

## 판정

- **`checkData`가 ERROR를 내면 그 변경은 되돌리는 것이 원칙이다.** 먼저 고치고 다시 돌린다.
- 통과 건수가 줄었으면 검사를 지운 것이 아닌지 확인한다. 늘었으면 이유를 설명한다.
- WARN이 3건보다 많아졌으면 **새로 생긴 경고만** 골라 보고한다.

## 검사를 새로 만들었다면

**반드시 역테스트한다** — 일부러 고장을 넣어 그 검사가 실제로 잡는지 확인하고,
**어느 검사에 걸렸는지까지** 본다. 기존 검사에 먼저 걸리면 새 검사는 검증되지 않은 것이다.
그리고 **판정 단위를 고장의 단위와 맞춘다**(파일 단위로 짠 검사가 컴포넌트 스코프 버그를 놓친 적 있음).
자세한 내용은 `CLAUDE.md`의 설계 원칙 3·4번.
