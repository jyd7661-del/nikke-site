# 데이터 파일

> `HANDOFF.md`에서 분리했습니다(2026-08-12). 왜 그렇게 만들었는지와
> 어떤 함정을 밟았는지가 핵심입니다. 코드만 보면 알 수 없는 내용입니다.

---

모두 `nikke-site/data/` 아래에 있습니다.

| 파일 | 내용 | 현재 규모 |
|---|---|---|
| `characterDatabase.json` | 캐릭터 상세(스킬 3종, 쿨타임, 버스트, 원소, 클래스, 무기, 제조사, 출시일, 모드별 티어, prydwenTags, **이름 3개 국어 `title`/`name_kr`/`name_ja`**) | 196명 (SSR 168 / SR 19 / R 9) |
| `characters.js` | **화면 캐릭터 선택 그리드가 읽는 UI 목록. SSR 전용** | 168 항목 |
| `synergyNotes.json` | prydwen 아키타입, 시너지 페어, 카운터 | 아키타입 483 / 페어 13 / 카운터 4 |
| `characterInvestmentNotes.json` | 애장품 필요 여부, 투자 우선순위, **토템 역할** | 76건 (토템 18명) |
| `treasureEffects.json` | 애장품 효과 | 17명 (전원) |
| `metaStats.json` | enikk.app 실사용 데이터 — 캐릭터별 채용률(`usageTier`), PvP 조합, **캠페인 조합** | 캠페인 조합 19 / PvP 상위 20 |
| `soloRaidTeams.json` | enikk 솔로레이드 **실사용 5인 조합** (시즌=원소별) | 5시즌 × 25팀 = 125 |
| `towerCompositions.json` | enikk 타워 **실사용 5인 조합** (타워 풀별) | 5풀 × 10팀 = 50 |
| `enikkAlias.json` | enikk 화면 표기 → 우리 `title` 별칭 + **이름 충돌 근거** | 별칭 8 / 충돌 1 |
| `tierJudgments.json` | prydwen 티어 불일치를 사람이 판정한 기록 | 8건 (유지 7 / 보류 1) |
| `game8PageMap.json` · `game8Alias.json` | 일본어 스킬 수집용 game8 페이지 주소·별칭 | 매핑 203 / 별칭 24 |
| `dataFreshness.json` | 각 파일의 asOf / 만료일 | — |
| `glossary.json` | 커뮤니티 번역용 게임 용어 3개 국어 표기 (§7-3) | 20건 |

## enikk 실사용 조합 3종 — 수집 규칙 (2026-08-19~21 신설)

캠페인·보스전·타워 세 모드의 "실제로 쓰인 5인 조합"이다. 엔진의
`findRealUsageTeamMatch`가 이걸 읽어 **prydwen 등재 조합과 같은 층에서 겨루게** 한다.
(PvP는 예전부터 `metaStats.pvp.topTeams`를 썼다.)

### 왜 화면에서 옮기나 — enikk API를 쓰지 않는 이유

enikk에는 공개 GraphQL(`/api/graphql`)이 있고 인트로스펙션도 열려 있어 전부 받아올 수 있다.
**그런데 robots.txt가 `Disallow: /api/`다.** prydwen도 똑같이 페이지는 열고 API는 막아뒀고,
우리 수집기는 지금까지 전부 페이지만 긁어왔다. **그 선을 우리가 먼저 깨지 않는다.**

그래서 이 세 파일은 **브라우저로 페이지를 열어 화면 값을 사람이 옮긴 것**이다(A등급).
아이콘의 접근성 이름이 정확한 캐릭터명("B2 Crown")이라 사진 판독보다 정확하다.
자동 수집기를 만들지 말 것. 허락을 받고 싶다면 운영자 연락처는
Discord `discord.gg/sQheBjh3mT` · Ko-Fi `ko-fi.com/swayre`(운영자 swayre)다.

### 읽을 때 오해하기 쉬운 것

- **보스전은 속성이 맞는 시즌만 본다.** 솔로레이드는 시즌마다 보스 약점이 다르고 조합이
  그에 맞춰 짜인다. 작열 시즌 조합을 철갑 보스에 추천하면 안 된다. 엔진이 `bossElement`로
  거른다
- **`parses`는 전 서버 합계가 아니다.** 각 행은 (조합 × 서버) 단위다. 1위 1,528건은 KR 표본
- **타워 `% of clears`는 그 풀 안에서의 비율이다.** 엘리시온 1위 38.1%는 전체 클리어 대비로는
  7%대다. **풀끼리 비교하지 말 것**
