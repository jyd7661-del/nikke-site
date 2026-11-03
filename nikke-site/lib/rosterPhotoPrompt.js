// **사진으로 보유 니케 넣기 — 프롬프트** (2026-11-02, 유저 "사진으로 내 보유니케 선택이 가능할까?")
// 게임의 「니케」 목록 화면 캡처 한 장을 하이쿠 5.5가 읽어 우리 니케 id 목록으로 바꾼다. 배당달력 import-holdings와 같은 방식
// (장마다 따로·동시에, 생각 low). 운영 라우트와 실험(scripts/experimentRosterPhoto.mjs)이 같은 것을 쓴다.
// ⚠️ 이 파일은 아무것도 import하지 않는다 — node 스크립트가 그대로 부른다. 데이터(화면 목록·엔진 DB)는 인자로 받는다.
//
// 카드에서 읽을 수 있는 것: 이름(길면 잘린다 — 유저 지적, 그래서 그림·아이콘으로도 맞힌다), 왼쪽 위 아이콘 세로줄
// (속성 → 무기 → 버스트 I/II/III → [소장품·애장품]), 오른쪽 아래 클래스 문양. 애장품 = 왼쪽 줄의 **주황색 하트**(유저 확인 11-02).
// 파랑·보라 하트는 일반 소장품이라 애장품이 아니다.

const ELEMENT_KO = { fire: '작열(빨강 불꽃)', water: '수냉(파랑 물방울)', wind: '풍압(초록 바람)', electric: '전격(보라 번개)', iron: '철갑(주황 벌집)' };
const WEAPON_KO = { ar: 'AR', smg: 'SMG', sg: 'SG', sr: 'SR(저격)', rl: 'RL(런처)', mg: 'MG' };
const CLASS_KO = { attacker: '화력형', supporter: '지원형', defender: '방어형' };
const BURST_KO = { 1: 'I', 2: 'II', 3: 'III' };

// 화면 목록(characters.js) 한 명 → 후보 한 줄. 엔진 DB 항목(cdb)에서 속성·무기·클래스를 붙인다.
// altNames(c) → "영어 / 일본어" — 게임을 영어·일본어로 하는 사람의 캡처용(운영 라우트가 lib/characterNames로 넘긴다). 없으면 칸을 비운다.
export function candidateLines(characters, cdbById, altNames = null) {
  return characters.map((c) => {
    const d = cdbById.get(c.cdbId || c.id) || {};
    // 단계를 고르는 니케(burstFlex — 레드 후드·라피: 레드 후드)는 카드에 로마 숫자 대신 Λ가 찍힌다(11-02 캡처 확인)
    const burst = d.burstFlex ? 'Λ(단계 선택)' : BURST_KO[d.burst] || BURST_KO[c.burst] || '?';
    const alt = altNames ? ` | ${altNames(c)}` : '';
    return `${c.id} | ${c.name}${alt} | ${ELEMENT_KO[d.element] || '?'} | ${WEAPON_KO[d.weapon] || '?'} | 버스트 ${burst} | ${CLASS_KO[d.class] || '?'}`;
  }).join('\n');
}

// 영어·일본어 이름(엔진 DB의 title·name_ja) — lib/characterNames.js와 같은 출처. candidateLines·rescueByFragment에 넘긴다.
export function altNamesFromCdb(cdbById) {
  return (c) => {
    const d = cdbById.get(c.cdbId || c.id) || {};
    return [d.title, d.name_ja].filter(Boolean).join(' / ');
  };
}

