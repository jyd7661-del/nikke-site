# HANDOFF.md → 이 파일은 분리되었습니다

2026-08-12에 1,266줄짜리 인수인계 문서를 **`CLAUDE.md` + `docs/`** 로 나눴습니다.
섹션 번호(7-1이 8·9 뒤에 오는 식)가 이미 뒤엉켜 있었고, 한 파일에 다 있으면
클로드가 매번 전부 읽어야 해서 정작 필요한 대목이 묻혔습니다.

## 어디로 갔나

| 옛 섹션 | 지금 위치 |
|---|---|
| §0 세션 시작 / §1 개요 / §2 설계 원칙 / §10 사용자 프로필 | **`CLAUDE.md`** (매 세션 자동 로드) |
| 추천 로직 · 점수 · 토템 · 타워 | `docs/engine.md` |
| 데이터 파일 · prydwenTags · 오버스펙 | `docs/data.md` |
| AI 설명 생성 · 캐시 · 상한 | `docs/ai.md` |
| 다국어 · 커뮤니티 번역 · 용어집 | `docs/i18n.md` |
| 게시판 · RLS | `docs/board.md` |
| 보안 사고 이력 | `docs/security.md` |
| Supabase · Vercel · 배포 | `docs/ops.md` |
| 주간 예약 조사 | `docs/weekly-research.md` |
| 개발 환경의 함정 | `docs/pitfalls.md` |
| 열려 있는 작업 · 판단 대기 | `docs/open-items.md` |
| §7-1 Cowork 락 프로토콜 | `docs/pitfalls.md` 하단 (이관 후 대부분 불필요) |

클로드 코드로 옮기는 방법은 **`docs/claude-code.md`**.

원문 전체는 커밋 `ff9997e` 이전 이력에 그대로 남아 있습니다:

```bash
git show ff9997e:HANDOFF.md
```
