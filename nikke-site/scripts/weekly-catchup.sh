#!/usr/bin/env bash
# 주간 작업 따라잡기 — 월요일 10:00·10:30에 PC·WSL이 꺼져 있었으면 그 주에 한 번 대신 돌린다(2026-10-08~).
#
# 왜: cron은 놓친 작업을 나중에 돌리지 않는다. 2026-10-05(월)에 WSL이 11:13에 켜져 코드 점검·AI 조사가 둘 다 건너뛰어졌다.
# 매시 17분에 이 스크립트가 돈다. 이번 주 월요일 보고서(reports/<월요일>-auto.md · reports/<월요일>.md)가 없고
# 예정 시각이 지났으면 그 작업을 돌린다(코드 점검 → AI 조사 순, AI 조사는 코드 점검 보고서를 이어받는다).
#
# 한 주에 작업마다 **한 번만** 시도한다(~/.nikke-catchup/<월요일>-<작업>). 실패해서 보고서가 안 생겨도 매시간 다시 돌지 않는다 —
# AI 조사는 claude -p라 사용량이 든다. 정규 cron과 겹치지 않게 flock으로 막는다.
# 유저(2026-10-08): "예약만 켜놔" — 이미 놓친 10/5 주는 돌리지 않고 START 주부터 적용한다.
#
# crontab:
#   17 * * * * /bin/bash /home/jyd7661/projects/nikke/nikke-site-git/nikke-site/scripts/weekly-catchup.sh >> $HOME/nikke-catchup.log 2>&1

START=2026-10-12
DIR="$(cd "$(dirname "$0")" && pwd)"
REPORTS="$DIR/../../reports"
STATE="$HOME/.nikke-catchup"
mkdir -p "$STATE"

exec 9>"$STATE/lock"
flock -n 9 || exit 0

# 이번 주 월요일(오늘이 월요일이면 오늘)
dow=$(date +%u)
MON=$(date -d "-$((dow - 1)) days" +%F)
[[ "$MON" < "$START" ]] && exit 0
now=$(date +%s)

run_if_missed() { # $1=작업 이름 $2=보고서 파일 $3=예정 시각(HH:MM) $4=스크립트 $5=로그
  local due; due=$(date -d "$MON $3" +%s)
  (( now < due + 600 )) && return 0                 # 예정 시각 + 10분 전이면 정규 cron 몫
  [[ -f "$REPORTS/$2" ]] && return 0                # 이미 돌았다
  [[ -f "$STATE/$MON-$1" ]] && return 0             # 이번 주에 이미 한 번 시도했다
  touch "$STATE/$MON-$1"
  echo "[$(date '+%F %T')] $1 놓침($MON $3) → 따라잡기 실행"
  /bin/bash "$DIR/$4" >> "$5" 2>&1
  echo "[$(date '+%F %T')] $1 끝 exit $? · 보고서 $( [[ -f "$REPORTS/$2" ]] && echo 있음 || echo 없음 )"
}

run_if_missed check "$MON-auto.md" 10:00 weekly-check.sh "$HOME/nikke-weekly.log"
run_if_missed research "$MON.md" 10:30 weekly-research.sh "$HOME/nikke-research.log"