export function buildRosterPhotoPrompt(candidates, withAltNames = false) {
  const cols = withAltNames ? 'id | 이름 | 영어 / 일본어 이름 | 속성 | 무기 | 버스트 | 클래스' : 'id | 이름 | 속성 | 무기 | 버스트 | 클래스';
  return `승리의 여신: 니케 게임의 「니케」 목록 화면 캡처 한 장이다. 카드마다 니케 한 명이다.

할 일: 캡처에 보이는 카드를 하나씩 읽어, 아래 후보 목록의 id로 바꾼다.

카드 읽는 법
- 이름은 카드 아래쪽에 있다. 게임 언어에 따라 한국어·영어·일본어 중 하나로 적혀 있다. 길면 앞뒤가 잘린다(예: "ㅡ스트 티켓", "ㅣ: 마이티 ㅂ"). 잘린 글자로 후보를 좁히고,
  왼쪽 위 아이콘 세로줄(속성 → 무기 → 버스트 I/II/III)과 그림(머리색·옷·장비)으로 확정한다.
- 그림은 스킨(의상)을 입히면 바뀐다. 이름과 아이콘을 먼저 믿고, 그림은 둘 다 애매할 때만 참고한다.
- 같은 니케의 기본형과 변형(예: "라플라스"와 "라플라스: 얼티밋 히어로")은 다른 id다. 이름에 ":" 뒤 글자가 보이면 변형이다.
  이름이 잘리지 않고 온전히 보이고 ":"가 없으면 기본형이다(예: "메이든"은 메이든이지 메이든: 아이스 로즈가 아니다). 속성 아이콘도 맞는지 본다.
- 애장품: 왼쪽 아이콘 줄 맨 아래에 **주황색 하트**가 있으면 treasure=true. 파랑·하늘색·보라 하트는 일반 소장품이라 false. 하트가 없으면 false.
- 사진 가장자리(위·아래·왼쪽·오른쪽)에 걸려 카드 일부가 잘린 것은 적지 않는다(다른 캡처나 옆 조각에 온전히 나온다).
- 후보 목록에 없는 니케(R 등급 — 솔져 E.G., 프로덕트 08, iDoll 등)는 id를 "none"으로 적는다.
- 확신이 없으면 sure=false로 적는다. 지어내지 않는다.

후보 목록 (${cols})
${candidates}

JSON 하나로만 답한다:
{"cards":[{"seen":"카드에서 읽은 이름 그대로","id":"후보 id 또는 none","treasure":false,"sure":true}]}`;
}

export const ROSTER_PHOTO_MODEL = 'claude-haiku-5-5';
export const ROSTER_PHOTO_EFFORT = 'low';

// legend({type,data}) — 무기 기호 견본 그림(카드 아님). 있으면 캡처 앞에 붙인다.
export function rosterPhotoRequest(prompt, image, model = ROSTER_PHOTO_MODEL, effort = ROSTER_PHOTO_EFFORT, legend = null) {
  return {
    model,
    max_tokens: 8000,   // 4000이면 가로 캡처(카드 28~42장)에서 답이 끊겼다(11-02 시험)
    output_config: { effort },
    messages: [{
      role: 'user',
      content: [
        ...(legend ? [
          { type: 'text', text: '[견본] 무기 아이콘 6종 — 아래 글자가 무기 이름이다. 카드가 아니니 적지 않는다.' },
          { type: 'image', source: { type: 'base64', media_type: legend.type, data: legend.data } },
          { type: 'text', text: '[캡처] 읽을 사진:' },
        ] : []),
        { type: 'image', source: { type: 'base64', media_type: image.type, data: image.data } },
        { type: 'text', text: prompt },
      ],
    }],
  };
}

export function parseRosterPhoto(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return Array.isArray(j.cards) ? j : null;
  } catch { return null; }
}

