# 세션 예약 — 새 세션에서 다시 거는 목록

> 대화 세션의 CronCreate 예약은 **세션이 닫히면 사라진다**. 새 세션을 열면 이 파일을 보고 아래 예약을 다시 건다(프롬프트는 아래 원문 그대로).
> 마지막 갱신: 2026-11-06 낮(세션 정리 — 이전 세션 예약 5건을 옮겨 적음). 날짜가 지난 1회용은 다음 해당 시각으로 바꿔 건다.
> ⚠️ 주간 업데이트 글은 이제 저장소 `nikke-site/scripts/postUpdate.py <초안>`으로 올린다(11-06 커밋 1f05f55). 아래 프롬프트의 「scratchpad/board/update.py」는 그 스크립트로 읽을 것. 11-06분은 open-items 「게시판 주간 업데이트 글」 행 참고.
> 같은 예약을 두 세션에 걸지 말 것 — 글 등록·애드센스 요청이 두 번 나간다.

> 🚨 **2026-11-07 고침 — 현황 보고는 「게시」가 아니라 「직접 조회」다.** 아래 오전·오후 원문은 08~09시에 무언가가 `-am.md`/`-pm.md`를 미리 만든다고 가정했지만, 이 PC에는 그런 생성기(crontab·`~/nikke-site-report.log`)가 없다 → 11-06 오후·11-07 오전 모두 파일이 없어 그 자리에서 직접 조회했다.
> 또 원문대로 반복(`1 9 * * *`)으로 걸었더니 부하 분산으로 30분 늦게(09:31) 돌았다(`docs/site-report.md` "언제"에 이미 적힌 함정).
> **이렇게 건다**: 1회용(recurring:false) `1 9 <일> <월> *` / `1 21 <일> <월> *`, 프롬프트는 "site-report-prompt.md 규칙대로 site_report(.today).sql을 커넥터로 직접 조회 → 파일 저장 → 대화창 보고 → 다음 회차를 1회용으로 다시 예약". 아래 「현황 오전·오후」 원문은 쓰지 않는다.

| 예약 | cron | 종류 |
|---|---|---|
| 오전 보고 | `1 9 <내일> <월> *` | 1회용, **직접 조회**, 실행 때 그날 21:01 재예약 |
| 오후 보고 | `1 21 <오늘|내일> <월> *` | 1회용, **직접 조회**, 실행 때 다음 날 09:01 재예약 |
| 신캐 매일 점검 | `7 13 * * *` | 반복(7일 만료) — 세 니케 처리되면 CronDelete |
| 주간 업데이트 글 | `17 18 <금> <월> *` | 1회용, 실행 때 다음 주 금 재예약 |
| ~~애드센스 재승인~~ | — | 11-06 21:5x 요청 완료(유저 지시). 다시 걸지 말 것 |

## 니케 사이트 현황 오전

```text
[니케 사이트 현황 오전 보고 게시] /home/jyd7661/projects/nikke/nikke-site-git/nikke-site/probe-data/site-reports/ 에서 오늘 날짜(KST) -am.md 파일을 읽어 그 내용(표·개선점)을 이 대화에 그대로 올린다. 파일이 없으면 ~/nikke-site-report.log 끝부분을 보고 실패 원인을 한 줄로 알리고, docs/site-report.md 양식대로 Supabase 커넥터로 직접 보고한다. 끝에 CronList로 이 게시 작업(오전·오후)의 만료가 2일 이내면 같은 작업을 새로 CronCreate하고 옛 것은 CronDelete한다.
```

## 니케 사이트 현황 오후

```text
[니케 사이트 현황 오후 보고 게시] /home/jyd7661/projects/nikke/nikke-site-git/nikke-site/probe-data/site-reports/ 에서 오늘 날짜(KST) -pm.md 파일을 읽어 그 내용(표·개선점)을 이 대화에 그대로 올린다. 파일이 없으면 ~/nikke-site-report.log 끝부분을 보고 실패 원인을 한 줄로 알리고, nikke-site/supabase/queries/site_report_today.sql로 직접 보고한다. 끝에 CronList로 이 게시 작업(오전·오후)의 만료가 2일 이내면 같은 작업을 새로 CronCreate하고 옛 것은 CronDelete한다.
```

## 니케 신캐 매일