- **`lowestPower`는 진입 문턱의 실측치다** — 그 조합으로 클리어한 기록 중 가장 낮은 전투력.
  화면 표기 그대로 문자열(`"55.8K"`)로 둔다. 반올림된 라벨이라 숫자로 바꾸면 없는 정밀도가 생긴다
- **애장품 정보는 없다.** 멤버별 돌파/코어·CP는 화면에 있지만 그건 그 기록을 남긴 플레이어의
  상태이지 조합의 필요 조건이 아니다. 그래서 엔진이 `[출처 한계]` 한 줄로 "이 기록의 주인이
  애장품과 함께 썼는지는 알 수 없다"고 밝힌다

### 이름이 같은데 다른 인물 — `enikkAlias.json`

enikk은 콜라보를 짧게 적는다(`Ada`/`Takina`/`Jill`/`Mari`). 대부분은 단순 별칭이지만
**`Rei`는 함정이다** — enikk의 `Rei`는 아야나미 레이(버스트3·작열)인데, 우리 DB에도
`Rei`라는 title이 있고 그건 **라이(버스트1·수냉·방어형)**로 전혀 다른 인물이다.
이름만 맞춰보면 그냥 통과해서 엉뚱한 캐릭터가 조합에 들어간다.

그래서 별칭 키가 우리 title과 겹치면 `collisionNotes`에 **왜 다른 인물인지**(버스트·속성)를
적어야만 `checkData`가 통과시킨다(`ENIKK_ALIAS_COLLISION`).

### 사람이 옮기는 데이터라 검사를 강하게 건다 (전부 역테스트 완료)

| 검사 | 잡는 것 |
|---|---|
| `SRTEAM_*` / `TOWERCOMP_*` / `CAMPCOMP_*` | 이름이 DB `title`과 다름 · 5인 아님 · 중복 · 수치 형식 |
| `*_ORDER` | 사용 횟수 내림차순이 깨짐 = **화면과 행이 밀려 적힘** |
| `TOWERCOMP_INELIGIBLE` | 기업 타워 풀에 그 기업 자격이 없는 멤버 (엔진에서 영원히 매칭 안 되는 조용한 사문화) |
| `CAMPCOMP_PCT_MISMATCH` | `% of clears ≠ totalUses/analyzedClears` — **두 열이 서로를 검증한다** |
| `ENIKK_ALIAS_COLLISION` | 위 `Rei` 사례 |

캡처일은 **풀·시즌 단위**로 적는다. 칩을 하나씩 열어 옮기므로 같은 날이 아닐 수 있고,
파일 전체에 날짜 하나를 붙이면 한 풀만 낡는 상황을 놓친다.

### ⚠️ 스킬 수치는 **레벨 10 기준**입니다 (2026-08-13 정정)

`skills[].desc`의 퍼센트 수치는 **스킬 레벨 10 기준**입니다. 이 값이 몇 레벨 기준인지
어디에도 안 적혀 있던 탓에 오래 틀린 채로 나가 있었습니다.

**무슨 일이 있었나.** 도감 196페이지가 "출처: prydwen.gg"라고 적어놓고 **레벨 1 기준의
낡은 수치**를 보여주고 있었습니다. 나무위키(10레벨 명시)와 값이 달라서 출처 충돌인 줄
알았는데, prydwen 현재 페이지를 직접 받아 대조해보니 **나무위키와 prydwen이 일치하고
우리만 달랐습니다.**

| | 노이즈 `Chorus` | 크라운 `One for All` | 라피: 레드 후드 부착 대미지 |
|---|---|---|---|
| 우리(구) | 5.86% | 40.32% | 94.2% |
| prydwen 현재 = 나무위키 10레벨 | 10.66% | 64.51% | 150.72% |

니케 스킬 수치는 레벨 1→10으로 선형 증가합니다(5.86 / 6.4 / 6.93 / 7.46 / 8.0 / 8.53 /
9.06 / 9.59 … 10레벨 10.66). 표본 8명 전부 불일치했고, 15개 값 중 0개가 발견됐습니다.

**갱신 방법**: `node scripts/refreshSkillsFromPrydwen.mjs --write`
(미리보기는 `--write` 없이, 일부만 하려면 `--only noise,crown`)