// AI가 "목록 밖"이라 한 카드를 잘린 이름 조각으로 한 번 더 찾는다(2026-11-02 시험: "터디"→마르차나: 마린 스터디,
// "렐라 : 크리"→신데렐라: 크리스탈 웨이브를 AI가 놓쳤다). 조각(2글자 이상)이 **전부** 들어 있는 후보가 정확히 하나일 때만
// 그 니케로 잇고 sure=false로 둔다 — 화면에서 사용자가 확인한다. R 등급(솔져·프로덕트·iDoll)은 맞는 후보가 없어 그대로 남는다.
// altNames를 주면 영어·일본어 이름에서도 찾는다(대소문자 무시).
export function rescueByFragment(card, characters, altNames = null) {
  if (card.id && card.id !== 'none') return card;
  const frags = String(card.seen || '').toLowerCase().split(/[\s:：()（）·.\-]+/).map((s) => s.replace(/[ㄱ-ㅣ]/g, '')).filter(Boolean);
  // 한 글자 조각도 조건에 넣되(후보를 더 좁힌다), 두 글자 이상 조각이 하나는 있어야 한다 — "니"·"트" 하나로는 고르지 않는다
  if (!frags.some((f) => f.length >= 2)) return card;
  const hay = (c) => `${c.name}|${altNames ? altNames(c) : ''}`.replace(/\s/g, '').toLowerCase();
  const hits = characters.filter((c) => { const h = hay(c); return frags.every((f) => h.includes(f)); });
  return hits.length === 1 ? { ...card, id: hits[0].id, sure: false, rescued: true } : card;
}

// 조각(가로 캡처는 3개)·여러 장의 카드를 니케 하나당 한 줄로 합친다. 화면 확인 목록이 이것이다.
//   sure: 어느 조각에서든 확신하고 읽었으면 true. treasure: 어느 조각에서든 주황 하트를 봤으면 true.
//   목록 밖(none)과 없는 id는 unknown 수로만 센다.
export function mergeScanCards(cards, validIds) {
  const byId = new Map();
  let unknown = 0;
  for (const c of cards) {
    if (!c?.id || c.id === 'none' || !validIds.has(c.id)) { unknown++; continue; }
    const prev = byId.get(c.id);
    if (!prev) { byId.set(c.id, { id: c.id, treasure: !!c.treasure, sure: c.sure !== false && !c.rescued, seen: c.seen || '' }); continue; }
    prev.treasure = prev.treasure || !!c.treasure;
    prev.sure = prev.sure || (c.sure !== false && !c.rescued);
  }
  return { found: [...byId.values()], unknown };
}

// ─────────────────────────────────────────────────────────────────────────────
// 아이콘 먼저 방식 (2026-11-02 실험, 유저 "무기타입 속성 버스트 타입이 동일한 니케 먼저 선별하면 이름 겹치는게 많이 없겠어")
// AI는 카드에서 **본 것만** 적고(속성·무기·버스트·하트·이름 글자 + 참고용 추측), 고르기는 코드(matchObserved)가 한다:
//   아이콘으로 195명을 좁히고 그 안에서 이름 글자로 한 명. 경우의 수(195명 전수, 한 명으로 정해지는 비율):
//     보이는 이름   이름만   속성·버스트+이름   속성·무기·버스트+이름
//     1글자         10.0%    53.6%              87.5%
//     2글자         50.8%    90.2%              96.9%
//   무기 기호를 설명하자 AI 무기 읽기 27 → 93/108. 무기는 맞는 후보가 있을 때만 쓴다(matchObserved).
// ─────────────────────────────────────────────────────────────────────────────