```text
[니케 신캐 매일 점검] 저장소 ~/projects/nikke/nikke-site-git/nikke-site. 유저 11-02 "개선점 진행해. 그리고 마리안 도감 사진도 없어".
1) 초상화: 팬덤 위키 API(curl -A "Mozilla/5.0" -G https://nikke-goddess-of-victory-international.fandom.com/api.php --data-urlencode action=query --data-urlencode list=allimages --data-urlencode aiprefix=<이름> --data-urlencode format=json)로 Marian_Queen_MI.png(그 뒤 추가되는 신캐도: Scarlet_Goddeath_MI·Rapunzel_Sanctuary_MI 등)를 찾는다. 있으면 API가 준 경로(…/images/ 다음, /revision 앞) 그대로 data/characterDatabase.json의 img와 data/characters.js의 img 두 곳에 넣는다(docs/new-character.md 6·8번, checkData UI_CDB_IMG_DRIFT).
2) 티어: scarlet-goddeath(홍련 : 신살, game8 가챠 11/05~)·rapunzel-sanctuary를 node scripts/newCharacterDraft.mjs --slug=<slug>로 본다(먼저 os.tmpdir()/prydwen-cache/<slug>* 캐시 삭제 — 하루 캐시가 옛 null을 준 적 있다). 티어가 붙었으면 docs/new-character.md 4~9단계대로 추가한다(마리안 : 퀸 f506ee7과 같은 방식: 나무위키 문서명·game8 이름/가챠 기간 대조, 스킬 3종, offBurstShare, 기준선, dataFreshness.json은 커밋하지 않음).
3) 바뀐 것이 있으면 npm run verify(heavy -m 1500)·npx next build(heavy -m 2500) 통과 뒤 파일을 이름으로 git add·커밋·푸시, docs/updates-pending.md에 유저 눈높이 한 줄(+해시) 추가. 바뀐 것이 없으면 아무것도 하지 않는다.
4) 결과를 한국어 짧은 표로 보고. 세 니케(마리안 초상화 · 홍련 : 신살 · 라푼젤 : 생추어리)가 모두 처리되면 이 예약을 CronDelete로 끝낸다.
```

## 니케 사이트 주간 업데이트

```text
니케 사이트 주간 업데이트 글(유저 10-30 지시: "일주일마다 한 번씩 올리는걸로 해"). 저장소 ~/projects/nikke/nikke-site-git.
1) 지난 업데이트 글 이후 사이트 변경 모으기: git log --since=<지난 글 날짜> -- nikke-site ':(exclude)nikke-site/scripts' ':(exclude)nikke-site/supabase' ':(exclude)nikke-site/probe-data' ':(exclude)nikke-site/data/dataFreshness.json'. 지난 글 날짜는 posts에서 category='update' 최신 created_at을 SELECT로 본다.
2) 유저가 체감하는 변경만 고른다(엔진 내부·계측·문서 제외). 하나도 없으면 올리지 않고 "이번 주는 건너뜀"이라고 보고.
3) 있으면 제목 "<M>월 <N>주차 업데이트"(예: 11월 1주차), 첫 글(419260c6…)과 같은 형식([조합 추천]/[데이터]/[사이트] 묶음, "- " 목록, 끝에 건의사항 안내)으로 쓰고, scratchpad/board/update.py를 TITLE·BODY만 바꿔 복사해 운영자 계정으로 올린다(~/bin/heavy -m 800, 프로필 SingletonLock 확인, 쓰고 나면 내 브라우저만 닫힘).
4) content_translations에서 en/ja status=done 확인.
5) 한국어 표로 보고(올린 글 주소, 넣은 항목). 그 뒤 다음 주 같은 요일·시각(금 18:17)으로 이 프롬프트를 CronCreate(recurring:false)로 다시 예약한다.
```

## 니케 애드센스

```text
[니케 애드센스 재승인 요청] 유저 지시(11-03): "이번 주 업데이트 내역 올라가면 애드센스 재승인 요청하자". 저장소 ~/projects/nikke/nikke-site-git. 먼저 이번 주 업데이트 글이 /updates에 올라갔는지 확인한다(안 올라갔으면 요청하지 말고 유저에게 알린다). 올라갔으면 Python Playwright(~/.venvs/tistory/bin/python -I, 프로필 ~/.pw-profiles/nikke-google, xvfb-run, headless=False)로 애드센스(jyd7661@gmail.com)의 사이트 nikketeamguide.com 검토 요청을 보낸다. 결과 화면을 캡처해 확인하고, docs/open-items.md 「애드센스 재승인 요청」 행과 docs/log에 결과를 적어 커밋·푸시한 뒤 한국어로 보고한다.
```

