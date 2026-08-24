// =============================================================================
// 번역 용어 보호 (2026-08-09)
//
// 커뮤니티 글을 다른 언어로 번역할 때, **니케 이름과 게임 용어는 AI에게 맡기지 않는다.**
// 번역 전에 본문에서 아는 말을 토큰으로 빼내고, 번역이 끝난 뒤 대상 언어 표기로 되돌린다.
//
//   원문  : "라피 : 레드 후드 는 작열 딜러야"
//   보호  : "⟦0⟧ 는 ⟦1⟧ 딜러야"
//   번역  : "⟦0⟧ は ⟦1⟧ アタッカーだよ"
//   복원  : "ラピ：レッドフード は 灼熱 アタッカーだよ"
//
// 이렇게 하면 AI가 이름을 바꿔 쓸 여지가 구조적으로 0이 된다.
// 표기의 단일 출처는 data/characterDatabase.json(title/name_kr/name_ja)과
// data/glossary.json이다. 여기서 새로 이름을 만들지 않는다.
// =============================================================================

import characters from '@/data/characterDatabase.json';
import glossaryData from '@/data/glossary.json';

export const TOKEN_OPEN = '⟦'; // ⟦
export const TOKEN_CLOSE = '⟧'; // ⟧

// -----------------------------------------------------------------------------
// 어느 글자까지가 "같은 낱말"인가
//
// 언어마다 낱말 경계가 다르다. 이걸 언어별로 나누지 않으면
//   - 한국어: "확신"의 '신'이 캐릭터 신(Sin)으로 잡힌다
//   - 일본어: 띄어쓰기가 없어 경계를 글자 종류로 판단해야 한다
//   - 영어  : "D"가 "Delta"의 D로 잡힌다
// 셋 다 조용히 본문을 망가뜨리는 유형이다.
// -----------------------------------------------------------------------------
const HANGUL = /[가-힣]/;
const KATAKANA = /[ァ-ヴー]/;
const HIRAGANA = /[ぁ-ゖ]/;
const KANJI = /[一-鿿]/;
const LATIN_NUM = /[A-Za-z0-9]/;

// 한국어는 조사가 이름에 붙어 나온다("라피가", "네온을"). 조사를 허용하지 않으면
// 실제 문장에서 이름이 거의 안 잡힌다. 길이가 긴 것부터 확인해야 "으로"가 "로"보다 먼저 걸린다.
const KO_PARTICLES = [
  '으로부터', '에게서', '이라고', '라고', '으로', '에게', '한테', '까지', '부터', '이랑', '이나',
  '에서', '보다', '처럼', '만큼', '조차', '마저', '밖에', '이며', '이고', '이라', '으로서', '로서',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로', '랑', '님', '씨', '들',
].sort((a, b) => b.length - a.length);

function koBoundaryOk(text, start, end) {
  const before = text[start - 1];
  if (before && HANGUL.test(before)) return null; // 낱말 한가운데 → 매치 아님
  const after = text.slice(end);
  if (!after) return end;
  if (!HANGUL.test(after[0])) return end; // 뒤가 공백·문장부호·다른 문자 → 여기서 끝
  // 뒤에 한글이 이어지면, 그게 조사로 시작할 때만 이름으로 인정한다.
  //   "라피가"   → '가'로 시작 → 이름 O
  //   "앵커리지" → '리'는 조사가 아님 → 이름 X (낱말 한가운데를 건드리지 않는다)
  //
  // ⚠️ 조사는 **경계 확인에만 쓰고 토큰에 삼키지 않는다.** 삼키면 AI가 보는 문장에서
  //    문법 표지가 사라져("⟦0⟧ 좋아") 어색한 번역이 나온다. 남겨두면 AI가 그 조사를
  //    대상 언어 조사로 자연스럽게 옮긴다("⟦0⟧가 좋아" → "⟦0⟧が好き").
  for (const p of KO_PARTICLES) if (after.startsWith(p)) return end;
  return null;
}

function jaBoundaryOk(text, start, end, form) {
  const before = text[start - 1];
  const after = text[end];
  const sameScript = (ch) => {
    if (!ch) return false;
    if (KATAKANA.test(form[0]) || KATAKANA.test(form[form.length - 1])) {
      // 가타카나 이름은 앞뒤가 가타카나면 더 긴 이름의 일부다
      return KATAKANA.test(ch);
    }
    if (KANJI.test(form[0])) return KANJI.test(ch);
    return false;
  };
  if (sameScript(before) || sameScript(after)) return null;
  // 히라가나가 뒤에 붙는 건 조사(は/が/を…)라 정상이다
  if (after && HIRAGANA.test(after) && KATAKANA.test(form[form.length - 1])) return end;
  return end;
}

