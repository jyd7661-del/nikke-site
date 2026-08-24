# 새 캐릭터를 추가할 때 (실행 순서)

2026-08-24에 페르소나 콜라보 2명(`queen-makoto`·`yukiko`)을 넣으면서 정리한 절차다.
**밟은 함정을 전부 적어뒀으니 순서대로 따라갈 것.** 다섯 개를 밟았고 그중 둘은
화면에 아무 증상이 없는 종류였다.

## 0. 전제 — prydwen 티어리스트에 카드가 있어야 한다

`tiers.story/bossing/pvp` 3개가 **필수**이고(`checkData`의 `SHAPE_TIER`), 허용 등급은
`SSS~F`뿐이라 '미평가'를 표현할 방법이 없다. 티어가 없으면 **넣지 않고 기다린다** —
값을 지어내는 것은 설계원칙 2 위반이다(유저 결정 2026-08-18).

주간 점검이 알아서 알려준다:

```bash
node scripts/weeklyCheck.mjs
```

> `신규 캐릭터 N명이 prydwen에 있고 우리 DB에 없음` → 각 줄에 `티어 있음 → 추가 가능` /
> `아직 없음(추가 불가)`이 함께 나온다.

## 1. prydwen에서 기본 값 뽑기

캐시는 `os.tmpdir()/prydwen-cache/<id>.html`에 있다(주간 점검이 하루 단위로 받아둔다).
페이지에 박힌 JSON에서 그대로 옮긴다 — **A등급, 자동 반영 대상**이다.

```bash
node -e "
const fs=require('fs'),os=require('os'),path=require('path');
const s=fs.readFileSync(path.join(os.tmpdir(),'prydwen-cache','<slug>.html'),'utf8').replace(/\\\\\\\\\"/g,'\"');
const g=k=>{const m=s.match(new RegExp('\"'+k+'\"\\\\\\\\s*:\\\\\\\\s*\"([^\"]*)\"'));return m?m[1]:'(없음)'};
for(const k of ['rating_story','rating_boss','rating_pvp','burst_type','weapon','element','class','manufacturer','rarity']) console.log(k,'=',g(k));
"
```

`burst_type`은 `III` 꼴이므로 `'3'`으로 옮긴다. `element`/`class`/`manufacturer`/`weapon`은
**소문자**로 저장한다(`fire`, `attacker`, `abnormal`, `sg`).

## 2. ⚠️ 함정 1 — `prydwenTags`는 이름 **뒤**에 있다

태그는 티어리스트 페이지(`https://www.prydwen.gg/nikke/tier-list`)의
`<span class="emp-name">이름</span>` **다음에 오는** `<div class="tag-container">`에 있다.
이름 **앞**을 보면 조용히 빈 배열이 나온다 — 처음에 그렇게 짰다가 기존 185명으로
역검증하니 **77건이 불일치**했고, 전부 "우리[limited] 추출[]" 꼴이었다.
**빈 값을 내는 방향이라 그대로 썼으면 새 캐릭터에 조용히 빈 태그가 들어갔을 것이다.**

고친 뒤 **185 일치 / 0 불일치**. 새로 뽑을 때도 기존 캐릭터로 역검증하고 나서 쓸 것.

태그가 없으면 **`prydwenTags` 필드 자체를 두지 않는다**(`SHAPE_TAG`).

## 3. ⚠️ 함정 2 — `name_kr`은 나무위키 **문서명** 기준이다

괄호가 들어가는 이름은 **괄호 앞에 공백을 넣지 않는다.**

| | |
|---|---|
| 나무위키 문서명 | `퀸(니지마 마코토)` ✅ |
| 기존 선례를 따라 넣었던 값 | `퀸 (니지마 마코토)` ❌ |

공백이 있으면 `refreshSkillsKrFromNamu`가 문서를 못 찾아 `문서/스킬 절 못 찾음`으로
실패한다. 공백을 빼면 `TITLE_OVERRIDE` 없이 통과한다(195 → 196명).

> 선례(`아야나미 레이 (가칭)`)는 "(가칭)"이 이름의 일부가 아니라 상태 표시라서 다르다.
> **괄호 표기는 선례보다 나무위키 문서명이 기준이다.**

`name_ja`는 `data/game8PageMap.json`의 키를 쓴다(예: `クイーン（新島真）`, `天城雪子`).

## 4. `characterDatabase.json`에 추가

`skills: []`로 두고 다음 단계에서 채운다. 필수 필드:
`id / title / name_kr / name_ja / class / burst / element / weapon / tiers / skills`
(+ 관례상 `manufacturer / rarity / releaseDate`)

- **`id`는 공개 URL이다**(`/nikke/[id]`, sitemap). 소문자·숫자·하이픈만 — 어기면 `ID_URL_UNSAFE`
- `releaseDate`는 **픽업 시작일**(목요일). 기존 값들이 전부 그 기준이다
- `squad`는 영문 표기가 확인될 때만 넣는다. game8은 일본어로만 주므로(`心の怪盗団`)
  번역하면 추론(B등급)이 된다 — **비워두는 쪽이 맞다**

## 5. 스킬 3개 국어 채우기

```bash
node scripts/refreshSkillsFromPrydwen.mjs --only <id> --write   # 영어 (--only 지원)
node scripts/refreshSkillsKrFromNamu.mjs --write                 # 한국어 (--only 없음, 전체)
node scripts/refreshSkillsJaFromGame8.mjs --write                # 일본어 (--only 없음, 전체)
```

