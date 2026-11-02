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
    const burst = BURST_KO[d.burst] || (d.burst === 'flex' || d.burst === 'all' ? '모두(Λ)' : BURST_KO[c.burst] || '?');
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

export function rosterPhotoRequest(prompt, image, model = ROSTER_PHOTO_MODEL, effort = ROSTER_PHOTO_EFFORT) {
  return {
    model,
    max_tokens: 8000,   // 4000이면 가로 캡처(카드 28~42장)에서 답이 끊겼다(11-02 시험)
    output_config: { effort },
    messages: [{
      role: 'user',
      content: [
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
