# 미니 PC 이관 — 완료(2026-09-24~25)

메인 PC(윈도우)에서 미니 PC의 WSL로 옮겼다. 다음에 PC를 또 옮길 때 핵심은 **git에 없는 것**이다 —
저장소는 GitHub에서 다시 받으면 되지만, 아래 표의 것들은 이 PC에만 있고 잃으면 되살릴 수 없거나 조용히 멈춘다.

(2026-09-27 정리: 윈도우 설치 순서·`_이관/` 묶음·Cowork 예약 작업 재생성 절차 — git 이력 참고. `_이관/` 백업은 `~/staging/Claude/nikke`)

## git 밖에 있어 PC와 함께 옮겨야 하는 것

| 무엇 | 위치 | 잃으면 |
|---|---|---|
| **`.env.local`** — Supabase 키 · `ANTHROPIC_API_KEY`(로컬 실험용) | `nikke-site/.env.local` (gitignore) | 로컬 실험·dev 서버·무인 AI 조사 불가. Supabase 키는 대시보드에서, Anthropic 키는 새로 발급 |
| **`probe-data/`** — 판정 파일(`thin-judgments-*.txt`), 실험 기록, 재판정 | `nikke-site/probe-data/` (gitignore) | ⚠️ **`testJudgmentMatch`의 정답지가 사라진다. 되살릴 방법 없음** |
| **클로드 메모리** | `~/.claude/projects/<프로젝트 경로에서 만든 이름>/memory/` | 유저 지시(자동 푸시·판단 위임 등)를 새 세션이 모른다. 폴더 이름이 경로에서 만들어지므로 새 PC에서 세션을 한 번 연 뒤 생긴 폴더에 복사 |
| crontab 두 줄 | `crontab -l` | 주간 작업이 멈춘다(`checkWeeklyReport`가 경고). 내용은 아래 표 |

git에 이미 있는 것(다시 안 챙겨도 됨): `CLAUDE.md` · `docs/` · `.claude/`(rules·skills·settings) · `reports/` · 스크립트 전부(`weekly-check.sh`·`weekly-research.sh` 포함).

## 지금 어디에 있나

| 무엇 | 값 |
|---|---|
| 저장소 | `~/projects/nikke/nikke-site-git` (윈도우 `C:\Users\jyd76\OneDrive\Desktop\claude\nikke\`로 가는 심볼릭 링크) |
| 상위 폴더 `~/projects/nikke/` | 저장소를 가리키는 짧은 `CLAUDE.md`만. docs 사본 없음 |
| Node | WSL nvm(v24). 셸마다 `export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh`. 윈도우 쪽엔 Node 없음 |
| 주간 코드 점검 | cron 월 10:00 `scripts/weekly-check.sh` → `reports/YYYY-MM-DD-auto.md`, 로그 `~/nikke-weekly.log` |
| 주간 AI 조사 | cron 월 10:30 `scripts/weekly-research.sh`(`claude -p`) → `reports/YYYY-MM-DD.md`, 로그 `~/nikke-research.log`. 커밋 안 함 |
| Supabase | claude.ai Supabase 커넥터(MCP) |
| Vercel | GitHub push → 자동 배포. 로컬 CLI 연결 없음 |
| Search Console · 애드센스 · enikk | Chrome(Claude in Chrome). 애드센스는 **다른 구글 계정**(authuser=1) |

WSL이 월요일 10시에 켜져 있어야 cron이 돈다. 자세한 것은 `docs/weekly-research.md`.

## 옮긴 뒤 확인

```bash
cd ~/projects/nikke/nikke-site-git/nikke-site
npm ci && npm run verify              # 전부 통과
node scripts/testJudgmentMatch.mjs    # 판정 파일을 못 찾으면 probe-data/가 안 온 것
node scripts/checkWeeklyReport.mjs    # 보고서 상태
```

## 남은 일 — 사람이 해야 함

- [ ] **옛 메인 PC의 작업 스케줄러 `니케 주간 점검` 끄기.** 두 PC에서 동시에 돌면 보고서가 겹친다.
  옛 PC의 관리자 명령 프롬프트에서:
  ```
  schtasks /Change /TN "니케 주간 점검" /DISABLE
  ```