⚠️ **뒤의 둘은 `--only`를 지원하지 않는다.** 전체를 돌지만 **검증 통과분만 저장**하므로
다른 캐릭터가 망가지지 않는다. 실제로 diff가 새 캐릭터 2명에만 국한됐다(82줄 추가, 삭제 0).

### ⚠️ 함정 3 — 숫자 대조 실패는 **정상 동작**이다

`yukiko`의 일본어가 저장 거부됐다:

```
yukiko  스킬1 숫자 불일치: 영어 1/3/5.7/65.37/15/400.31 vs 일본어 1/21.12/2
```

game8 페이지가 아직 채워지는 중이었다(같은 페이지의 `評価ランク` 칸도 비어 있었다).
**부분적으로 맞는 데이터보다 없는 게 낫다** — 억지로 넣지 말고 다음 실행에 맡긴다.

## 6. ⚠️ 함정 4 — 화면 목록(`data/characters.js`)에도 넣어야 한다

빼먹으면 **엔진에는 있는데 사용자가 고를 수 없는** 상태가 된다. `checkData`의
`UI_MISSING_CHAR`가 잡는다(실제로 잡혔다).

```js
{ id: 'yukiko', name: '아마기 유키코', burst: 3, tier: 'T1', role: ['딜러', '힐러'] },
```

- `tier`(T0~T3)는 엔진 `tiers`의 **최고 등급** 기준. 실측 분포: `T0=SS~SSS · T1=S · T2=A~B · T3=C 이하`
- `role`은 **game8 평가문에 근거**를 둔다(예: `ヒーラー兼アタッカー` → 딜러·힐러).
  현재 어떤 코드도 읽지 않는 표시용 값이다(파일 상단 주석은 낡았다)
- `img`는 위키에 초상화가 없으면 **넣지 않는다**(아래 8번)

## 7. 새 제조사·새 용어가 나오면 `glossary.json`

세 언어가 다 있어야 도감이 언어별로 표시한다. 2026-08-24에 `corp_abnormal`이
빠져 있어 추가했다(ko=나무위키, en=prydwen JSON, ja=game8 `所属企業`).

⚠️ **용어집은 번역 보호 치환에도 쓰인다.** `Abnormal` 같은 일반 단어를 그대로 보호하면
본문이 깨지므로 `lib/glossary.js`의 `AMBIGUOUS_EN`/`AMBIGUOUS_JA`에 함께 넣는다.
원칙은 그 파일 주석에 있다 — *"확신이 없으면 목록에 넣는 쪽이 안전하다."*

## 8. 이미지 — 없으면 비워둔다

우리 이미지는 팬덤 위키 핫링크 하나뿐이다(`lib/nikkeImage.js`). 신규 캐릭터는
상반신 초상화(`_MI.png`)가 올라오기까지 며칠~몇 주 걸린다. 확인 방법:

```bash
curl -sS -A "Mozilla/5.0" -G "https://nikke-goddess-of-victory-international.fandom.com/api.php" \
  --data-urlencode "action=query" --data-urlencode "list=allimages" \
  --data-urlencode "aiprefix=<이름>" --data-urlencode "format=json"
```

없으면 `img`를 빼둔다. 도감 목록·`CharacterAvatar`가 **이름 첫 글자 자리표시자**를 그린다
(2026-08-24에 이 처리를 넣기 전에는 목록에 **큰 빈 상자**가 났다 — 그리드 행 높이는
다른 카드가 정하기 때문이다).

## 9. 신선도 갱신 + 검사 + 배포

```bash
node -e "const fs=require('fs');const p='data/dataFreshness.json';const f=JSON.parse(fs.readFileSync(p,'utf8'));f.characterDatabase.asOf='YYYY-MM-DD';fs.writeFileSync(p,JSON.stringify(f,null,2)+'\n')"
npm run verify
npx next build && npm run check:canonical
```

`asOf`를 안 갱신하면 `TAGS_MAYBE_STALE` 경고가 뜬다 — **티어리스트를 실제로 다시 받아
태그를 대조했을 때만** 갱신할 것.

기준선: `checkData` ERROR 0 / WARN 3 · `testI18n` 22 · `testCharacterNames` 26 ·
`testGlossary` 35 · `findTotems` 1군 0명 · `checkAdPlacement` ERROR 0 ·
`checkCanonical` ERROR 0(사이트맵 URL 수는 캐릭터가 늘면 함께 는다)

**도감 페이지와 sitemap은 자동으로 따라온다** — 손으로 만들지 않는다. 실제로
201 → 203으로 늘었다.

## 10. 나중에 채워질 것들

캐릭터를 넣은 뒤에도 **비어 있는 채로 남는 것**이 있다. 아무도 안 보면 영영 빈다:

| 항목 | 언제 채워지나 | 확인 방법 |
|---|---|---|
| `img` | 팬덤 위키에 `_MI.png`가 올라오면 | 위 8번 API |
| 일본어 스킬 | game8이 페이지를 채우면 | `refreshSkillsJaFromGame8` 재실행 |
| `squad` | 영문 표기가 확인되면 | — |

---

## 관련 문서

- `docs/data.md` — 데이터 파일 구조, prydwenTags, enikk 수집 규칙
- `docs/i18n.md` — 3개국어 표기, 용어집, 이름 보호
- `.claude/rules/data-files.md` · `.claude/rules/ui-i18n.md` — 파일을 건드릴 때 자동으로 들어오는 규칙
- `docs/open-items.md` — 페르소나 콜라보 절에 이번 작업의 경위가 있다
