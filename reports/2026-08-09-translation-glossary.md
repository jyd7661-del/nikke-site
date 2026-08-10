# 번역 용어집·name_ja 유지 보고서 (2026-08-09)

> 이번 실행은 **번역 용어집 유지** 항목(2026-08-09 추가)에 대한 것입니다. 로컬 클론(`Desktop\nikke-site-git`)이 연결돼 직접 읽고 검증까지 수행했습니다.
> **핵심 결론: 이 작업은 이미 로컬 작업본에 완료돼 있습니다.** name_ja 196명 전원 보유, glossary.json 존재, 타워 요일도 이미 수정됨. 그래서 이번에 **데이터 파일은 하나도 수정하지 않았고**(덮어쓰면 NAME_DUP 위험), 대신 기존 값이 출처와 맞는지 **검증(audit)** 했습니다.
>
> ⚠️ 참고: `.git/index.lock`이 이미 존재했습니다(GitHub Desktop이 열려 있는 것으로 추정). `.git`은 건드리지 않았고 git 명령도 쓰지 않았습니다. 이 보고서와 무관합니다.

---

## 1. name_ja가 없는 캐릭터 수

**0명 — 전원 보유(196/196).** `checkData.mjs`에서 `NAME_MISSING`이 뜨지 않습니다(name_kr/name_ja/title 세 언어 모두 전원 채워져 있음). GitHub `main`에는 아직 name_ja가 0개라, 이 데이터는 **커밋 안 된 로컬 작업본**입니다.

## 2. 이번 주 추가한 이름·용어와 출처

**추가 없음.** 신규 미보유 name_ja가 없고, glossary도 이미 완비돼 있어 이번 회차에 추가한 항목이 없습니다.

- 이번 주 신규 이슈인 **니케 × 페르소나 콜라보**(天城雪子/Amagi Yukiko, クイーン(新島真)/Queen(Makoto Niijima), アイギス/Aigis — wiki3 기준 8/13~) 캐릭터는 아직 **미출시**입니다. 캐릭터 이름은 glossary가 아니라 `characterDatabase.json`이 단일 출처이므로, 출시 후 신규 캐릭터 절차(스킬 등 전 필드 확보)로 등록해야 합니다. 지금은 넣지 않았습니다.
- glossary에 새로 넣을 만한 **시스템 용어**는 이번 주 없었습니다(콜라보는 고유명사라 용어집 대상 아님).

## 3. 교차검증 통과/실패 건수

기존 name_ja가 1차 출처와 맞는지 대조했습니다.

**주 대조: wiki3.jp `海外名`(해외명) 페이지 — https://wiki3.jp/nikke/page/236 (JP↔EN↔KR 매핑, 128행)**
- DB의 name_ja가 이 페이지에 존재하는 캐릭터 **128명 전수 대조**:
  - **EN·KR 모두 일치: 123명**
  - name_ja는 전부 출처와 **글자 그대로 일치**. 아래 5건은 **name_ja 오류가 아니라** 영문/한글 표기 관례 차이라 참고용으로만 남깁니다(4번 참고).
- 페이지 236에 없는 **68명(코스튬 변형·최근 신규)**: 이 페이지가 커버하지 않습니다. 이 중 최신 2명은 wiki3 메인 메뉴에서 직접 대조해 확인:
  - `Laplace: Ultimate Hero` → **ラプラス：アルティメットヒーロー** ✓ (wiki3 개최 이벤트 표기와 글자 일치)
  - `Maxwell: Ordinary Mechanic` → **マクスウェル：オーディナリーメカニック** ✓
  - 나머지 66명은 코스튬 변형(base：costume)으로, base 표기가 128명 대조에서 이미 검증됐고 육안 확인상 정상입니다. **다만 페이지 236으로 자동 대조는 안 된 상태**라 6번(확신도)에 남깁니다.

**전사 규칙 함정 케이스 확인(지침에서 지목한 항목):**
- `Frima` → name_kr **프림** / name_ja **プリム** ✓ — 지침이 경고한 "가타카나 직접 전사 시 어긋나는" 바로 그 사례인데, DB는 출처값 プリム을 정확히 보유.
- `Prika`(별개 캐릭터) → **프리카 / プリカ** ✓ — Frima와 혼동 없이 구분돼 있음.

**속성/레어도 교차검증(page 2947 element / page 14 SSR):**
- 이번 회차는 **신규 name_ja 추가가 0건**이라, 신규 페어링 검증용인 element/rarity 대조를 per-unit로 다시 돌리지 않았습니다. DB의 element/rarity 스팟체크(예: Laplace: Ultimate Hero = wind/SSR, Maxwell: Ordinary Mechanic = wind/SSR)는 커뮤니티·wiki 정보와 일치합니다. 신규 캐릭터가 나오면 그때 지침대로 두 검증을 모두 돌립니다.

## 4. 판단이 필요해 B로 남긴 항목 (자동 반영 안 함)

전부 name_ja 자체의 오류가 아니라 표기 관례 문제입니다. 되돌림 불가 오류(NAME_DUP 등)는 없습니다.