- 우리 `id`가 **prydwen 슬러그와 그대로 같습니다** — URL은 `prydwen.gg/nikke/characters/{id}`
- ⚠️ **Node 내장 `fetch`는 prydwen에서 항상 403이 납니다.** 같은 URL·같은 User-Agent로
  `curl`은 200입니다(실측). 빈도 문제가 아니라 TLS 지문 차이라 스크립트가 `curl`을 씁니다.
  `fetch`로 바꾸지 마세요
- ⚠️ 페이지에 박힌 skills JSON은 **이스케이프가 두 겹**입니다. 손으로 `\"`를 먼저 풀면
  `\\n`이 깨져 특정 캐릭터만 조용히 파싱에 실패합니다(노이즈에서 실제로 겪음).
  **두 번 `JSON.parse`** 하세요
- 받은 HTML은 OS 임시 폴더에 캐시됩니다. 다시 받으려면 그 폴더를 지우세요
- 수집 시점과 레벨 기준은 `dataFreshness.characterSkills`에 기록됩니다

### ⚠️ 이미지는 두 파일이 각자 들고 있습니다

`characterDatabase.json`과 `characters.js` **양쪽 모두** `img` 필드가 있습니다.
화면 그리드는 `characters.js` 쪽을 읽습니다. 한쪽만 고치면 화면이 안 바뀝니다(실제로 겪음).
`UI_IMG_MISMATCH` 검사가 이걸 잡아줍니다.

이미지 경로 규칙: **디코딩한 파일명의 MD5 앞 1글자/앞 2글자**.
반드시 `_MI.png`(상반신)를 쓰세요. `_FB.png`는 전신이라 세로형 카드에서 혼자 튑니다.

### 캐릭터 이름 표기 (어기면 데이터가 무시됩니다)

- 항상 `characterDatabase.json`의 **`title` 값을 정확히** 사용. 축약형 금지
- 과거 사고: `Ada`/`Takina`/`Jill`/`Mari`/`Asuka`/`Rita` 축약형 → 데이터 통째로 무시
- 정식 표기: `Ada Wong`, `Takina Inoue`, `Jill Valentine`, `Mari Makinami Illustrious`, `Asuka Shikinami Langley`, `Liter`
- prydwen 표기와 다른 경우: prydwen `Eve` = 우리 `EVE`, prydwen `Asuka Shikinami Langley: Wille` = 우리 `Asuka: WILLE`
- 조건을 이름에 붙이지 마세요. `"Zwei (Treasure)"` 금지 → `requiresTreasure: ["Zwei"]` 필드 사용

---

## prydwenTags — 조건부 캐릭터 표시

prydwen 티어리스트가 캐릭터 아이콘에 붙여둔 라벨을 그대로 옮긴 값입니다.

| 태그 | 원문 | 뜻 | 인원 |
|---|---|---|---|
| `limited` | is a limited character that isn't available in the general pool | 한정 | 50 |
| `partner` | can only shine if a specific unit is in the team | 특정 동료 필요 | 22 |
| `invest` | heavy investment is required | 고투자 전제 | 16 |
| `expert` | requires high manual skill | 수동 조작 숙련 | 7 |

수집: https://www.prydwen.gg/nikke/tier-list 의 `div.avatar-card` → `.emp-name` + `.new-tag`(클래스명이 곧 태그)
`treasure` 태그는 `characters.js`의 `hasTreasure`로 따로 다루므로 넣지 않습니다.
`X (Treasure)` 항목에만 붙은 태그는 `prydwenTagsTreasure`로 분리(Zwei, Tove).

### 5-1. `partner`의 짝은 데이터에서 계산합니다

태그는 "조건부"라는 사실만 알려주고 **누가 파트너인지는 안 알려줍니다.**
그래서 조건부 확률로 뽑습니다 — "이 캐릭터가 나온 팀 중 몇 %에 저 캐릭터가 같이 있었나".
단순 동시 등장 횟수는 크라운·아니스 스타 같은 범용 픽이 항상 1등이라 무의미합니다.

최소 5팀 등장 + 70% 이상만 인정 → 6명:
`Prika→Mint 100%`, `Tia→Naga 100%`, `Arcana↔Isabel 100%`,
`Emma:TU→Eunhwa:TU/Vesti:TU 100%`, `Velvet→Little Mermaid 73%`

### 5-2. 사용 방식 — 점수를 깎지 않습니다

`invest`/`expert`/`partner` 모두 **근거 문장에 `[조건 확인]`으로 표시만** 합니다.
유저 투자 수준을 모르는 상태에서 감점하면 이미 키운 사람에게 틀린 추천을 하게 됩니다.
AI 프롬프트에도 `[조건 확인]` 항목은 반드시 포함하되 겁주지 말라고 명시했습니다.

