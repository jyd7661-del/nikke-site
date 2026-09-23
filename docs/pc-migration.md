# 미니 PC로 이관하기 (2026-09-24)

메인 PC에서 돌리던 클로드 작업을 새 미니 PC로 옮긴다. **git에 없는 것**이 핵심이다 —
저장소는 GitHub에서 다시 받으면 되지만, 아래 표의 것들은 이 PC에만 있고 잃으면 되살릴 수 없거나 조용히 멈춘다.

> 옛 이관 문서 `docs/claude-code.md`는 Cowork → 클로드 코드 이관(2026-08-12) 기록이다. 이 문서와 다르다.

## 1. 옮길 것 — 전부 `Desktop\Claude\nikke\` 한 폴더에 모아 뒀다

**가장 간단한 방법: `C:\Users\정연도\Desktop\Claude\nikke\` 폴더를 통째로 복사한다**(`node_modules`·`.next`는 빼도 된다 — 새 PC에서 다시 설치).
GitHub에서 새로 clone하면 아래 ①②가 **빠진다.**

| # | 무엇 | 현재 위치 | git에 있나 | 잃으면 |
|---|---|---|---|---|
| ① | **`.env.local`** — Supabase 키 · `ANTHROPIC_API_KEY`(로컬 실험용, 09-21 발급) | `nikke-site-git\nikke-site\.env.local` | ❌ (gitignore) | 로컬 실험·dev 서버 불가. Supabase 키는 대시보드에서, Anthropic 키는 새로 발급 |
| ② | **`probe-data\`** 85파일 6.2MB — 판정 파일(`thin-judgments-*.txt`), 실험 기록, 재판정 | `nikke-site-git\nikke-site\probe-data\` | ❌ (gitignore) | ⚠️ **`testJudgmentMatch`(일치율 71.8%)의 정답지가 사라진다.** 되살릴 방법 없음 |
| ③ | **클로드 메모리** 14파일 | `C:\Users\정연도\.claude\projects\C--Users-----Desktop-Claude-nikke\memory\` → 사본 `_이관\claude-memory\` | ❌ | 유저 지시(자동 푸시·판단 위임 등)를 새 세션이 모른다 |
| ④ | **주간 데이터 조사** 예약 작업 지시서 (Cowork, 매주 월 10:04) | `C:\Users\정연도\Claude\Scheduled\nikke-site-data-research\SKILL.md` → 사본 `_이관\scheduled-cowork\` | ❌ | 주간 조사가 멈춘다. `checkWeeklyReport`가 9일 뒤 경고 |
| ⑤ | **주간 점검** 윈도우 작업 스케줄러 `니케 주간 점검`(매주 월 10:00) | 작업 스케줄러 → 내보낸 XML `_이관\windows-task\` | ❌ (실행 파일 `scripts\weekly-check.cmd`는 git에 있다) | 주간 점검이 멈춘다 |
| ⑥ | 클로드 코드 사용자 설정 | `C:\Users\정연도\.claude\settings.json` → 사본 `_이관\claude-user-settings.json` | ❌ | 테마 정도. 중요도 낮음 |

git에 이미 있는 것(다시 안 챙겨도 됨): `CLAUDE.md` · `docs\` · `.claude\`(rules·skills·settings) · `reports\`(주간 보고서) · 스크립트 전부.
상위 폴더 `Desktop\Claude\nikke\`의 `CLAUDE.md`·`docs\`는 **읽기 전용 사본**이다(CLAUDE.md "세션 시작 시" 참고).

## 2. 새 PC에서 할 일 — 순서대로

### 2-1. 설치
- **Node.js** — 지금 v24.19.0. ⚠️ **기본 경로 `C:\Program Files\nodejs\`에 설치할 것** — `weekly-check.cmd`가 이 절대 경로를 쓴다(예약 실행은 PATH가 다르다)
- **Git for Windows** — 지금 2.55. 없으면 클로드의 셸이 PowerShell로 폴백해 `docs/`의 예제 명령이 안 돈다
- **Claude 데스크톱 앱** + 같은 계정 로그인(`jyd7661@gmail.com`). Code 탭과 Cowork(예약 작업)가 여기 있다
- **Chrome + Claude in Chrome 확장** — enikk·Search Console은 이걸로 한다(내장 브라우저에선 enikk 본문이 빈다, 2026-09-21)

### 2-2. 폴더 놓기
- **같은 경로 `C:\Users\<이름>\Desktop\Claude\nikke\`에 두는 것을 권한다.** 경로가 같으면 ③④⑤를 거의 그대로 쓸 수 있다
- 복사 뒤 `nikke-site-git\nikke-site`에서 `npm ci`
- `git status`가 0인지, `git push`가 되는지 확인. 처음 push 때 GitHub 로그인 창이 뜬다(Git Credential Manager) — **유저가 직접 로그인**

### 2-3. 클로드 메모리(③) 되살리기
메모리 폴더 이름은 **프로젝트 경로에서 만들어진다**(`C:\Users\정연도\Desktop\Claude\nikke` → `C--Users-----Desktop-Claude-nikke`, 한글은 `-`로 바뀐다).
사용자 이름이나 폴더 위치가 다르면 이름도 달라진다. 그래서:
1. 새 PC에서 `Desktop\Claude\nikke` 폴더로 클로드 세션을 **한 번 연다**
2. `C:\Users\<이름>\.claude\projects\`에 새로 생긴 폴더를 찾는다
3. 그 안에 `memory\`를 만들고 `_이관\claude-memory\*`를 복사한다
4. 새 세션에서 "메모리 읽었어?"로 확인

### 2-4. 주간 점검(⑤) 되살리기
```powershell
schtasks /Create /TN "니케 주간 점검" /XML "C:\Users\<이름>\Desktop\Claude\nikke\_이관\windows-task\니케 주간 점검.xml"
```
- XML 안에 **사용자 이름과 경로가 박혀 있다**(`C:\Users\정연도\...`, 로그 `...\AppData\Local\Temp\nikke-weekly.log`). 다르면 먼저 고친다
- 미니 PC가 월요일 10시에 **켜져 있어야** 돈다(잠자기면 안 돈다). 절전 설정 확인
- 확인: `schtasks /Run /TN "니케 주간 점검"` → 로그 파일에 `exit code` 줄

### 2-5. 주간 데이터 조사(④) 되살리기
Cowork 예약 작업은 **데스크톱 앱이 이 PC에 저장**한다. 계정을 따라오지 않는다.
1. 새 PC 데스크톱 앱에서 Cowork 예약 작업을 새로 만든다 — 이름 `nikke-site-data-research`, 매주 월 10:04
2. 지시문은 `_이관\scheduled-cowork\nikke-site-data-research\SKILL.md`를 붙여넣는다
3. ⚠️ **이 지시서는 낡았다(2026-08-08 마지막 수정)** — 새로 만들 때 고칠 것:
   - 로컬 클론 경로가 `C:\Users\정연도\Desktop\nikke-site-git\` — **지금은 `Desktop\Claude\nikke\nikke-site-git\`**
   - 배포 주소가 `nikke-site.vercel.app` — **지금은 `nikketeamguide.com`**
   - 캐릭터 수 196명 — 지금 200명

### 2-6. 계정·연결 확인(파일이 아니라 로그인으로 따라오는 것)
| 무엇 | 확인 방법 |
|---|---|
| Supabase | claude.ai 커넥터로 붙는다(메모리 `nikke-env-facts`). 새 세션에서 테이블 목록 조회가 되는지. 저장소 `.mcp.json` 쪽은 `SUPABASE_ACCESS_TOKEN`이 없어 안 붙는다(원래도 그랬다) |
| Vercel | GitHub push → 자동 배포. 로컬 CLI 연결(`.vercel\`)은 없다 — 할 일 없음 |
| Search Console · 애드센스 | Chrome에서 로그인. 애드센스는 **다른 구글 계정**(authuser=1) |
| Anthropic 콘솔 | 로컬 키(①)는 **만료 30일 권장으로 발급했다** — 만료되면 새로 발급해 `.env.local`에 |

### 2-7. 끝났는지 확인
```bash
cd nikke-site-git/nikke-site
npm run verify                        # 전부 통과
node scripts/testJudgmentMatch.mjs    # 일치 28/39 = 71.8% — probe-data(②)가 왔는지
node scripts/checkWeeklyReport.mjs    # 보고서 상태
```
`testJudgmentMatch`가 판정 파일을 못 찾으면 ②가 안 온 것이다.

## 3. 메인 PC는

새 PC에서 2-7까지 통과하면 메인 PC의 **작업 스케줄러 `니케 주간 점검`과 Cowork 예약 작업을 끈다.**
두 PC에서 동시에 돌면 주간 조사가 같은 파일을 두 번 고치고 보고서가 겹친다.