function enBoundaryOk(text, start, end) {
  const before = text[start - 1];
  const after = text[end];
  if (before && LATIN_NUM.test(before)) return null;
  if (after && LATIN_NUM.test(after)) return null;
  return end;
}

function boundaryEnd(lang, text, start, end, form) {
  if (lang === 'ko') return koBoundaryOk(text, start, end);
  if (lang === 'ja') return jaBoundaryOk(text, start, end, form);
  return enBoundaryOk(text, start, end);
}

// -----------------------------------------------------------------------------
// 치환하면 안 되는 이름
//
// 게임 이름이면서 일상 낱말이기도 한 것들이다. 이런 건 문맥을 봐야 구분되므로
// 기계적으로 바꾸면 멀쩡한 문장을 망가뜨린다("소다 마시고 싶다" → 캐릭터 이름으로 치환).
// 치환 대신 프롬프트의 용어집으로 넘겨 AI가 문맥으로 판단하게 한다.
//
// ⚠️ 이건 게임 사실이 아니라 **언어 판단**이다. 유저(한국어 원어민 + 게임 지식) 검토 대상이며,
//    HANDOFF §7-3에 검토 요청으로 남겨두었다. 확신이 없으면 목록에 넣는 쪽이 안전하다 —
//    빠지면 이름이 번역 안 될 뿐이지만, 잘못 들어가면 본문이 깨진다.
export const AMBIGUOUS_KO = new Set([
  '신',   // 캐릭터 Sin. 한 글자라 "신경", "신님", "확신" 등과 겹칠 여지가 가장 크다
  '소다', // 음료
  '밀크', // 우유
  '은화', // 銀貨
  '이브', // 전야 / 일반 인명
  '홍련', // 紅蓮 — 관용 표현으로도 쓰인다
  '루피', // 화폐 단위 / 다른 작품 캐릭터
  '파워', // power
  '노아', // 일반 인명
  '아리아', // 성악 aria
  '크라운', // crown
  '민트', // 박하
  '슈가', // sugar
  // 2026-08-10 추가. 한국 서버 정식 표기가 알파벳 'D'라 한글 이름도 'D'로 바꿨는데
  // (출처: wiki3.jp/nikke/page/236 海外名 한국어 칸), 그러면 한국어 문장 속 아무 D나
  // 캐릭터로 잡힌다. 유저 판단: "D를 니케로 말하려면 보통 D만 따로 띄어쓴다" —
  // 즉 문맥을 봐야 구분되므로 기계 치환에서 빼고 AI에게 맡긴다.
  'D',
]);

export const AMBIGUOUS_EN = new Set([
  'D', 'K', 'Power', 'Grave', 'Signal', 'Volume', 'Noise', 'Label', 'Novel', 'Crown',
  'Mint', 'Sugar', 'Milk', 'Soda', 'Crust', 'Bready', 'Clay', 'Rouge', 'Blanc', 'Noir',
  'EVE', 'Viper', 'Drake', 'Guilty', 'Sin', 'Mary', 'Julia', 'Alice', 'Emilia',
  // 2026-08-24 추가 — 기업명 Abnormal. 도감 제조사 표기를 위해 용어집에 넣었는데
  // 영어로는 흔한 형용사라 그대로 보호하면 본문이 깨진다.
  'Abnormal',
]);

export const AMBIGUOUS_JA = new Set([
  'シン', 'パワー', 'ミルク', 'ソーダ', 'ミント', 'シュガー', 'クラウン', 'ノア', 'アリア', '紅蓮',
  'アブノーマル', // 2026-08-24 — 기업명이지만 일본어로도 흔한 외래어다
]);

const AMBIGUOUS = { ko: AMBIGUOUS_KO, en: AMBIGUOUS_EN, ja: AMBIGUOUS_JA };

// -----------------------------------------------------------------------------
// 색인
// -----------------------------------------------------------------------------
let _index = null;

