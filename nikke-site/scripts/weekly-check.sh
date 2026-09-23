#!/usr/bin/env bash
# 주간 자동 점검 실행기 — 미니 PC WSL의 cron이 부른다(2026-09-24~).
# 윈도우 작업 스케줄러용 weekly-check.cmd의 리눅스판. 점검 로직은 weeklyCheck.mjs에 있다.
#
# cron은 로그인 셸이 아니라 PATH에 nvm의 node·npm이 없다. weeklyCheck.mjs가 안에서
# `npm run verify`를 부르므로 nvm을 여기서 직접 불러온다.
#
# 종료 코드: 0 = 볼 것 없음, 1 = 발견 있음, 2 = 출처 접근 불가, 127 = node 없음.
#
# crontab:
#   0 10 * * 1 /home/jyd7661/projects/nikke/nikke-site-git/nikke-site/scripts/weekly-check.sh >> $HOME/nikke-weekly.log 2>&1

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
command -v node >/dev/null || { echo "[$(date '+%F %T')] node 없음 — nvm 확인"; exit 127; }

cd "$(dirname "$0")/.." || exit 1

echo "[$(date '+%F %T')] weekly check start"
node scripts/weeklyCheck.mjs --report
RC=$?
echo "[$(date '+%F %T')] exit code $RC"
exit $RC
