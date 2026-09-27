# 개발 환경의 함정 (실제로 겪은 것들)

> `HANDOFF.md`에서 분리했습니다(2026-08-12). 왜 그렇게 만들었는지와
> 어떤 함정을 밟았는지가 핵심입니다. 코드만 보면 알 수 없는 내용입니다.
>
> 지금 작업 환경은 미니 PC의 WSL(리눅스, `~/projects/nikke/nikke-site-git`, Node는 nvm)이다.
> 커밋·푸시는 세션에서 `git`으로 직접 한다(파일을 이름으로 `git add` — `CLAUDE.md` 작업 규칙).

(2026-09-27 정리: Cowork 샌드박스 시절 절차 — GitHub Desktop을 computer-use로 조작한 커밋, 샌드박스 git 금지·`index.lock`, npm 403, 파일 삭제 권한, CRLF — git 이력 참고)

---

| 함정 | 대응 |
|---|---|
| **엔진을 node로 직접 못 부름** | `synergyEngine.js`의 JSON import에 `with { type: 'json' }`가 없음. 테스트할 땐 임시 복사본을 만들고 **끝나면 반드시 삭제** (한 번 커밋에 섞일 뻔함) |
| **`javascript_tool` 출력 차단** (Claude in Chrome) | `[BLOCKED: Cookie/query string data]`. 작은 파생 요약만 반환하세요 |
| **Chrome은 computer-use 불가** | tier "read". 브라우저 조작은 `mcp__claude-in-chrome__*` 사용 |

(2026-09-27 정리: Cowork 세션 간 화면 제어 순번 `cowork-lock.sh`·화면 제어 권한 만료 — git 이력 참고)

(2026-09-27 정리: Cowork `device_bash` "Workspace unavailable" 복구법 — git 이력 참고)

### 시각은 UTC로 온다

Vercel 배포 시각·API 응답이 전부 UTC다. 한국 시간은 **+9시간**.
`2026-08-11T01:52Z` = 한국 시간 **오전 10:52**. 이걸 착각해 대화 내내 날짜를 하루 밀려 말한 적이 있다.

## `npm run dev`가 빌드 산출물을 덮는다 (2026-08-27)

`next build` 뒤에 `npm run dev`를 돌리면 `.next`가 개발 산출물로 바뀌어 정적 HTML이 사라진다.
그 상태에서 `checkCanonical`을 돌리면 **전 주소(현재 621건) "빌드 산출물 없음" ERROR**가 난다.

회귀처럼 보이지만 아니다. `next build`를 다시 하면 `ERROR 0`으로 돌아온다.
화면을 확인하려고 dev를 켠 뒤에 검사를 돌리는 흐름에서 걸리기 쉽다.

(2026-09-27 정리: Git Bash(MSYS)가 `/`로 시작하는 인자를 윈도우 경로로 바꾸던 문제 — WSL에선 없음. git 이력 참고)

## Supabase SQL 편집기에 SQL을 넣을 때 (2026-08-27)

브라우저로 마이그레이션을 실행할 일이 있다. 세 가지를 밟았다:

- **괄호를 연 채 줄바꿈하면 편집기가 닫는 괄호를 자동으로 덧붙인다.** 문장마다 한 줄로 쓰고,
  실행 전에 화면 내용을 눈으로 대조할 것
- **클릭이 편집기에 안 맞으면 타이핑이 단축키로 먹힌다.** Supabase는 `g`+`r` 같은 이동
  단축키가 있어서 SQL의 `group by`가 Realtime 페이지로 튀게 만든다. 입력 후 화면을 확인할 것
- `delete`가 섞이면 "Potential issue detected" 확인창이 뜬다. 버튼이 화면 밖이면
  `read_page`로 ref를 잡아 누른다

> 지금은 claude.ai Supabase 커넥터(MCP)의 `apply_migration`·`execute_sql`로도 실행할 수 있다.

## 셸이 백슬래시를 먹는다 — 코드/문서에 제어문자가 들어간다 (2026-08-24)

`node -e` 나 heredoc으로 파일을 쓸 때 문자열 안의 백슬래시가 한 겹 사라진다.
그래서 정규식 `/^<Script\\b/` 를 쓰려던 것이 `/^<Script` + **백스페이스 문자(0x08)** + `/`
로 들어갔다. 눈으로 보면 `\b` 와 구별이 안 되고, `sed`로 출력해도 똑같아 보인다.
**정규식은 조용히 아무것도 매치하지 않게 된다.**

같은 날 두 번 밟았다 — `scripts/checkAdPlacement.mjs` 와 `docs/ops.md`.
전자는 역테스트가 잡았고(고의로 고장 냈는데 안 걸려서 발견), 후자는 사후 스캔으로 잡았다.

**대응:**

- 정규식에 `\b` `\d` `\s` 같은 이스케이프가 필요하면 **다른 방법으로 우회한다.**
  예: `/^<Script\\b/.test(tag)` → `tag.startsWith('<Script')`
- 파일을 쓴 뒤 **제어문자를 스캔한다:**

```bash
node -e "const s=require('fs').readFileSync('파일','utf8');console.log([...s].filter(c=>c.charCodeAt(0)<32&&![9,10,13].includes(c.charCodeAt(0))).length)"
```

- 한글·백틱이 많은 문서 편집은 셸 대신 **Edit/Write 도구**를 쓰는 편이 안전하다
  (같은 이유로 예전에 `docs/open-items.md`·`CLAUDE.md`의 표가 깨진 적이 있다).
