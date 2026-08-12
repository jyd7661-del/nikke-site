# 운영 환경 — Supabase · Vercel · 배포

> `HANDOFF.md`에서 분리했습니다(2026-08-12). 왜 그렇게 만들었는지와
> 어떤 함정을 밟았는지가 핵심입니다. 코드만 보면 알 수 없는 내용입니다.

---

### Supabase (프로젝트 `yttfwroeyplwrchyitud`)

마이그레이션은 `nikke-site/supabase/` 아래. **전부 실행 완료 상태**입니다.

| 파일 | 용도 |
|---|---|
| `schema.sql` | 기본 테이블 + RLS |
| `treasure_migration.sql` | `owned_nikke.has_treasure` 컬럼 |
| `ai_rate_limit_migration.sql` | `ai_explain_usage` (이름이 옛 기능을 가리키지만 용도는 레이트리밋) |
| `ai_explain_cache_migration.sql` | `ai_explain_cache` (2026-08-08 실행) |

### Vercel 환경변수

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
NEXT_PUBLIC_ADSENSE_CLIENT_ID        = ca-pub-1541956672617594
NEXT_PUBLIC_ADSENSE_SLOT_BANNER      = 7234519961
NEXT_PUBLIC_ADSENSE_SLOT_RECTANGLE   = 5842768434
(AI_EXPLAIN_MODEL — 선택. 넣으면 모델 교체)
```

### ✅ 구글 로그인 — 완료 (2026-08-09)

**로그인이 구글 OAuth로 전환됐고 정상 동작 확인했습니다.** 이메일 발송 한도 문제는 이걸로
해소됐습니다(구글 로그인은 메일을 한 통도 쓰지 않습니다).

| 항목 | 값 |
|---|---|
| 구글 클라우드 프로젝트 | `my-project-34158nikke-site` (니케 전용, **BizGlitch와 별개**) |
| 앱 이름(동의 화면 표시) | **니케 조합 추천** |
| 게시 상태 | **프로덕션** — 구글 계정 있는 누구나 로그인 가능 |
| OAuth 클라이언트 | 웹 애플리케이션 1개 |
| 리디렉션 URI | `https://yttfwroeyplwrchyitud.supabase.co/auth/v1/callback` |
| Supabase Provider | Google **Enabled** |

**기존 계정이 그대로 이어졌습니다(실측):**
`jyd7661@gmail.com`의 `auth.identities`에 **`email, google` 두 개가 같은 user_id로** 붙었고,
보유 니케·운영자 권한이 유지됩니다. 별도 계정이 생기지 않았습니다.

**Supabase 구글 설정은 원래 다른 값이 들어 있었습니다.** 이 프로젝트를 배당앱과 공유하던
시절의 잔재로, 쇼츠·배당·블로그 세션 모두 "자기 것 아니다"라고 확인해줘서 덮어썼습니다.
토글이 꺼져 있어 사용 중이 아니었습니다.

**남은 정리**: 매직링크(`sendLink`)가 `components/Header.js`에 "이메일로 로그인"으로 접혀
있습니다. 구글이 검증됐으니 지워도 됩니다. 지우면 `signInWithOtp` 관련 상태(email/sent)도
함께 정리하세요.

⚠️ **구글 클라우드 프로젝트 표시 이름이 `My Project 34158nikke-site`로 잘못 지어졌습니다.**
(생성 시 입력이 기본값 뒤에 붙음) 내부용이라 기능엔 영향 없지만 정리하면 좋습니다.
사용자에게 보이는 이름은 동의 화면의 **니케 조합 추천**이라 문제없습니다.

### (해결됨) 로그인 이메일 시간당 2통 한도 — 구글 로그인 전환으로 우회

**2026-08-09에 실제로 막혔습니다.** 로그아웃/로그인을 몇 번 반복하니 매직링크가 안 오고
Supabase 인증 로그에 `429: email rate limit exceeded` / `over_email_send_rate_limit`이 찍혔습니다.

원인: 로그인이 `signInWithOtp`(이메일 매직링크)인데, 지금 메일을 보내는 주체가
**Supabase 내장 메일 서비스**(`noreply@mail.app.supabase.io`)입니다. 이건 **개발용**이고
공식 문서도 *"availability is on a best-effort basis. For production use, you should consider
configuring a custom SMTP server"* 라고 못박고 있습니다. 실측으로 **시간당 2통**입니다
(10:11:50, 10:13:04 발송 성공 → 그다음부터 전부 429).

**⚠️ 이 한도는 계정별이 아니라 프로젝트 전체 공유입니다.** 즉 **지금 상태로 공개하면
하루 몇 명만 로그인해도 나머지 사용자는 아예 로그인을 못 합니다.** 광고를 붙이기 전에
반드시 해결해야 합니다 — 애드센스 통과보다 이게 먼저입니다.

**해결**: Supabase 대시보드 → Authentication → Emails → SMTP Settings 에 커스텀 SMTP 등록
(SendGrid, AWS SES, Resend 등). 등록하면 기본 한도가 **시간당 30통**이 되고,
Authentication → Rate Limits 에서 더 올릴 수 있습니다.

**개발 중 우회**: 비로그인 화면을 확인할 때 **로그아웃하지 말고 시크릿 창을 쓰세요.**
로그아웃하면 다시 들어올 때 메일을 한 통 더 쓰게 되고, 두 번이면 한 시간 묶입니다.

### 애드센스 — 사이트 검토 대기 중

계정 승인은 났지만 `nikke-site.vercel.app`은 **`준비 중`(사이트의 광고 게재 가능 여부 검토 중)**
상태입니다. 그래서 `<ins>`는 정상 렌더되고 `status: done`인데 광고가 비어 있습니다.
**우리 쪽 연동 문제가 아닙니다.** 통과되면 `준비됨`으로 바뀝니다.

남은 항목: **동의 메시지(CMP)** — EEA·영국·스위스 방문자용 쿠키 동의 배너. 미설정 시 그 지역
광고 수익이 빠집니다. 3가지 선택형(동의/동의하지 않음/옵션 관리)이 GDPR 요건에 가장 안전.
**법적 성격이 있어 사용자 결정이 필요합니다.**

### 예약 작업 `nikke-site-data-research`

매주 월요일 10:04(KST) 실행. **→ `docs/weekly-research.md`에 전부 정리했다.**
(A/B 규칙, 보고서 위치, 지시서 파일 접근 문제, 클로드 코드 이관 시 선택지)