export function buildIndex() {
  if (_index) return _index;
  const entries = [];
  for (const c of characters) {
    if (!c.title || !c.name_kr || !c.name_ja) continue; // checkData의 NAME_MISSING이 잡는다
    entries.push({ id: `c:${c.id}`, kind: 'character', ko: c.name_kr, en: c.title, ja: c.name_ja });
  }
  for (const t of glossaryData.terms || []) {
    if (!t.ko || !t.en || !t.ja) continue; // checkData의 GLOSSARY_INCOMPLETE가 잡는다
    entries.push({ id: `t:${t.key}`, kind: 'term', ko: t.ko, en: t.en, ja: t.ja });
  }
  // 언어별로 "긴 표기 우선" 목록을 만든다. 긴 것부터 집어삼켜야
  // '신데렐라'를 먼저 잡고 그 안의 '신'이 따로 잡히지 않는다.
  const byLang = {};
  for (const lang of ['ko', 'en', 'ja']) {
    byLang[lang] = entries
      .map((e) => ({ entry: e, form: String(e[lang]) }))
      .filter((x) => x.form && !AMBIGUOUS[lang].has(x.form))
      .sort((a, b) => b.form.length - a.form.length || a.form.localeCompare(b.form));
  }
  _index = { entries, byLang };
  return _index;
}

// 용어집이 바뀌면 예전 번역은 낡은 표기를 쓴다. 다시 번역할 대상을 찾기 위한 값.
export function glossaryVersion() {
  const { entries } = buildIndex();
  let h = 5381;
  for (const e of entries) {
    const s = `${e.id}|${e.ko}|${e.en}|${e.ja}`;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return `g${entries.length}-${h.toString(36)}`;
}

// -----------------------------------------------------------------------------
// 보호 / 복원
// -----------------------------------------------------------------------------

/**
 * 원문에서 아는 이름·용어를 토큰으로 바꾼다.
 * 반환: { masked, used } — used[i]는 토큰 i에 대응하는 색인 항목
 */
export function protectText(text, sourceLang) {
  const src = String(text ?? '');
  if (!src) return { masked: '', used: [] };
  const { byLang } = buildIndex();
  const list = byLang[sourceLang] || [];

  // 이미 다른(더 긴) 표기에 먹힌 구간을 표시해 둔다. 겹치는 치환을 막는 핵심.
  const taken = new Array(src.length).fill(false);
  const hits = []; // {start, end, entry}

  for (const { entry, form } of list) {
    let from = 0;
    for (;;) {
      const at = src.indexOf(form, from);
      if (at === -1) break;
      const rawEnd = at + form.length;
      let overlap = false;
      for (let i = at; i < rawEnd; i++) if (taken[i]) { overlap = true; break; }
      if (!overlap) {
        const end = boundaryEnd(sourceLang, src, at, rawEnd, form);
        if (end !== null) {
          let clash = false;
          for (let i = at; i < end; i++) if (taken[i]) { clash = true; break; }
          if (!clash) {
            for (let i = at; i < end; i++) taken[i] = true;
            hits.push({ start: at, end, entry });
          }
        }
      }
      from = at + 1;
    }
  }

  hits.sort((a, b) => a.start - b.start);
  let masked = '';
  let cursor = 0;
  const used = [];
  for (const h of hits) {
    masked += src.slice(cursor, h.start);
    masked += `${TOKEN_OPEN}${used.length}${TOKEN_CLOSE}`;
    used.push(h.entry);
    cursor = h.end;
  }
  masked += src.slice(cursor);
  return { masked, used };
}

/**
 * 번역문의 토큰을 대상 언어 표기로 되돌린다.
 * 반환: { text, ok, missing } — ok=false면 번역을 채택하면 안 된다.
 */
export function restoreText(masked, used, targetLang) {
  const src = String(masked ?? '');
  const missing = [];
  let out = src;
  for (let i = 0; i < used.length; i++) {
    const token = `${TOKEN_OPEN}${i}${TOKEN_CLOSE}`;
    if (!out.includes(token)) { missing.push(i); continue; }
    const replacement = used[i][targetLang];
    out = out.split(token).join(replacement);
  }
  // 쓰지 않은 토큰이 남아 있으면(AI가 없는 번호를 만들어냈다) 그것도 실패로 본다.
  const leftover = out.match(new RegExp(`${TOKEN_OPEN}\\d+${TOKEN_CLOSE}`, 'g'));
  return { text: out, ok: missing.length === 0 && !leftover, missing, leftover: leftover || [] };
}

/**
 * 치환하지 못한(모호한) 이름 중 원문에 실제로 등장한 것만 골라
 * 프롬프트에 넣을 대조표를 만든다. 전부 넣으면 216줄이라 토큰만 낭비된다.
 */
export function ambiguousHints(text, sourceLang, targetLang) {
  const src = String(text ?? '');
  if (!src) return [];
  const { entries } = buildIndex();
  const out = [];
  for (const e of entries) {
    const form = e[sourceLang];
    if (!form || !AMBIGUOUS[sourceLang].has(form)) continue;
    if (src.includes(form)) out.push({ from: form, to: e[targetLang], kind: e.kind });
  }
  return out;
}
