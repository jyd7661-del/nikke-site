---
description: 추천 엔진(lib/synergyEngine.js 등)을 고쳐 답이 바뀔 때 "이전 엔진 대비" 판정을 한다 — 스냅숏 전후 비교, 외부 지표, 판정 기록, 채택 기준. 엔진 규칙·정렬·점수·데이터 저울을 바꾸기 전에 쓸 것.
---

# 엔진 변경 판정 (`/engine-change`)

CLAUDE.md·`scripts/testJudgmentMatch.mjs` 머리 주석의 규칙: **엔진을 고쳐 답이 바뀐 건은 이전 엔진과 비교해 판정하고, 나아짐 > 나빠짐일 때만 채택한다.**
지표만 보고 채택했다가 퇴행한 기록이 있다(버퍼 0명 관문 — 일치율은 올랐는데 이전 대비 나빠짐 3·나아짐 1).

## 순서

```bash
cd nikke-site
node scripts/probeEngineChange.mjs --snap=before --mode=<pvp|bossing|campaign|tribe_tower|all>   # 1. 고치기 전
# 2. 엔진 수정
node scripts/probeEngineChange.mjs --snap=after --mode=<같은 모드>
node scripts/probeEngineChange.mjs --diff=before,after --label=<이름>   # 3. 바뀐 답 나란히 + 판정 틀
# 4. probe-data/engine-change-<이름>.md 를 읽고 probe-data/engine-change-<이름>-judg.txt 의 "?"를 + = - 로 (메모 한 줄)
node scripts/probeEngineChange.mjs --tally=<이름>                       # 5. 집계 → probe-data/rejudge-<이름>.json
```

스냅숏 한 번에 몇 분 걸린다(모드당 70건, WSL에서 /mnt/c 읽기). 백그라운드로 돌려도 된다.

## 판정할 때

- **외부 지표는 보조다.** 채용합(그 모드 enikk 채용률 합)·등록겹침(등록 실사용 조합과 최대 겹침)·속성팀(레이드: 그 약점 시즌 등록 25팀 등장 %)
  - ⚠️ 바꾼 규칙이 채용률을 쓰는 규칙이면 채용합은 **순환**이다 — 보지 말 것
  - ⚠️ 레이드는 **속성팀을 먼저** 본다. 2026-09-26에 전체 채용률로 "나빠짐"을 판정했다가 3건을 정정했다(목단·치사토는 그 속성 시즌 0회)
- 멤버의 스킬 원문을 확인해야 하면 `characterDatabase.json`에서 읽는다. 판정자는 클로드(유저 위임) — 근거를 메모에 남긴다
- PvP는 등록 상위 팀의 **공격형·버스트 분포**도 본다(공격형 1명 팀이 가장 흔하다 — 10/22)

## 채택 조건 (모두)

1. `--tally`가 나아짐 > 나빠짐
2. `npm run verify` 통과 · `node scripts/testRankerTeams.mjs` 중앙값이 안 깎임 · `node scripts/testJudgmentMatch.mjs` 확인(답이 바뀐 건은 "재판정 필요"로 빠진다)
3. 되돌아가지 않게 **검사를 추가하고 역테스트**(예: `testRealTeams`의 "PvP·레이드 등록 조합 낭비 0")

## 기록

- `docs/log/YYYY-MM.md` 맨 위에 절: 무엇을 왜 · 등록 조합 실측 · 이전 엔진 대비 표 · 나빠짐 건의 모양 · 가드 수치 · 검사와 역테스트
- `docs/open-items.md`의 "시스템 보완" 표에 한 줄
- 커밋 메시지에 이전 엔진 대비 수치와 가드를 적는다. `probe-data/`는 git 밖이다(판정 파일은 PC를 옮길 때 같이 옮긴다)
