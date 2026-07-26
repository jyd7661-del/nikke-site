# 니케 조합 추천 사이트

보유중인 "승리의 여신: 니케" 캐릭터를 선택하면 캠페인 / 보스전 / 아레나(PvP)에 맞는
추천 조합을 보여주고, 유저들이 직접 조합을 등록·투표하고 게시판에서 소통할 수 있는
Next.js + Supabase 웹사이트입니다.

## 주요 기능
- 보유 니케 선택 → 알려진 메타 조합 매칭 / 부족한 조합 안내 / 자동 추천 팀
- 이메일 매직링크 로그인 (비밀번호 없음)
- 로그인 시 보유 니케 자동 저장 + 친구에게 공유 링크(`/u/내ID`)로 보여주기
- `/combos` : 유저가 직접 조합을 등록하고 추천/비추천 투표
- `/board` : 자유 게시판 + 댓글
- 광고 슬롯 자리 (AdSense 연동 전 placeholder)

## 폴더 구조
- `data/characters.js` : 캐릭터 목록 (버스트 단계, 티어, 역할 태그)
- `data/combos.js` : 알려진 메타 조합 목록 (용도, 설명, 구성원)
- `lib/recommend.js` : 보유 캐릭터 → 추천 조합 계산 로직
- `lib/supabaseClient.js`, `lib/roster.js`, `lib/combos.js`, `lib/board.js` : Supabase 연동 함수
- `components/` : 캐릭터 선택 UI, 결과 패널, 광고 슬롯, 로그인 헤더 등
- `app/page.js` : 메인 페이지, `app/combos`, `app/board`, `app/u/[id]` : 커뮤니티 기능
- `supabase/schema.sql` : DB 테이블 + 보안 정책(RLS) 정의

## 로컬에서 실행하기
이 코드는 클로드 작업 환경(샌드박스)에서 npm 레지스트리 접근이 막혀 있어
`npm install`을 대신 실행해드리지 못했습니다. 아래 순서로 직접 실행해주세요.

```bash
cd nikke-site
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속하면 확인할 수 있습니다.

정상 배포 전 빌드 확인:
```bash
npm run build
```

## Supabase 연결하기 (계정저장/조합등록/게시판을 쓰려면 필수)
로그인, 보유 니케 저장, 커뮤니티 조합, 게시판 기능은 Supabase(무료 티어) 연결이 있어야 동작합니다.
연결 전에도 메인 페이지의 조합 추천 기능 자체는 로그인 없이 사용할 수 있습니다.

1. https://supabase.com 에서 무료 회원가입 후 "New Project" 생성 (리전은 Northeast Asia(Seoul) 추천)
2. 프로젝트 생성이 끝나면 좌측 메뉴 **SQL Editor** 로 이동 → 이 저장소의 `supabase/schema.sql` 내용을 전체 복사해서 붙여넣고 실행
   (테이블 6개 + 보안 정책이 한 번에 생성됩니다)
3. 좌측 메뉴 **Project Settings → API** 에서 `Project URL`과 `anon public` 키를 복사
4. 이 프로젝트 루트에 `.env.local` 파일을 만들고 아래처럼 채우기 (`.env.local.example` 참고)
   ```
   NEXT_PUBLIC_SUPABASE_URL=복사한 Project URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY=복사한 anon public 키
   ```
5. **Authentication → URL Configuration** 에서 Site URL을 배포 주소(로컬 테스트 중이면 `http://localhost:3000`)로 설정
   (매직링크 로그인 후 이 주소로 돌아옵니다. Vercel 배포 후에는 실제 도메인으로 다시 바꿔주세요)
6. `npm run dev`로 실행 후 우측 상단 "로그인"에서 이메일을 입력하면 로그인 링크가 메일로 발송됩니다

이 단계는 Supabase 계정 생성과 키 발급이 필요해서 사용자님이 직접 진행해주셔야 합니다.
막히는 부분이 있으면 화면을 공유해주시면 다음 단계를 같이 봐드릴게요.

## 무료 배포 (Vercel 추천)
1. https://vercel.com 에서 GitHub 계정으로 가입
2. 이 폴더를 GitHub 저장소로 push
3. Vercel에서 "New Project" → 방금 만든 저장소 선택
4. "Environment Variables"에 `.env.local`과 동일하게 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 추가 → Deploy
5. 배포 후 `프로젝트명.vercel.app` 주소가 발급됩니다. 이 주소를 Supabase의 Site URL에도 다시 등록해주세요.
   이후 도메인을 구매하면 Vercel 설정에서 커스텀 도메인 연결 가능합니다.

## 광고(AdSense) 붙이기
1. https://www.google.com/adsense 에서 사이트 등록 후 심사 신청 (실제 배포된 URL 필요, 콘텐츠/트래픽 어느 정도 있어야 승인됨)
2. 승인되면 발급되는 `<script>` 태그를 `app/layout.js`의 `<head>`에 추가
3. `components/AdSlot.js` 안에 주석 처리된 `<ins class="adsbygoogle">` 블록의 주석을 해제하고
   `data-ad-client`, `data-ad-slot` 값을 채워넣기

## 데이터 업데이트
`data/characters.js`, `data/combos.js`는 2026년 7월 기준 공개된 티어표/공략을 참고해
정리한 초안입니다. 니케는 신규 캐릭터가 자주 추가되고 밸런스 패치가 잦으므로
주기적으로 최신 정보를 반영해 갱신하는 것을 권장합니다.

## 다음 단계 아이디어
- 신규 캐릭터/밸런스 패치 반영 (data/characters.js, data/combos.js 갱신)
- 게시글/댓글 신고, 삭제 기능
- 조합에 "보스전/캠페인/PvP" 필터 추가
- 실제 트래픽이 생기면 AdSense 심사 신청
