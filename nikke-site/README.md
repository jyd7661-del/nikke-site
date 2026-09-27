# 니케 조합 추천 사이트 — 앱

모바일 게임 **승리의 여신: 니케**의 조합 추천 사이트. 보유 니케를 고르면 용도(캠페인·보스전·PvP·타워)에 맞는
5인 조합과 근거를 보여주고, 캐릭터 도감·가이드·커뮤니티(조합 등록·게시판)가 있다. 한국어·영어·일본어.

- 배포: https://nikketeamguide.com
- 스택: Next.js 14 App Router · Tailwind · Supabase(DB·구글 로그인) · Vercel · Anthropic API(AI 설명)

## 폴더

| 경로 | 내용 |
|---|---|
| `app/[lang]/` | 페이지 — `(home)` 추천 · `nikke` 도감 · `guide` · `combos` · `board` · `u` · `privacy`. 한국어는 접두어 없음, `/en`·`/ja` |
| `app/api/` | `ai-recommend`(AI 설명·조합) · `translate`(커뮤니티 번역) · `track`(방문 계측) |
| `components/` | 화면 컴포넌트 |
| `lib/` | `synergyEngine.js` = 추천 엔진(조합·점수·근거를 결정) · i18n · Supabase 연동 등 |
| `data/` | `characterDatabase.json` = 엔진 데이터(캐릭터·스킬·티어) · `characters.js` = 캐릭터 선택 목록 · 실사용 조합 등 |
| `scripts/` | 검사·수집 스크립트. `npm run verify`가 검사를 모아 돌린다 |
| `supabase/` | SQL 마이그레이션(전부 적용됨 — `../docs/ops.md`) |

## 환경변수 (`.env.local` / Vercel)

필수:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # 서버 전용. NEXT_PUBLIC_ 붙이지 말 것
ANTHROPIC_API_KEY
```
선택: `AI_TEAMS_MODE`(off|shadow|on) · `AI_DAILY_BUDGET_KRW` · `AI_DAILY_GLOBAL_LIMIT` · `AI_EXPLAIN_MODEL` · `AI_TEAM_MODEL` ·
`TRANSLATE_DAILY_LIMIT` · `NEXT_PUBLIC_SITE_URL` · `NEXT_PUBLIC_ADSENSE_*`. 값과 의미는 `../docs/ops.md`.

## 개발

```bash
npm ci
npm run dev                                   # http://localhost:3000
npm run verify                                # 데이터·엔진·i18n 검사 — 고친 뒤 항상
npx next build && npm run check:canonical     # 빌드 + canonical/sitemap 검사(빌드 산출물을 읽는다)
```

`npm run dev`는 `.next`를 덮으므로 `check:canonical` 전에는 다시 빌드한다.
`main`에 push하면 Vercel이 배포한다.

## 규칙과 경위

프로젝트 원칙·작업 규칙은 `../CLAUDE.md`, 주제별 설계·함정·이력은 `../docs/`.
