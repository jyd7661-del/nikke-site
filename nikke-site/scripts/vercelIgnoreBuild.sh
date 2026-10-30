#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand) — 2026-10-30
#
# 종료 코드 0 = 이번 배포를 건너뛴다 · 1 = 빌드한다.
# 2026-10-30 Vercel 메일: 무료 팀 배포 저장 공간(10GB) 75% 사용. 배포 하나가 약 60MB(미리 만든 도감 609쪽)이고
# Vercel은 옛 배포를 지우지 않는다. 10월 커밋 115개 중 46개는 문서·검사 스크립트·SQL 기록만 바꿨는데 전부 배포됐다.
#
# 마지막으로 배포된 커밋(VERCEL_GIT_PREVIOUS_SHA)과 지금 사이에 사이트에 실리는 파일이 하나도 안 바뀌었을 때만 건너뛴다.
# HEAD^와 비교하지 않는다 — 코드 커밋과 문서 커밋을 한 번에 푸시하면 코드가 배포되지 않는다.
# 판단할 수 없으면(이전 SHA가 없음, 얕은 복제에 그 커밋이 없음, git 오류) 항상 빌드한다.
# 사이트 코드는 scripts/·supabase/·probe-data/를 불러오지 않는다(@supabase/supabase-js 패키지는 node_modules).
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$prev" ]; then echo "이전 배포 SHA 없음 → 빌드"; exit 1; fi
if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then echo "이전 배포 커밋 ${prev}이 복제본에 없음 → 빌드"; exit 1; fi
git diff --quiet "$prev" HEAD -- . ':(exclude)scripts' ':(exclude)supabase' ':(exclude)probe-data'
rc=$?
if [ "$rc" -eq 0 ]; then echo "사이트 파일 변화 없음(${prev:0:7}..HEAD) → 배포 건너뜀"; exit 0; fi
echo "사이트 파일 바뀜 → 빌드"; exit 1
