---
description: prydwen에 새 니케가 떴을 때 우리 DB에 추가한다 — 초안 스크립트로 값·출처를 모으고 docs/new-character.md 순서대로 넣은 뒤 검사·빌드까지. 주간 점검이 "티어 있음 → 추가 가능"을 올렸을 때 쓴다.
---

# 새 캐릭터 추가 (`/new-character`)

절차의 정본은 **`docs/new-character.md`**(밟은 함정 포함). 이 스킬은 그 순서를 실행 가능한 명령으로 묶은 것이다.

## 0. 넣어도 되는가

- 주간 점검 보고서(`reports/*-auto.md`)가 **"티어 있음 → 추가 가능"**이라고 한 캐릭터만. 티어가 없으면 **기다린다**(값을 지어내지 않는다)

## 1. 초안 — 조사를 한 번에

```bash
cd nikke-site
node scripts/newCharacterDraft.mjs --slug=<prydwen slug> --kr="<나무위키 문서명 후보 — 예: 신 : 스위프트 바니>"
```

- 대조군(`drake`)이 우리 DB와 안 맞으면 멈춘다 — 추출기를 믿지 말 것
- 태그 역검증 불일치가 있으면 `prydwenTags`를 손으로 확인
- "확인 필요"를 전부 처리한다: **출시일**(game8 가챠 `開催期間`과 나무위키 대조) · **squad**(game8 `部隊` → `data/squadNames.json` 역조회만) · game8 표기

## 2. 넣기 (docs/new-character.md 4·6·7단계)

- `data/characterDatabase.json` 끝에 초안 추가(`skills: []`). JSON은 `indent=2` 왕복이 원본과 같은지 확인하고 쓴다
- `data/game8PageMap.json`에 `"<name_ja>": "https://game8.jp/nikke/<번호>"`
- `data/characters.js`에 한 줄(버스트 구역 안, 기존 줄 형식 그대로). `tier`는 최고 등급 기준(T0=SS~SSS · T1=S · T2=A~B · T3=C 이하), `img`는 DB와 **같은 값**
- 새 제조사·용어면 `data/glossary.json`(세 언어 출처 확인)
- `data/soloRaidTeams.json`의 `meta.excludedForUnknownMember`에 그 캐릭터가 든 팀이 있으면 **그 시즌 teams의 제자리(rank)로 되돌리고** 목록에서 지운다(2026-09-29: 신 : 스위프트 바니 3팀 — 시즌 41)

## 3. 스킬 3개 국어

```bash
node scripts/refreshSkillsFromPrydwen.mjs --only <id> --write
node scripts/refreshSkillsKrFromNamu.mjs --write     # 전체를 돈다 — 검증 통과분만 저장
node scripts/refreshSkillsJaFromGame8.mjs --write    # game8 503이면 받아 둔 페이지를 /tmp/game8-cache/8<번호>.html 로 넣고 돌린다
git diff --stat   # 새 캐릭터 외에 바뀐 캐릭터가 누구인지 확인(나무위키 자리표시자가 채워져 덤으로 들어오는 경우가 있다)
```

### 3-1. 버스트 쿨감 · 애장품 (2026-10-01)

- 스킬에 `Cooldown of Burst Skill ▼`가 있으면 `data/burstCdr.json`에 원문 그대로(kind·cond·quote). 없으면 `checkData` BURST_CDR_MISSING
- **애장품이 나온 캐릭터**(새 캐릭터든 기존 캐릭터의 애장품 추가든): `node scripts/refreshTreasureSkills.mjs <id>` → `data/treasureSkills.json`.
  애장품은 **기존 스킬 칸에 효과가 붙거나 강화되는** 구조다 — `treasureEffects.json` 설명은 이 원문과 기본 스킬을 **칸별로 대조해** 단계마다
  "새로 붙음 / 강화(기본 → 애장)"만 3개 국어로 쓴다. 기억·요약으로 쓰지 말 것(2026-08 손 요약에서 목단 −20초 누락·츠바이 정반대). 설명 숫자가 원문에 없으면 TREASURE_NUM_UNSOURCED
- 애장품 원문에 쿨감·재진입처럼 **엔진이 쓰는 메커니즘**이 있으면 엔진 데이터(`burstCdr.json` `cond: "treasure"` 등)에도 넣는다

## 4. 검사 · 빌드

```bash
npm run verify && node scripts/findTotems.mjs
npx next build && npm run check:canonical
```

흔히 움직이는 것(2026-09-24 실제로 전부 겪음):
- `TAGS_MAYBE_STALE` — 티어표를 다시 받아 태그를 대조했으면 `dataFreshness.characterDatabase.asOf`를 오늘로
- `analyzeSkillTriggers` 래칫 — 새 표현(이름 붙은 자기 상태 등). 규칙을 늘리거나, 빈도를 원문으로 확정할 수 없으면 **근거를 주석에 적고** 기준선을 올린다
- `simulateTeams` 정보성 기준선(재장전·발수 인원) · `testDataI18n`(공백이 줄면 낮춘다) — 코드 주석에 날짜와 이유
- 기준선을 바꿨으면 `.claude/skills/verify/SKILL.md`도

## 5. 기록 · 배포

- `docs/log/YYYY-MM.md`에 필드별 출처표, `docs/open-items.md` 기준선 줄
- 커밋(파일을 이름으로) · 푸시 → 1~2분 뒤 `https://nikketeamguide.com/nikke/<id>`가 200인지, sitemap에 있는지
- 주간 보고서를 처리했으면 `reports/reviewed.json` (`/weekly-review`)
