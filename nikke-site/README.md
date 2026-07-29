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


## 데이터 업데이트 방법 (신규 캐릭터 출시/패치 시)
캐릭터 정보와 조합 근거자료는 `data/characterDatabase.json`, `data/synergyNotes.json` 두 파일에 정리되어 있습니다.
사이트 UI(`data/characters.js`)와는 별개로, 언제든 참고할 수 있는 "살아있는 자료집" 성격이므로
새로운 정보를 알게 될 때마다 계속 갱신해야 합니다.

### `data/characterDatabase.json` — 전체 캐릭터 도감
니케 위키(Fandom)의 인포박스와 스킬 테이블을 파싱해 만든 전체 플레이 가능 캐릭터 목록입니다.
각 항목은 `id, title, name_kr, class, burst, element, weapon, manufacturer, rarity, squad,
releaseDate, img, tiers(story/bossing/pvp), skills[](name/type/cd/desc)` 필드를 가집니다.

갱신 방법:
1. 샌드박스 `bash`/`web_fetch`는 fandom.com에 접근할 수 없으므로, Claude-in-Chrome 브라우저 MCP로
   실제 브라우저 안에서 `fetch()`를 실행해 MediaWiki API를 호출해야 합니다 (CORS 우회를 위해 `origin=*` 필요).
2. 신규 캐릭터 목록: `action=query&list=embeddedin&eititle=Template:Playable Character` (공식 플레이어블 캐릭터 목록)
3. 개별 캐릭터 원문: `action=query&prop=revisions&rvprop=content&rvslots=main&titles=...` (위키텍스트 원문, `titles`는 파이프로 최대 50개까지)
4. 위키텍스트에서 `{{Playable Character | ... }}` 인포박스와 `{{Skill table| skillname1=... skilltype1=... skillcd1=... skilldesc1=... }}` 스킬 블록을 정규식으로 파싱
5. 티어 정보는 prydwen.gg 티어리스트 페이지에서 `.custom-tier.tier-<티어명>` 컨테이너 안의 `<img alt="캐릭터명">` 을 DOM 기준으로 추출 (텍스트만으로는 "K", "D" 같은 실제 캐릭터명과 티어 라벨이 헷갈릴 수 있음)
6. 큰 데이터는 OS 클립보드(`write_clipboard`/`read_clipboard`)로 브라우저 밖으로 꺼낸 뒤 파일로 저장 — 브라우저 탭을 다른 페이지로 이동시키면 그 안의 JS 전역변수(`window.__xxx`)가 모두 사라지므로, 데이터 수집용 탭은 작업이 끝날 때까지 이동시키지 말 것.

### `data/synergyNotes.json` — 조합 시너지/카운터 근거자료
prydwen.gg의 팀 빌딩 가이드, 메타팀 가이드, 팀 데이터베이스, 티어리스트 변경 이력 등을 참고해
사람이 직접 정리·요약한(원문 그대로 베끼지 않고 우리말로 재구성한) 2차 자료입니다.
`mechanics`(버스트 페이즈/포메이션/원소 상성/CDR 같은 객관적 게임 규칙), `archetypes`(이름 붙은 팀/듀오 조합과
그 이유·대체 옵션), `synergyPairs`(캐릭터 간 시너지 이유), `counters`(PvP 카운터 관계)로 구성됩니다.
장차 "조합 추천 스코어링 엔진"이 감점/가점 규칙을 정할 때 근거로 삼을 자료입니다.

갱신 방법: 위 캐릭터 도감과 동일하게 Claude-in-Chrome으로 prydwen.gg 공략 페이지를 읽고,
새로 알게 된 조합/시너지/카운터를 파일 스키마에 맞춰 항목을 추가합니다. 저작권 문제를 피하기 위해
원문을 그대로 복사하지 말고 반드시 의미를 유지한 채 우리말로 다시 서술할 것.

### `lib/synergyEngine.js` — 규칙 기반 조합 스코어링 엔진 (1단계 완료)
보유 캐릭터 목록만 넣으면 characterDatabase.json + synergyNotes.json의 근거를 이용해
실시간으로 5인 조합을 탐색·채점하는 엔진입니다. AI가 임의로 가중치를 정한 것이 아니라,
synergyNotes.json에 이미 정리된 "이름 붙은 조합/시너지 페어/카운터"와 게임 규칙(버스트 I/II/III
필수, CDR 보유 여부, 버스트 쿨타임 20초 여부, 원소 다양성)을 그대로 점수 규칙으로 옮긴 것입니다.