export function buildRosterObservePrompt(candidates, withAltNames = false, withLegend = false) {
  const cols = withAltNames ? 'id | 이름 | 영어 / 일본어 이름 | 속성 | 무기 | 버스트 | 클래스' : 'id | 이름 | 속성 | 무기 | 버스트 | 클래스';
  return `승리의 여신: 니케 게임의 「니케」 목록 화면 캡처 한 장이다. 카드마다 니케 한 명이다.

할 일: 카드마다 **보이는 것을 그대로** 적는다. 해석하지 말고 보이는 대로.

카드에서 읽을 것 (왼쪽 위 아이콘 세로줄, 위에서부터)
- element: 맨 위 육각형 속성 아이콘. 빨강 불꽃=fire, 파랑 물방울=water, 초록 바람=wind, 보라 번개=electric, 주황 벌집=iron. 모르겠으면 "?".
- weapon: 둘째 흰 육각형 무기 아이콘 안의 기호(11-02 캡처에서 무기별로 잘라 확인한 모양):
    ar  = 군데군데 끊긴 원 + 십자선 + 가운데 점(조준경 모양)
    mg  = 끊기지 않은 원 하나 + 가운데 점
    sg  = 네 토막으로 끊긴 점선 원 + 가운데 점
    rl  = 원 없이 안쪽을 향한 괄호 한 쌍과 가운데 점 ")·("
    smg = 아래가 트인 원 안에 세로 막대와 점("ⓘ" 모양)
    sr  = 양옆 괄호 안에 원과 십자 "(⊕)"
${withLegend ? '  **[견본] 그림(세로 한 칸이 같은 무기)과 하나씩 견줘 가장 닮은 것을 고른다.** 헷갈리는 짝: 원 양옆에 괄호 "(( ))"가 붙어 있으면 무조건 SR — AR은 괄호가 없고 십자선 네 가닥이 원 밖으로 튀어나온다. SG는 원이 네 토막, MG는 끊기지 않은 원.\n' : ''}  모르겠으면 "?".
- burst: 셋째 검은 육각형의 로마 숫자. I=1, II=2, III=3. 로마 숫자가 아니라 **Λ(뒤집힌 V)** 모양이면 "all"(버스트 단계를 고르는 니케). 모르겠으면 "?".
- treasure: 넷째 하트가 **주황색**이면 true. 파랑·하늘색·보라 하트나 하트 없음은 false.
- name: 카드 아래쪽 이름에서 **보이는 글자만** 그대로(잘린 글자는 빼고, 덧붙여 짐작하지 않는다). 안 보이면 "".
- guess: 위 정보와 그림으로 짐작한 후보 id(아래 목록). 목록에 없을 것 같으면(R 등급 — 솔져·프로덕트·iDoll 등) "none".
- 사진 가장자리에 걸려 일부가 잘린 카드는 적지 않는다.

후보 목록 (${cols})
${candidates}

JSON 하나로만 답한다:
{"cards":[{"name":"","element":"fire","weapon":"ar","burst":1,"treasure":false,"guess":"id 또는 none"}]}`;
}

const ICON_ELEMENTS = new Set(['fire', 'water', 'wind', 'electric', 'iron']);
const ICON_WEAPONS = new Set(['ar', 'smg', 'sg', 'sr', 'rl', 'mg']);
// 츈→춘: 게임 화면 「포춘」 · 데이터 「포츈」(11-02 무기를 잘못 읽은 판에서 이름으로도 못 찾아 놓쳤다)
const nameKey = (s) => String(s || '').toLowerCase().replace(/[\s:：()（）·.\-…]/g, '').replace(/[ㄱ-ㅣ]/g, '').replace(/츈/g, '춘');