---

## 오버스펙(Overspec) 플래그

> 2026-08-08 추가. claude.ai 프로젝트 문서에서 이관.

오버스펙 = **3대 기업 캐릭터의 파워업 버전**. **소속 기업을 그대로 유지**하면서
**필그림/오버스펙 타워에도** 들어간다 → 원 소속 기업 타워 + 필그림 타워 **양쪽 사용 가능**.
라피: 레드 후드 출시(2025-01-01) 때 필그림 타워가 '필그림/오버스펙 타워'로 개편된 것이 근거.

`characterDatabase.json`에 `overspec: true` + `overspecNote`(출처)를 붙인다.

| 캐릭터 | 소속 | 버스트 | 출시 |
|---|---|---|---|
| Rapi: Red Hood | elysion | B3 | 2025-01-01 |
| Mihara: Bonding Chain | missilis | B3 | 2025-05-01 |
| Anis: Star | tetra | B1 | 2026-04-23 |
| Neon: Vision Eye | missilis | B3 | 2026-04-30 |

### 오버스펙이 아닌 것 (헷갈리기 쉽다)

- **아비스타** — 3.5주년 동시 출시지만 풀돌 배포 일반 SSR (squad: Overseer)
- **앵커: 이노센트 메이드 / 델타: 닌자 시프** — SR의 SSR 버전이지만 코스튬 알트
- **아니스: 스파클링 서머 / 네온: 블루 오션** — 2023년 수영복 알트

"SR이 SSR 버전을 받으면 오버스펙"이 **아니다.** 미하라가 2번째 오버스펙인데
앵커: 이노센트 메이드가 더 먼저 나왔다는 사실이 이를 증명한다.

> ⚠️ **네온: 비전 아이는 소속이 바뀌었다.** 원본 네온은 엘리시온이지만 비전 아이는
> **미실리스**다(nikke.gg "Missilis Overspec", 엘리시온 타워 사용 불가). DB 값이 맞으니 고치지 말 것.

### checkData 검증

| 검사 | 내용 |
|---|---|
| `OVERSPEC_PILGRIM` / `OVERSPEC_ABNORMAL` | 잘못된 대상에 플래그 → ERROR |
| `OVERSPEC_NO_SOURCE` | `overspecNote` 출처 누락 → WARN |
| `TOWER_NON_OVERSPEC` | 제조사가 섞인 tribe_tower 조합에 필그림·오버스펙이 아닌 멤버가 있으면 ERROR. 새 오버스펙 출시 시 플래그 누락을 자동 검출. **역테스트로 발화 확인함** |
| `TOWER_MIXED_ARCH` | 필그림 없이 제조사만 섞인 조합 → ERROR |

⚠️ `TOWER_NON_OVERSPEC`은 prydwen이 그 캐릭터를 필그림 타워 조합에 넣어준 **뒤에야** 발화한다.
출시 직후 몇 주의 공백은 사람이 메워야 한다 → `docs/weekly-research.md`

### 남은 문제 — tribe_tower 아키타입에 타워 정보가 없다

아키타입 30개에 `mode: "tribe_tower"`만 있고 `corp`/`tower` 필드가 없다. 이름으로도 판별
불가("Tower of Fantasy"=엘리시온, "Bunny? Bunnies!"=테트라). **멤버 제조사로 유도해야 한다** —
전원 동일 제조사면 그 타워, 섞여 있으면 필그림 타워. 현재 섞인 것은 정확히 2건이고
둘 다 필그림 타워라 규칙이 성립한다.

### 출처

- [오버스펙 정의 — gamechosun](https://www.gamechosun.co.kr/webzine/article/view.php?no=210977)
- [3.5주년 뉴 카운터스 — 인벤](https://www.inven.co.kr/webzine/news/?news=315569)
- [Tribe Tower — Fandom](https://nikke-goddess-of-victory-international.fandom.com/wiki/Tribe_Tower)
- [Manufacturer Tower teams — lootandwaifus](https://lootandwaifus.com/teams/nikke-manufacturer-tower-teams/)
- [Neon: Vision Eye 분석 — nikke.gg](https://nikke.gg/neon-vision-eye-analysis-should-you-pull/)
- [트라이브/기업 타워 — 디스이즈게임](https://www.thisisgame.com/articles/209101)