- `recommendTeams(ownedCharacters, mode, opts)` : 보유 캐릭터 배열 → 상위 N개 추천 조합 (버스트 타입별로 후보를 나눠 탐색하므로 로스터가 커도 실시간 응답 가능)
- `scoreTeam(members, mode)` : 임의의 5인 조합을 채점 (유저가 `/combos`에 등록한 조합 평가에도 재사용 가능)
- `getDataFreshnessMeta()` : 근거 자료의 기준일(asOf)과 "오래됐을 수 있음" 경고를 함께 반환

**왜 신선도 표시가 중요한가**: `data/synergyNotes.json` 같은 사람이 정리한 자료는 정확하지만
갱신이 느리다는 뚜렷한 한계가 있습니다(예: 참고한 팬사이트 중 일부는 실제로 1년 넘게
업데이트가 없었습니다). 그래서 이 엔진은 오래된 과거 데이터에만 의존하지 않도록,
모든 추천 결과에 `data/dataFreshness.json` 기준 신선도 정보를 함께 반환합니다.
아직 UI에는 연결하지 않았고 엔진 로직만 구현·검증된 상태입니다.

### `data/dataFreshness.json` — 데이터 신선도 메타
characterDatabase/synergyNotes 각각의 기준일(asOf), 출처, 갱신 방법, "이 정도 지나면 오래된
것으로 간주"하는 기준일수(staleAfterDays)를 담고 있습니다. 새로 데이터를 갱신할 때마다
`asOf` 값을 오늘 날짜로 갱신해야 합니다. 이 파일이 "AI가 계속 새로운 데이터를 배우고 있다"는
것을 추적하는 핵심 장부 역할을 합니다.

### 향후 계획
1. (완료) 근거자료 축적 — characterDatabase.json, synergyNotes.json
2. (완료) 규칙 기반 스코어링 엔진 — lib/synergyEngine.js, 데이터 신선도 태깅
3. (예정) 엔진을 실제 페이지(메인 추천, /combos 채점)에 연결
4. (예정) 유저 투표/채택 데이터를 Supabase에 쌓아서 WEIGHTS 상수를 "실측 데이터 기반"으로 재보정하는 피드백 루프
5. (예정) 신규 캐릭터 출시·패치·새 공략 발견 시 데이터를 정기적으로 갱신하는 프로세스(스케줄 작업화 검토) — 사람이 만든 자료는 갱신이 느리다는 한계를 AI가 지속적으로 보완하는 것이 이 프로젝트의 핵심 목표입니다.


## 애장품(Treasure) 기능 (신규)
보유 캐릭터를 선택한 뒤 카드 우하단의 💎 아이콘을 누르면 애장품(Treasure) 장착 여부를 표시할 수 있습니다.
로그인 상태면 계정에 저장되고, AI 추천 점수 계산에 반영됩니다.

- **DB 마이그레이션 필요**: 이 기능을 쓰려면 `owned_nikke` 테이블에 `has_treasure` 컬럼과 update 정책이 있어야 합니다.
  이미 `schema.sql`을 실행했던 기존 프로젝트라면 `supabase/treasure_migration.sql`을 Supabase SQL Editor에서
  한 번 실행해주세요. 새 프로젝트는 `schema.sql`에 이미 반영되어 있어 별도 작업이 필요 없습니다.
- **근거 자료**: `data/treasureEffects.json`에 캐릭터별 애장품 효과와, 그로 인해 달라지는 다른 캐릭터와의 궁합을
  기록합니다. 예: 헬름은 애장품 장착 시 공격+전체 회복 스킬이 생겨 크라운과 궁합이 급상승합니다. 아직 일부
  캐릭터만 조사되어 있으며, 새로 알게 되는 대로 계속 추가해야 하는 living 자료입니다(다른 data/*.json과 동일).

## 캐릭터 선택 UI 변경
메인 화면의 캐릭터 선택 그리드를 작은 원형 아이콘에서 상반신이 보이는 큰 세로형 카드로 바꿨습니다
(`components/CharacterAvatar.js`의 `shape="portrait"` 참고).
