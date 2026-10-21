#!/usr/bin/env bash
# 사이트 현황 자동 보고 실행기 — 미니 PC WSL cron이 부른다(2026-10-22~, 유저: "오전 9시랑 오후 9시에").
# 지시서 본문은 docs/site-report-prompt.md. 규칙은 거기서 고친다.
#
# 인자: am | pm  (생략하면 시각으로 정한다 — 15시 전이면 am)
# 결과: nikke-site/probe-data/site-reports/<날짜>-<am|pm>.md (git 밖). 메일은 안 보낸다(2026-10-22 유저: "메일로 하지말고 여기다가") —
#       대화 세션의 예약 작업이 09:17·21:17에 이 파일을 읽어 대화창에 올린다.
# DB는 claude.ai Supabase 커넥터로 읽는다 — .env.local에 service_role 키가 없어 로컬 스크립트로는 못 읽는다.
#
# ⚠️ 이 폴더는 클로드 코드의 "신뢰된 작업 폴더"가 아니라 .claude/settings.json의 allow·deny가 무시된다.
#    그래서 권한을 여기서 전부 명시한다(.env 읽기 차단 포함). Bash는 주지 않는다.
#    ⚠️ Edit를 deny에 넣으면 Write까지 막힌다(같은 규칙을 쓴다) — 2026-10-22 첫 시험에서 보고서가 안 써졌다. 쓰기는 보고서 폴더만 allow.
#
# crontab:
#   5 9  * * * /bin/bash /home/jyd7661/projects/nikke/nikke-site-git/nikke-site/scripts/site-report.sh am >> $HOME/nikke-site-report.log 2>&1
#   5 21 * * * /bin/bash /home/jyd7661/projects/nikke/nikke-site-git/nikke-site/scripts/site-report.sh pm >> $HOME/nikke-site-report.log 2>&1

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$HOME/.local/bin:$PATH"
command -v claude >/dev/null || { echo "[$(date '+%F %T')] claude 없음"; exit 127; }

cd "$(dirname "$0")/../.." || exit 1   # 저장소 루트

SLOT="${1:-}"
[ -z "$SLOT" ] && { [ "$(date +%H)" -lt 15 ] && SLOT=am || SLOT=pm; }
OUT="nikke-site/probe-data/site-reports/$(date +%F)-$SLOT.md"
mkdir -p "$(dirname "$OUT")"
[ -f "$OUT" ] && { echo "[$(date '+%F %T')] $OUT 이미 있음 — 건너뜀"; exit 0; }

ALLOW=(
  Read Glob Grep
  "Write(nikke-site/probe-data/site-reports/**)" "Edit(nikke-site/probe-data/site-reports/**)"
  "mcp__claude_ai_Supabase__execute_sql"
)
DENY=(
  "Read(./.env)" "Read(./.env.*)" "Read(./nikke-site/.env)" "Read(./nikke-site/.env.*)"
  Bash "mcp__claude_ai_Supabase__apply_migration"
)

echo "[$(date '+%F %T')] site report $SLOT start"
timeout 20m claude -p "docs/site-report-prompt.md 를 읽고 그대로 수행하라. 회차는 $SLOT, 오늘은 $(date +%F)(한국 시각 $(date +%H:%M))이다. 보고서 경로는 $OUT 이다." \
  --model sonnet --allowedTools "${ALLOW[@]}" --disallowedTools "${DENY[@]}" < /dev/null
RC=$?
echo "[$(date '+%F %T')] exit code $RC"
[ -f "$OUT" ] || echo "[$(date '+%F %T')] ⚠️ 보고서가 안 생겼다"
exit $RC
