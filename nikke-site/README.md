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

### data/characterDatabase.json (전체 캐릭터 원자료, 2026-07-26 기준 201명)
니케 위키(Fandom)에서 수집한 전체 플레이어블 니케 원자료입니다. 사이트에서 직접 쓰는
`data/characters.js`(58명, 추천 로직용 요약)와는 별개로, 매번 새로 조사하지 않고 참고할 수 있도록
캐릭터별 등급/버스트/무기/제조사/스킬 3종(패시브·스킬1·버스트) 전문/스토리·보스전·PvP 티어를
JSON으로 저장해둔 원자료입니다.

각 항목 구조:
```json
{
  "id": "rapi", "title": "Rapi", "name_kr": "라피",
  "class": "attacker", "burst": "3", "element": "fire", "weapon": "ar",
  "manufacturer": "elysion", "rarity": "SR", "releaseDate": "4 nov 2022",
  "img": "위키 이미지 경로", "tiers": {"story": "E", "bossing": "F", "pvp": "E"},
  "skills": [{"name": "...", "type": "Passive|Active", "cd": "20", "desc": "..."}]
}
```

**업데이트 방법 (신규 니케 출시/밸런스 패치 시):**
1. 니케 위키(nikke-goddess-of-victory-international.fandom.com)의 MediaWiki API로 캐릭터 원문(위키텍스트)을 가져옵니다.
   - 전체 목록: `/api.php?action=query&list=embeddedin&eititle=Template:Playable%20Character&eilimit=500&einamespace=0&format=json`
   - 개별/일괄(최대 50개) 원문: `/api.php?action=query&titles=A|B|C&prop=revisions&rvprop=content&rvslots=main&format=json`
   - 각 페이지의 `{{Playable Character ...}}` 인포박스와 `{{Skill table|...}}` 블록을 파싱하면 위 구조가 나옵니다.
2. 티어 정보는 prydwen.gg/nikke/tier-list의 STORY/BOSSING/PVP 세 탭에서
   `.custom-tier` 요소(클래스에 티어명 포함, 예: `tier-sss`) 안의 `<img alt="캐릭터명">`을 스캔해 캐릭터명→티어 맵을 만듭니다.
3. 위 두 데이터를 캐릭터명 기준으로 합쳐 `data/characterDatabase.json`을 새로 커밋합니다.
4. 위키/티어 API는 브라우저(CORS `origin=*`)에서만 접근 가능하고 서버/스크립트 환경에서는 막힐 수 있으니,
   브라우저 콘솔(또는 브라우저 자동화 도구)에서 fetch로 수집 후 결과를 저장하는 방식을 권장합니다.

`data/characters.js`, `data/combos.js`는 사이트가 실제로 사용하는 축약 데이터(58명 + 조합 6종)로,
2026년 7월 기준 공개된 티어표/공략을 참고해 정리한 초안입니다. `characterDatabase.json`이 갖춰졌으니
앞으로는 이 원자료를 기준으로 `characters.js`를 갱신하거나, 사이트에 티어/스킬 상세 표시 기능을 추가할 때
바로 활용할 수 있습니다.

## 다음 단계 아이디어
- 신규 캐릭터/밸런스 패치 반영 (data/characters.js, data/combos.js 갱신)
- 게시글/댓글 신고, 삭제 기능
- 조합에 "보스전/캠페인/PvP" 필터 추가
- 실제 트래픽이 생기면 AdSense 심사 신청
