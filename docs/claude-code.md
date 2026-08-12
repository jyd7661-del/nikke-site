# 클로드 코드로 업무 이관하기

Cowork에서 하던 이 프로젝트의 작업을 **클로드 코드(Claude Code)**로 옮기는 방법.
저장소 쪽 준비는 이미 끝나 있다(`CLAUDE.md`, `docs/`, `.claude/`, `.mcp.json`).
아래는 컴퓨터에서 한 번만 하면 되는 설정이다.

## 무엇이 달라지나

| | Cowork (지금) | 클로드 코드 (이관 후) |
|---|---|---|
| 실행 위치 | 클라우드 샌드박스 + 기기 브리지 | **내 컴퓨터에서 직접** |
| 파일 | `device_stage_files`로 복사해 작업 | 그냥 파일 |
| git | 커밋만 명령줄, **푸시는 GitHub Desktop** | `git push`까지 그대로 |
| `npm install` | 기기 쪽 registry 403으로 불가 | **된다** |
| 파일 삭제 | 불가 (`_to_delete/`로 이동) | **된다** |
| CRLF 노이즈 | `git status`에 30개 오탐 | 네이티브 git이라 사라짐 |
| 세션 순번 락 | 4개 세션이 화면을 다툼 | 화면 제어가 없어 **불필요** |
| 예약 작업 | 있음 (월요일 10:04) | **없음** → 아래 참고 |
| 화면 제어 | `computer_*` | 없음 (브라우저는 `--chrome`) |

**핵심:** `docs/pitfalls.md`에 적힌 함정 대부분이 이관과 동시에 사라진다.
남는 제약은 **예약 작업이 없다는 것** 하나뿐이다.

---

## 1. 설치 (Windows)

PowerShell에서:

```powershell
irm https://claude.ai/install.ps1 | iex
```

npm을 선호하면 `npm install -g @anthropic-ai/claude-code` (Node.js 22+ 필요).
이 프로젝트는 이미 Node를 쓰므로 어느 쪽이든 된다.

**Git for Windows를 깔아두는 걸 권장한다.** 없으면 셸이 PowerShell로 폴백해서
`docs/`의 예제 명령들이 그대로 안 돈다. 이미 GitHub Desktop을 쓰고 있으니 대개 깔려 있다.
클로드가 못 찾으면 환경변수 `CLAUDE_CODE_GIT_BASH_PATH`에 `bash.exe` 경로를 넣는다.

## 2. 첫 실행

```powershell
cd C:\...\nikke-site-git
claude
```

처음 한 번 브라우저가 열리며 Claude 계정으로 로그인한다. 이후에는 자동.
시작하자마자 `CLAUDE.md`를 읽으므로 **프로젝트 설명을 다시 붙여넣을 필요가 없다.**

## 3. 저장소에 이미 있는 것

| 파일 | 역할 |
|---|---|
| `CLAUDE.md` | 매 세션 자동 로드. 개요·설계 원칙·검사 기준선·작업 규칙 |
| `docs/*.md` | 주제별 상세. 클로드가 필요할 때 읽는다 |
| `.claude/rules/*.md` | **경로별 규칙.** 해당 파일을 건드릴 때만 자동으로 들어온다 |
| `.claude/skills/verify/SKILL.md` | `/verify` — 검사 5종을 기준선과 대조 |
| `.claude/settings.json` | 검사 스크립트 자동 허용, `.env*` 읽기 차단 |
| `.mcp.json` | Supabase MCP 연결 |

`.claude/settings.local.json`은 개인 설정용이며 `.gitignore`에 있다.

## 4. Supabase 연결 (MCP)

`.mcp.json`이 저장소에 있으므로 첫 실행 시 "이 프로젝트의 MCP 서버를 신뢰하겠냐"고 묻는다.
승인하면 브라우저에서 Supabase 인증이 뜬다. 잘 안 되면:

```powershell
claude mcp add supabase
claude mcp list
```

이 프로젝트에서 MCP로 하는 일: 마이그레이션 적용, RLS 정책 확인, 로그 조회, 어드바이저 점검.
전부 `docs/security.md`·`docs/board.md`에 기록돼 있다.

## 5. 권한

`.claude/settings.json`에 이 프로젝트에서 자주 쓰는 것만 미리 허용해뒀다.

- 허용: `node scripts/*.mjs`(검사 5종), `npm run build`, `git status/diff/log/add/commit`
- 차단: `.env*` 읽기 — **`.env.local`에 Supabase 키와 `ANTHROPIC_API_KEY`가 있다**

`git push`는 일부러 **허용하지 않았다.** 매번 물어보게 두는 편이 안전하다.
개인적으로 더 허용하고 싶은 게 있으면 `.claude/settings.local.json`에 넣는다(커밋 안 됨).

## 6. 자주 쓸 것

```
/verify              검사 5종 실행 + 기준선 대조   ← 뭔가 고친 뒤 항상
/init                CLAUDE.md 갱신 제안
claude --continue    직전 세션 이어서
claude --resume      세션 골라서 이어서
```

`Esc`로 언제든 중단, `Esc` 두 번으로 이전 메시지로 되감기.

## 7. 동시에 두 가지 작업하기

```powershell
claude --worktree i18n-ja
```

`.claude/worktrees/i18n-ja/`에 별도 git worktree와 브랜치를 만든다.
파일이 섞이지 않으니 **Cowork에서 세션 락으로 하던 조율이 필요 없다.**

## 8. 브라우저 확인

```powershell
claude --chrome
```

배포된 사이트를 직접 열어 확인·클릭·콘솔 읽기가 된다.
`docs/pitfalls.md`에 적힌 "브라우저 요소 참조가 금방 낡는다"는 여전히 유효하다 —
**클릭 후에는 무엇이 바뀌었는지를 먼저 확인할 것.**

## 9. 예약 작업 — 유일하게 안 따라오는 것

클로드 코드에는 예약 실행이 없다. `docs/weekly-research.md`에 선택지를 정리해뒀다.

**권장: 주간 조사는 Cowork에 그대로 두고, 코드 작업만 클로드 코드로 옮긴다.**
예약 작업은 파일만 고치고 커밋하지 않으므로, 다음 클로드 코드 세션에서
`git diff`를 보고 커밋하면 지금과 흐름이 똑같다.

다만 지시서가 저장소 밖(`C:\Users\정연도\Claude\Scheduled\...`)에 있어 버전 관리가 안 되는
문제는 남는다. `docs/weekly-research.md`의 마지막 절 참고.

## 10. 첫 세션에서 이렇게 시작하면 된다

```
docs/open-items.md 읽고 지금 열려 있는 항목 정리해줘. 그리고 /verify 돌려서 기준선과 맞는지 봐줘.
```

`CLAUDE.md`가 자동으로 들어가 있으므로 "이 프로젝트는 니케 조합 추천 사이트고…"를
설명할 필요가 없다. 바로 일을 시킬 수 있다.

---

## 이관 후 Cowork에 남는 것

- **주간 예약 조사** (권장 구성)
- 화면 제어가 꼭 필요한 일 — 지금은 거의 없다. 푸시는 클로드 코드에서 직접 되므로
  GitHub Desktop을 띄울 이유가 사라진다
- 다른 세션(`배당앱`/`블로그`/`쇼츠`)과의 락 규칙은 **그 세션들에만** 계속 적용된다
