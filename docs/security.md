# 보안 이력

> `HANDOFF.md`에서 분리했습니다(2026-08-12). 왜 그렇게 만들었는지와
> 어떤 함정을 밟았는지가 핵심입니다. 코드만 보면 알 수 없는 내용입니다.

---

### 무슨 일이었나

`app/api/ai-recommend/route.js`가 **`NEXT_PUBLIC_SUPABASE_ANON_KEY`로 DB에 쓰고 있었습니다.**
서버가 공개 키를 쓰니 서버가 써야 하는 테이블을 전부 `anon`에게 열어줄 수밖에 없었고,
구멍 세 개가 전부 여기서 나왔습니다.

| 대상 | 가능했던 일 | 등급 |
|---|---|---|
| `ai_explain_cache` | **캐시된 AI 설명문을 아무나 바꿔 씀.** 그 글은 화면에 나가는 추천 근거이고 캐시라 계속 재사용됨 → 내용 변조 | 🔴 |
| `ai_explain_usage` | 남의 사용량을 최대로 올려 차단 / 자기 것만 되돌려 무제한 사용 | 🟠 |
| `increment_ai_daily_budget()` | 인증 검사 없이 아무나 호출 → 하루 상한을 몇 초 만에 태워 AI 설명 전면 차단 | 🟠 |

**RLS 정책과 테이블 GRANT 두 겹이 모두 열려 있는지 반드시 같이 확인해야 합니다.**
정책만 보고 판단하면 틀립니다(반대 방향 실수를 §7-2 `profiles`에서 이미 한 번 했습니다).

### 완료된 것

- `ai_explain_cache`: 테이블 UPDATE 회수 후 `(hits, last_hit_at)`만 재부여
  → **`reasoning` 변조 차단.** 배포 없이 즉시 적용됨
  (마이그레이션 `lock_ai_explain_cache_reasoning_column`)
- `combo_scores` 뷰: `security_invoker = on` (advisor ERROR 해소, 동작 변화 없음)
- `route.js`: service role 키를 쓰도록 수정. **키가 없으면 공개 키로 되돌아가지 않고
  Supabase 연동 자체를 끕니다** — 되돌아가면 "고쳤다고 생각했는데 옛날 상태"가 되고
  그게 §2-3의 조용한 누락입니다. 대신 `[AI_KEY]` 태그로 에러 로그를 남깁니다

### 남은 순서 (이 순서를 지키지 않으면 배포된 사이트가 조용히 깨집니다)

1. Vercel에 `SUPABASE_SERVICE_ROLE_KEY` 추가 — **`NEXT_PUBLIC_` 붙이면 번들에 실려 나갑니다**
2. `route.js` 배포
3. 사이트에서 AI 추천 1회 실행 → 캐시·카운터 기록 확인
4. `supabase/ai_tables_lock_anon_write_migration.sql` 적용 (파일 안에 확인 쿼리까지 있음)

### ✅ 익명 로그인 — 껐습니다 (2026-08-09)

켜져 있었고, 익명 계정 2개는 **전부 배당앱 것**이었습니다(`div_holdings` 5건씩, 니케 데이터 0).
니케 사이트에는 `signInAnonymously`를 부르는 코드가 **한 줄도 없어서** 얻는 것 없이 공격면만
남은 상태였습니다 — 켜져 있으면 누구나 무제한으로 인증 계정을 만들어 게시판 도배와 조합
추천수 조작을 할 수 있습니다.

MCP로는 못 바꿉니다. **Chrome 확장(`mcp__claude-in-chrome__*`)으로 대시보드를 직접 조작**해서
껐고, 새로고침 후 상태가 유지되는 것까지 확인했습니다
(가입허용 ON / 수동연결 OFF / **익명 OFF** / 이메일확인 ON).
그 결과 advisor의 `auth_allow_anonymous_sign_ins` 경고 13건이 한꺼번에 사라졌습니다.

> 참고: `computer_*`(기기 제어) 도구는 **브라우저를 읽기 전용으로만** 허용합니다.
> 웹에서 클릭·입력이 필요하면 Chrome 확장 쪽을 쓰세요.
>
> 그리고 이때 `device_bash`(사용자 컴퓨터의 리눅스 작업공간)가 `Workspace unavailable`로
> 죽어 있어서 `cowork-lock.sh`를 실행할 수 없었습니다. 잠금 파일을 직접 읽고 쓰는 방식으로
> 스크립트와 같은 순서(대기표 등록 → 잠금 확인 → 획득 → 검증)를 따랐습니다.
> **다시 이런 상황이 오면 같은 방법을 쓰되, 다른 세션이 `waiting` 상태인지 반드시 먼저
> 확인하세요.** 확인 없이 잠금 파일을 덮어쓰면 남의 잠금을 지우게 됩니다.

### ⚠️ `device_bash`가 `Workspace unavailable`일 때 — 재시작 후 **몇 분** 기다릴 것

2026-08-09에 겪었습니다. 증상은 `device_bash`만 죽고 파일 작업(`device_stage_files` /
`device_commit_files`)·폴더 연결·Chrome 확장은 전부 정상입니다.

**해결은 Claude 데스크톱 앱 완전 종료 후 재시작인데, 리눅스 VM이 뜨는 데 시간이 걸립니다.**
저는 재시작 직후·45초 후·2분 30초 후 세 번 시도해서 전부 실패하는 걸 보고
**"재시작으로 해결되는 종류가 아니다"라고 잘못 결론지었습니다.** 실제로는 약 6분 뒤에
정상 복구됐습니다.

오류 메시지가 `still starting`이 아니라 `failed to start`라서 부팅 중이 아니라고 판단했는데,
**그 메시지는 부팅이 아직 안 끝난 상태에서도 나옵니다.** 재시작했다면 최소 5~10분은
기다렸다가 다시 확인하고, 그 전에 WSL/BIOS/디스크 같은 걸 파헤치지 마세요.

### 안 고친 것과 그 이유

- `app/api/ai-recommend/feedback/route.js`는 아직 공개 키로 `ai_recommend_feedback`에
  INSERT합니다. 이 테이블은 insert 전용 정책이라 읽히지 않고, 피드백은 원래 누구나 보내는
  것이라 위험이 아닙니다. 도배는 가능하니 나중에 같이 옮기면 됩니다.
- `is_board_admin()`은 `anon` 실행 가능하지만 호출자 자신의 `is_admin`만 돌려주고
  익명은 `auth.uid()`가 null이라 항상 false입니다. 그대로 둡니다.

---
