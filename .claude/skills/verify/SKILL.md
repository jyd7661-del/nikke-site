---
description: 니케 사이트의 자동 검사 13종을 실행하고 기준선과 대조한다. 데이터·i18n·엔진·도감·광고 배치를 고친 뒤에는 항상 실행할 것.
---

# 검사 실행 (`/verify`)

`nikke-site/`에서 아래를 순서대로 실행한다.

```bash
cd nikke-site
node scripts/checkData.mjs
node scripts/testI18n.mjs
node scripts/testEngineReasons.mjs
node scripts/testRealTeams.mjs
node scripts/testCharacterNames.mjs
node scripts/testGlossary.mjs
node scripts/testDexUsage.mjs
node scripts/testDataI18n.mjs
node scripts/testTraffic.mjs
node scripts/findTotems.mjs
node scripts/checkAdPlacement.mjs
node scripts/checkWeeklyReport.mjs
```

## 기준선 — 이 값과 다르면 보고할 것

| 스크립트 | 기준선 | 무엇을 보는가 |
|---|---|---|
| `checkData.mjs` | **ERROR 0 / WARN 3** | 데이터 정합성. WARN 3건은 `name_ja` 도입으로 생긴 `NAME_SUBSTRING`이며 정상 |
| `testI18n.mjs` | **25건 통과** | 키 집합·중복·값 타입·함수형 호출·빈 값·폴백, 코드가 쓰는 키 존재, 컴포넌트마다 `useLanguage`, `t` 가림, 날짜 하드코딩, **engineReasons 3개국어 키 일치·엔진이 쓰는 키 존재·엔진 코드에 한국어 없음** |
| `testEngineReasons.mjs` | **문제 0건** | 근거 문장을 세 언어로 **실제로 만들어본다**. 인자 누락(`undefined`)과 데이터 번역 누락(영어·일본어에 한국어 누출)을 잡는다. 아키타입 345건 전수 포함 |
| `testRealTeams.mjs` | **문제 0건 · 214건(솔로레이드 125 · 타워 50 · 캠페인 19 · PvP 20)** | 등록된 **실제 조합**을 우리 규칙에 넣어 본다. 사람들이 실제로 클리어에 쓴 조합이 우리 규칙에서 불성립이면 데이터나 규칙이 틀린 것이다. 2026-09-01에 20건이 걸렸고 원인은 라피: 레드 후드의 유연 버스트 누락이었다(타워 elysion 클리어의 20.8%가 후보에서 빠져 있었다). ⚠️ 버스트 **순환 속도**는 판정하지 않고 참고로만 찍는다 — PvP 등록 조합의 95%가 20초 주기로 안 돌아서, 그걸 판정에 넣으면 검증된 조합을 무효로 만든다 |
| `testCharacterNames.mjs` | **26건 통과** | 언어별 표기, 폴백, 3개국어 검색, 로스터 전수(현재 170명) |
| `testGlossary.mjs` | **35건 통과** | 번역 시 이름 보호 치환(`⟦N⟧`) |
| `testDexUsage.mjs` | **전부 통과 · 조합 214건 · 데이터가 붙는 캐릭터 98/198명** | 도감 "실사용 데이터" 절의 집계. 198명 **전원**을 원본 JSON에서 다시 세어 대조한다 — 이 절은 데이터가 없으면 안 그리는 설계라 집계가 통째로 실패해도 화면이 멀쩡해 보인다 |
| `testDataI18n.mjs` | **퇴행 없음** (남은 backlog: squad 62 · desc_ja 9 · desc_kr 6 · 보스명 5. 아키타입 name·note는 483/483 완료) | 화면에 나가는 **데이터**가 사이트 언어와 맞는가. `testI18n`은 UI 라벨만 봐서 "한국어 화면인데 조합 이름·설명이 영어"를 24건 통과하는 동안 놓쳤다. **래칫이다 — EXPECTED보다 늘면 ERROR, 줄면 숫자를 낮추라고 알린다** |
| `testTraffic.mjs` | **전부 통과 · 계측 대상 경로 207개** | 자체 방문 계측의 경로·봇 판정. 계측은 **조용히 안 쌓인다** — 경로 판정이 막으면 표가 비고, 봇을 못 거르면 크롤러가 203페이지를 훑어 "인원 대비 로딩" 비율이 무의미해진다. DB 없이 검사할 수 있게 `lib/traffic.js`로 순수 로직을 뗐다 |
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

⚠️ **빌드한 뒤에 `npm run dev`를 돌리면 `.next`가 개발 산출물로 덮여 정적 HTML이 사라진다.**
그러면 `checkCanonical`이 "빌드 산출물 없음"으로 **203건 전부 ERROR**를 낸다. 회귀처럼 보이지만
아니다 — 다시 `next build` 하면 ERROR 0으로 돌아온다. 2026-08-27에 실제로 놀랐다.

```bash
npx next build && npm run check:canonical
```

| 스크립트 | 기준선 | 무엇을 보는가 |
|---|---|---|
| `checkCanonical.mjs` | **ERROR 0 / 203개** | 사이트맵에 실리는 주소마다 자기 자신을 가리키는 canonical이 있는가 |

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
