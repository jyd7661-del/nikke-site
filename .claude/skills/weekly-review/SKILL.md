---
description: 월요일 주간 보고서 2종(코드 점검 -auto, AI 조사)을 처리한다 — AI 조사가 고친 파일 diff 확인·커밋, 확인 항목 판단, reviewed.json 표시. checkWeeklyReport가 "미처리 보고서"를 띄우면 쓴다.
---

# 주간 보고서 처리 (`/weekly-review`)

두 실행기(미니 PC WSL cron, `docs/weekly-research.md`):

| 보고서 | 실행기 | 데이터 |
|---|---|---|
| `reports/YYYY-MM-DD-auto.md` | `weekly-check.sh` 월 10:00 | 안 건드림 — 찾아내기만 |
| `reports/YYYY-MM-DD.md` | `weekly-research.sh` 월 10:30 (`claude -p`) | **A등급만 고치고 커밋 안 함** |

## 1. 상태

```bash
cd nikke-site
node scripts/checkWeeklyReport.mjs          # 멈춤·미처리
git status --short                          # AI 조사가 남긴 변경
tail -5 ~/nikke-weekly.log ~/nikke-research.log
```

"멈췄을 수 있습니다"면 `crontab -l`과 로그부터. WSL이 그 시각에 꺼져 있었으면 건너뛴다(수동 실행: `bash scripts/weekly-check.sh`).

## 2. AI 조사 보고서 — 1절(파일에 반영한 것)부터

- `git diff`로 보고서 1절과 **실제 변경이 같은지** 본다. 보고서에 없는 변경이 있으면 그 파일은 커밋하지 말고 원인을 적는다
- 신규 캐릭터를 넣었으면 `/new-character`의 4단계(검사·빌드)를 다시 돌린다
- `npm run verify` 통과 → **파일을 이름으로** 커밋(`git add -A` 금지) · 푸시
- 제안 절(티어 판정·유튜버·커뮤니티)은 B등급 — 반영할 것만 골라 따로 작업. 티어 판정은 `data/tierSources.json` 규칙대로 하고 `data/tierJudgments.json`에 기록
- `reports/research-state.json`의 유튜브 백로그 구간이 말이 되는지(채널별 `monthsAgo`) 본다

## 3. 코드 점검 보고서

- 신규 캐릭터 "추가 가능" → `/new-character`
- prydwen 티어 어긋남 → 출처 대조 후 `tierJudgments.json`(2026-09-24 사쿠라·네온:VE 판정 참고 — `docs/log/2026-09.md`)
- 신선도 경고 — enikk 표(`metaStats.*`)는 화면에서 옮겨야 한다(자동 수집기 금지). 사람 또는 브라우저 세션 몫으로 open-items에

## 4. 닫기

- `reports/reviewed.json`: `reviewed`에 날짜(그날 두 보고서 모두 처리) 또는 `YYYY-MM-DD-auto`(하나만), 그리고 `"YYYY-MM-DD": "종결(날짜). 한두 줄 요약"`
- 지시서를 고칠 일이 생겼으면 `docs/weekly-research-prompt.md`(무인 실행이 읽는 본문)
- `docs/log`에 한 절, 커밋·푸시