// AI가 본 것(card) → { seen, id, treasure, sure, how } — rescueByFragment와 같은 모양이라 mergeScanCards에 그대로 넣는다.
//   how: exact-name(이름 전체가 한 명과 같음) · icon-name(속성·버스트 안에서 이름으로 한 명) · icon-only(아이콘 조합이 한 명뿐, 이름 없음) · icon-guess(여럿 남아 AI 짐작)
//        · name-only(아이콘이 어긋나 이름으로만) · none
export function matchObserved(card, characters, cdbById, altNames = null) {
  const el = ICON_ELEMENTS.has(card.element) ? card.element : null;
  const wp = ICON_WEAPONS.has(String(card.weapon).toLowerCase()) ? String(card.weapon).toLowerCase() : null;
  const bu = String(card.burst).toLowerCase() === 'all' ? 'all' : [1, 2, 3].includes(Number(card.burst)) ? Number(card.burst) : null;
  const seen = String(card.name || '');
  const key = nameKey(seen);
  const frags = seen.toLowerCase().split(/[\s:：()（）·.\-…]+/).map(nameKey).filter(Boolean);
  const hay = (c) => `${c.name}|${altNames ? altNames(c) : ''}`.replace(/\s/g, '').toLowerCase().replace(/츈/g, '춘');
  // "스 : 스타"처럼 콜론이 보이면 앞은 기본 이름의 **끝**, 뒤는 변형 이름의 **시작**이다(이름은 앞뒤로만 잘린다).
  const colon = seen.match(/^(.*?)\s*[:：]\s*(.*)$/);
  const left = colon ? nameKey(colon[1]) : '';
  const right = colon ? nameKey(colon[2]) : '';
  const nameHit = (c) => {
    if (!frags.length) return true;
    if (colon) {
      const names = [c.name, ...(altNames ? altNames(c).split(' / ') : [])];
      return names.some((n) => {
        const m = n.match(/^(.*?)\s*[:：]\s*(.*)$/);
        return m && nameKey(m[1]).endsWith(left) && nameKey(m[2]).startsWith(right);
      });
    }
    const h = hay(c);
    return frags.every((f) => h.includes(f));
  };
  const out = (id, sure, how) => ({ seen, id, treasure: !!card.treasure, sure, how });
  const iconOf = (c) => cdbById.get(c.cdbId || c.id) || {};
  // 이름이 **다** 보이고 정확히 한 명과 같으면 그 이름이 먼저다 — 아이콘을 하나 잘못 읽어도(11-02: 루드밀라 버스트 I을 III으로)
  // 이름 전체가 맞는 쪽이 더 믿을 만하다. 속성까지 맞으면 확실, 아니면 확인 필요. "엠마"·"엠마: 택티컬 업"처럼 아이콘이 같은 짝도 여기서 갈린다.
  const isExact = (c) => nameKey(c.name) === key || (altNames && altNames(c).split(' / ').some((n) => nameKey(n) === key));
  const exactAll = key ? characters.filter(isExact) : [];
  // 단, 버스트 Λ인데 그 이름이 단계 선택 니케가 아니면 건너뛴다 — "라피"까지만 보이는 라피: 레드 후드는 아래 아이콘 거르기로 간다
  if (exactAll.length === 1 && (bu !== 'all' || iconOf(exactAll[0]).burstFlex)) {
    const d = iconOf(exactAll[0]);
    // 무기가 어긋나고 같은 속성·버스트에 「그 이름 : …」 변형이 있으면 확인 필요 — 11-03 PC 캡처: 「라푼젤 : 퓨어 그레이스」(SR)의
    // 뒷부분을 AI가 빼고 「라푼젤」만 적어 기본 라푼젤(RL)로 확실 처리됐다. 무기는 틀릴 때가 있어 변형이 있을 때만 의심한다
    const variant = wp && d.weapon !== wp && characters.some((c) => {
      const v = iconOf(c);
      return c !== exactAll[0] && nameKey(c.name).startsWith(key) && /[:：]/.test(c.name) && v.element === d.element && Number(v.burst) === Number(d.burst);
    });
    return out(exactAll[0].id, (!el || d.element === el) && !variant, 'exact-name');
  }
  // 무기는 **약하게** 쓴다: 무기 기호 설명을 넣은 뒤 93/108(전엔 27/108 — AI가 기호가 무슨 무기인지 몰랐다)이라
  // 틀릴 때가 있다. 무기까지 맞는 후보 안에서 이름이 맞으면 그것, 없으면 속성·버스트만으로 다시 찾는다.
  // 버스트 Λ(burstFlex)는 그 니케들만. 거꾸로 Λ를 숫자로 잘못 읽어도(11-02 레드 후드를 III으로) 빠지지 않게 단계 선택 니케는 어느 숫자든 통과시킨다.
  // 단, 그 니케가 쓸 수 있는 단계(burstStages)만 — 11-02 「라」·II가 라피: 레드 후드(I·III만)로 확실 처리됐다
  const flexHas = (d) => !!d.burstFlex && (!Array.isArray(d.burstStages) || d.burstStages.map(Number).includes(bu));
  const burstOk = (d) => !bu || (bu === 'all' ? !!d.burstFlex : flexHas(d) || Number(d.burst) === bu);
  const ebPool = characters.filter((c) => {
    const d = iconOf(c);
    return (!el || d.element === el) && burstOk(d);
  });
  const wPool = wp ? ebPool.filter((c) => iconOf(c).weapon === wp) : ebPool;
  const wHits = wPool.filter(nameHit);
  const iconPool = wHits.length ? wPool : ebPool;
  const hits = wHits.length ? wHits : ebPool.filter(nameHit);
  if (hits.length === 1) {
    // 이름 없이 아이콘만으로 한 명이면 R 등급일 수도 있어 확인 필요로 둔다
    if (!frags.length) return out(hits[0].id, false, 'icon-only');
    // 무기가 어긋나 속성·버스트만으로 찾았는데 이름 조각이 다른 니케에도 들어 있으면 확인 필요 — 11-02 PC 캡처:
    // 리틀 머메이드의 "이드"가 버스트를 잘못 읽어 에이드로 확실 처리됐다(무기도 SG로 어긋났다)
    const sure = wHits.length > 0 || characters.filter(nameHit).length === 1;
    return out(hits[0].id, sure, 'icon-name');
  }
  if (hits.length > 1) {
    const g = hits.find((c) => c.id === card.guess);
    return out(g ? g.id : 'none', false, 'icon-guess');
  }
  // 아이콘 안에 이름이 맞는 후보가 없는데 AI 짐작이 아이콘 후보 안에 있으면 그것(확인 필요) — 표기 차이("포춘"·데이터 "포츈") 같은 경우
  const g = iconPool.find((c) => c.id === card.guess);
  if (g) return out(g.id, false, 'icon-guess');
  // 아이콘 안에 이름이 맞는 후보가 없다: 이름이 2글자 이상 보이면 아이콘을 잘못 읽었을 수 있어 이름만으로 한 번 더(확인 필요)
  if (key.length >= 2) {
    const byName = characters.filter(nameHit);
    if (byName.length === 1) return out(byName[0].id, false, 'name-only');
    // 한 글자만 잘못 읽은 이름(11-02 PC 캡처 "시큐널"·"길로"·"트루나") — 속성·버스트가 맞는 니케 중 글자 수가 같고
    // 한 글자만 다른 이름이 하나뿐이면 그것(확인 필요)
    const near = ebPool.filter((c) => {
      const n = nameKey(c.name);
      if (n.length !== key.length) return false;
      let diff = 0;
      for (let i = 0; i < n.length; i++) if (n[i] !== key[i]) diff++;
      return diff === 1;
    });
    if (near.length === 1) return out(near[0].id, false, 'near-name');
    // 이름 **일부**에서 한 글자만 잘못 읽은 경우(11-03 PC 캡처: 「스파클링 서머」의 끝을 「쿨링서머」로) — 속성·버스트가 맞는 니케 이름 안에
    // 같은 길이로 한 글자만 다른 토막이 있는 니케가 하나뿐이면 그것(확인 필요). 짧은 조각은 우연히 겹친다 — 3글자 「레이블」이
    // 「라푼젤 : 퓨어 그레이스」의 「레이스」에 붙었다(지난 사진 카드 다시 돌림) → 4글자 이상만
    if (key.length >= 4) {
      const within = ebPool.filter((c) => {
        const n = nameKey(c.name);
        for (let i = 0; i + key.length <= n.length; i++) {
          let diff = 0;
          for (let j = 0; j < key.length && diff < 2; j++) if (n[i + j] !== key[j]) diff++;
          if (diff === 1) return true;
        }
        return false;
      });
      if (within.length === 1) return out(within[0].id, false, 'near-name');
    }
  }
  return out('none', false, 'none');
}