1. **에반게리온 콜라보 4명 — 영문 title 어순이 wiki와 다름.** name_ja는 정확합니다.
   - `Asuka Shikinami Langley` (DB) ↔ `Shikinami Asuka Langley` (wiki) / ja=`式波・アスカ・ラングレー`
   - `Rei Ayanami` ↔ `Ayanami Rai` / ja=`綾波レイ` (wiki 로마자 "Rai"는 wiki 쪽 표기 흔들림, DB "Rei"가 표준)
   - `Mari Makinami Illustrious` ↔ `Makinami Mari Illustrious` / ja=`真希波・マリ・イラストリアス`
   - `Misato Katsuragi` ↔ `Katsuragi Misato` / ja=`葛城ミサト`
   - → 서구식(이름-성) vs 일본식(성-이름) 어순 차이일 뿐. **name_ja 반영에는 영향 없음.** title 표기 통일을 원하면 사람이 결정.
2. **D — 한글 표기 `디`(DB) vs 한국 서버 `D`(wiki 海外名).** name_ja는 둘 다 `D`로 동일. 한국 서버 정식 표기가 알파벳 `D`라면 name_kr을 검토할 수 있으나, `D`는 이미 `NAME_SUBSTRING` 경고 대상(다른 이름에 포함되는 1글자)이라 치환 순서 주의가 필요한 이름입니다. **사람 판단 권장.**
3. **페이지 236 미커버 68명(코스튬·신규)의 name_ja 전수 자동대조 미완.** 최신 2명 + base 표기는 검증됨. 원하시면 다음 회차에 캐릭터별 개별 페이지로 68명 전수 대조 가능.

## 5. 타워 요일

**이미 수정 완료 — 이번 변경 없음.** `components/ResultPanel.js`에 2026-08-09자 주석으로 이미 정정돼 있습니다.
- 잘못된 옛 값(prydwen 기반 "월요일 전체 개방")을 폐기하고, **한국 서버 유저 확인 = "일요일에 모든 타워 개방"** 기준으로 수정.
- wiki3.jp/nikke/page/992와 교차검증: 화·금 엘리시온 / 수·토 미실리스 / 목 테트라 / 수 필그림 — 양쪽 일치.
- 남은 불확실성(이미 코드 주석에 기재됨): **테트라 월요일은 일본 위키 단일 출처.** 요일 변경 정황은 이번 조사에서 없었습니다. 변경 정황이 보이면 지침대로 B로 올려 확인받겠습니다.

## 6. 확신도가 낮아 사용자 확인이 필요한 항목

- **68명(코스튬·최근 신규) name_ja는 海外名 페이지로 자동대조되지 않았습니다.** 최신 2명·base 표기·육안 확인으로는 정상. 완전 검증을 원하면 캐릭터별 페이지 대조 필요.
- `海外名` 페이지(236)는 128행만 있어 **로스터(196)보다 68 적습니다** — 이 페이지 자체가 최신 캐릭터/코스튬을 아직 안 실은 상태.
- 4번의 EVA 어순·D 표기: name_ja 문제 아님, 표기 정책 결정 사항.

## 7. checkData.mjs 결과

- 실행 전/후 동일: **ERROR 0 / WARN 3**
- WARN 3건은 전부 `NAME_SUBSTRING`(짧은 이름이 다른 이름에 포함 — 치환은 긴 이름부터 하라는 안내):
  - 한글 18개: 라피, 네온, 델타, 미카, 디젤, 엠마, 은화, 홍련, 솔린, 헬름, 루피, 밀크, 신, 퀀시, 소다, 앵커, 베이, 이브
  - 일본어 8개: ラピ, ミカ, エマ, 紅蓮, シン, D, ベイ, イヴ
  - 영문 2개: D, K
- `NAME_MISSING` / `NAME_DUP` / `GLOSSARY_INCOMPLETE` / `GLOSSARY_DUP` / `GLOSSARY_NAME_COLLISION` **모두 0건.**

## 8. 참고한 출처 목록

- 로컬 클론: `C:\Users\정연도\Desktop\nikke-site-git` (characterDatabase.json 196명, glossary.json 21용어, scripts/checkData.mjs, components/ResultPanel.js)
- wiki3.jp 海外名(JP↔EN↔KR): https://wiki3.jp/nikke/page/236
- wiki3.jp 부대별 분류: https://wiki3.jp/nikke/page/269
- wiki3.jp 속성별 분류: https://wiki3.jp/nikke/page/2947 (glossary element 출처로 이미 등록)
- wiki3.jp 일람: https://wiki3.jp/nikke/page/14 · 트라이브 타워: https://wiki3.jp/nikke/page/992 (타워 요일 교차검증)
- wiki3.jp 메인 메뉴(최신 신캐 표기 확인: ラプラス：アルティメットヒーロー, マクスウェル：オーディナリーメカニック, 天城雪子, クイーン(新島真), アイギス)

## 9. 이번 회차에 로컬 파일에 실제 반영한 내용

**없음.** 데이터가 이미 정확·완비돼 있어 수정하지 않았습니다(덮어쓰기는 NAME_DUP 위험 + 원문 복원 불가 원칙에 저촉). 검증만 수행했습니다.
(대조용 임시 파일 `outputs/wiki236.tsv`는 저장소 밖 스크래치 폴더에만 생성했고 저장소에는 넣지 않았습니다.)

---

이미 다 돼 있어서 이번엔 커밋할 변경이 없습니다. 위 B 항목(EVA title 어순 / D 한글 표기 / 68명 전수 재검증) 중 처리하길 원하는 게 있으면 알려주시면 다음에 진행하겠습니다.
