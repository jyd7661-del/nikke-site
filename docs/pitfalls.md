# 개발 환경의 함정 (실제로 겪은 것들)

> ⚠️ **이 문서의 대부분은 Cowork 샌드박스의 제약이다.** 클로드 코드로 이관하면
> (내 컴퓨터에서 직접 도는 네이티브 환경이므로) npm 차단·파일 삭제 불가·git 락·CRLF 노이즈가
> 전부 사라진다. 이관 후에는 **"과거에 왜 이렇게 우회했는지"의 기록**으로만 읽으면 된다.
> → `docs/claude-code.md`

> `HANDOFF.md`에서 분리했습니다(2026-08-12). 왜 그렇게 만들었는지와
> 어떤 함정을 밟았는지가 핵심입니다. 코드만 보면 알 수 없는 내용입니다.

---

### ✅ 커밋은 금지가 아닙니다 — 방법이 정해져 있을 뿐입니다

혼동이 실제로 있었어서 먼저 적습니다. **일반 세션은 커밋·푸시를 정상적으로 합니다.**
금지된 것은 **샌드박스(bash)에서 `git` 명령을 직접 실행하는 것**뿐입니다.

```
파일 수정   →  Read/Write/Edit 또는 샌드박스 bash
커밋·푸시   →  GitHub Desktop을 computer-use로 조작 (Summary/Description 입력 후 Commit → Push origin)
```

이 방식으로 지금까지 20회 이상 배포했습니다. §7의 "예약 작업은 커밋하지 않는다"는
**백그라운드로 도는 예약 작업에만** 해당하는 규칙입니다.

| 함정 | 대응 |
|---|---|
| **npm registry 403 차단(기기 쪽)** | 사용자 컴퓨터 VM에서는 `npm install` 불가. **단 클라우드 컨테이너에는 네트워크가 있어 `npm i esbuild` 로 JSX 문법 검증이 됩니다**(2026-08-09 확인). `device_stage_files`로 파일을 올린 뒤 `esbuild <파일> --loader:.js=jsx --outfile=/dev/null`. 문법만 보는 것이라 타입·런타임 오류는 여전히 Vercel 빌드에서만 잡힙니다 |
| **샌드박스에서 파일 삭제 불가** | `mcp__cowork__allow_cowork_file_delete` 호출로 권한 요청 |
| **샌드박스 git 사용 금지 — 조회 명령도 포함** | `.git/index.lock`이 남아 GitHub Desktop 커밋이 `Commit failed - A lock file already exists`로 막힙니다. **2026-08-09에 실제로 당했습니다** — `git log`/`git config`만 볼 생각이었는데 `git status`·`git diff`가 섞였고, 그게 도중에 중단되면서 락이 남았습니다. **`git` 은 조회용으로도 치지 마세요.** 상태 확인이 필요하면 GitHub Desktop 화면을 보거나, `cat .git/refs/heads/main` 과 `cat .git/refs/remotes/origin/main` 을 비교하세요(같으면 푸시 완료). **복구법**: 샌드박스는 파일 삭제가 안 되므로 `mv .git/index.lock .git/index.lock.stale` 로 치우면 됩니다 |
| **CRLF 문제** | 리눅스 쪽 `git status`가 전 파일을 수정됨으로 표시. GitHub Desktop은 정상 |
| **엔진을 node로 직접 못 부름** | `synergyEngine.js`의 JSON import에 `with { type: 'json' }`가 없음. 테스트할 땐 sed로 임시 복사본을 만들고 **끝나면 반드시 삭제** (한 번 커밋에 섞일 뻔함) |
| **`javascript_tool` 출력 차단** | `[BLOCKED: Cookie/query string data]`. 작은 파생 요약만 반환하세요 |
| **Chrome은 computer-use 불가** | tier "read". 브라우저 조작은 `mcp__claude-in-chrome__*` 사용 |

---

## 코워크 세션 간 화면 제어 순번 (이관하면 대부분 불필요)

사용자는 Cowork 세션 4개(`니케`/`배당앱`/`블로그`/`쇼츠`)를 같은 컴퓨터에 붙여 쓴다.
전부 **같은 리눅스 VM**이라 화면 제어(`computer_*`)가 충돌한다. 그래서 협조적 파일 락을 쓴다.

```bash
DL=$(ls -d /sessions/*/mnt/Downloads | head -1); cd "$DL"
bash cowork-lock.sh acquire "니케" "<하려는 작업>"   # ACQUIRED 면 진행, WAIT 면 대기
bash cowork-lock.sh renew   "니케" "<현재 단계>"     # 15분 넘는 작업이면 10분마다
bash cowork-lock.sh release "니케"                   # 끝나면 즉시
```

- `cowork-lock.sh`는 **수정 금지** — 4개 세션이 공유한다
- 화면 조작을 했다면 `release`와 함께 **`computer_release_lock` 도구도** 부른다.
  빼먹으면 다른 세션은 파일상 FREE인데 조작이 안 되는 상태가 된다
- **이미 락을 쥔 상태에서 `acquire`를 다시 부르지 말 것.** 자기 대기표가 맨 뒤로 재등록돼
  `WAIT`이 돌아온다. 실제 소유자는 여전히 나인데 오판하면 release를 안 하게 되고 15분 TTL까지 아무도 못 쓴다
- 작업 설명에 **큰따옴표를 넣지 말 것.** JSON이 깨져 작업명이 잘린다
- 스크립트 시험은 반드시 `/tmp` 사본에서. 실제 공유 파일에서 하면 남의 락이 지워진다
- 성공 판정은 종료코드가 아니라 **출력 문자열**(`ACQUIRED`/`WAIT`/`RELEASED`)로

> 클로드 코드에는 화면 제어가 없다. 이관 후 이 프로젝트에서 락이 필요한 상황은
> **`Downloads` 같은 공유 폴더를 건드릴 때**뿐이다.

### 화면 제어 권한은 만료된다 (교체가 아님)

승인 직후에는 3개가 동시에 살아 있었고 **20~40분 지나면 오래된 것부터 사라진다.** 저장 옵션은 없다.
→ 필요한 앱을 **한 번에 모아 승인받고 즉시 사용**할 것.

- GitHub Desktop은 **프로세스가 둘**이다. 런처와 `app-3.6.3\githubdesktop.exe`(실제 창 소유). 둘 다 필요
- 입력란 툴팁을 `textinputhost.exe`가 띄우며, 앞을 가리면 클릭이 막힌다
- **최소화된 창은 `computer_open_application`으로 복원되지 않는다.** 사용자가 직접 띄워야 한다

### 기기 워크스페이스가 죽으면

`device_bash`가 `Workspace unavailable`을 내면 셸만 죽은 것이고 `device_stage_files` /
`device_commit_files` / `device_list_dir`은 계속 된다. 파일 작업은 우회 가능하지만 **git·node는 못 돌린다.**

**복구법: 컴퓨터 재부팅.** 2026-08-11 밤에 1시간 넘게 안 살아났고 Claude 앱 재시작으로도
안 됐는데 재부팅하니 살아났다.

### 시각은 UTC로 온다

Vercel 배포 시각·API 응답이 전부 UTC다. 한국 시간은 **+9시간**.
`2026-08-11T01:52Z` = 한국 시간 **오전 10:52**. 이걸 착각해 대화 내내 날짜를 하루 밀려 말한 적이 있다.
