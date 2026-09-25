#!/usr/bin/env bash
# 주간 AI 조사 실행기 — 미니 PC WSL cron이 부른다(2026-09-24~). 클로드 코드를 사람 없이 띄운다.
# 지시서 본문은 docs/weekly-research-prompt.md. 규칙은 거기서 고친다.
#
# weekly-check.sh(10:00, 코드만, 데이터 안 건드림)가 먼저 돌고, 이것이 10:30에 그 보고서를 이어받는다.
# 데이터 파일은 고치지만 git은 쓰지 않는다 — 다음 대화 세션이 reports/YYYY-MM-DD.md와 diff를 보고 커밋한다.
#
# ⚠️ 이 폴더는 클로드 코드의 "신뢰된 작업 폴더"가 아니라 .claude/settings.json의 allow·deny가 무시된다.
#    그래서 권한을 여기서 전부 명시한다(.env 읽기 차단 포함).
#
# crontab:
#   30 10 * * 1 /bin/bash /home/jyd7661/projects/nikke/nikke-site-git/nikke-site/scripts/weekly-research.sh >> $HOME/nikke-research.log 2>&1

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$HOME/.local/bin:$PATH"
command -v node >/dev/null || { echo "[$(date '+%F %T')] node 없음 — nvm 확인"; exit 127; }
command -v claude >/dev/null || { echo "[$(date '+%F %T')] claude 없음"; exit 127; }

cd "$(dirname "$0")/../.." || exit 1   # 저장소 루트

ALLOW=(
  Read Edit Write Glob Grep WebFetch WebSearch
  "Bash(node:*)" "Bash(npm run verify)" "Bash(npx next build)"
  "Bash(curl:*)" "Bash(sleep:*)" "Bash(cd:*)" "Bash(ls:*)" "Bash(grep:*)" "Bash(wc:*)" "Bash(date:*)"
  "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)"
)
DENY=(
  "Read(./.env)" "Read(./.env.*)" "Read(./nikke-site/.env)" "Read(./nikke-site/.env.*)"
  "Bash(git commit:*)" "Bash(git push:*)" "Bash(git add:*)" "Bash(git checkout:*)" "Bash(git reset:*)" "Bash(rm:*)"
)

echo "[$(date '+%F %T')] weekly research start"
timeout 90m claude -p "docs/weekly-research-prompt.md 를 읽고 그대로 수행하라. 오늘은 $(date +%F)이다." \
  --allowedTools "${ALLOW[@]}" --disallowedTools "${DENY[@]}"
RC=$?
echo "[$(date '+%F %T')] exit code $RC"
ls -1 reports/"$(date +%F)".md 2>/dev/null || echo "[$(date '+%F %T')] ⚠️ 보고서가 안 생겼다"
exit $RC
