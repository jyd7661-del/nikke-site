// 도감이 쓰는 **언어별 라벨** — 클라이언트 안전 모듈 (2026-08-24 분리)
//
// ■ 왜 lib/dex.js에서 떼어냈는가 (성능 사고를 막기 위해)
//
//   도감을 다국어로 만들면서 라벨 헬퍼를 lib/dex.js에 넣고 클라이언트 컴포넌트에서
//   import했더니, lib/dex.js가 최상위에서 읽는 characterDatabase.json(666KB) ·
//   synergyNotes.json(331KB) · characterInvestmentNotes.json(94KB)이 **통째로 브라우저
//   번들에 실렸다.** /nikke의 First Load JS가 94kB -> 347kB로 뛰었다(빌드 출력으로 확인).
//
//   화면에는 아무 증상이 없다 — 느려질 뿐이다. 전형적인 조용한 사고라서 여기 적어둔다.
//   **클라이언트 컴포넌트에서 lib/dex.js를 import하지 말 것.** 이 파일은 glossary.json
//   (5KB) 하나만 읽는다.
//
// ■ 표기의 단일 출처는 data/glossary.json이다
//   세 언어가 한 줄에 있고 행마다 source가 붙어 있다. 여기서 따로 번역표를 만들면
//   용어집과 조용히 어긋난다.
import glossary from '@/data/glossary.json';
import squadNames from '@/data/squadNames.json';

const TERMS = new Map((glossary.terms || []).map((t) => [t.key, t]));

export function termLabel(key, lang, fallback) {
  const t = TERMS.get(key);
  if (!t) return fallback ?? key;
  return t[lang] || t.ko || fallback || key;
}

export const classLabel = (v, lang) => termLabel(`class_${v}`, lang, v);
export const elementLabel = (v, lang) => termLabel(`element_${v}`, lang, v);
export const corpLabel = (v, lang) => termLabel(`corp_${v}`, lang, v);

// 무기(AR/MG/RL/SR/SG/SMG)는 세 언어가 같은 약어라 용어집에 없다. 대문자로만 정규화한다.
export const weaponLabel = (v) => String(v || '').toUpperCase();

// 소속 부대. data/squadNames.json은 나무위키 캐릭터 문서에서 옮긴 값이고
// **음차가 아니다** — Matis→메티스, Extrinsic→익스터너, Talentum→달란트,
// The Carronades→리틀 캐논. 그래서 없는 언어를 지어내지 않고 영문으로 폴백한다.
// (일본어는 아직 없다. game8에서 따로 옮겨야 한다)
const SQUADS = squadNames.squads || {};
export function squadLabel(en, lang) {
  if (!en) return '';
  const row = SQUADS[en];
  if (!row) return en;
  return row[lang] || en;
}

// prydwen 티어리스트 태그 -> i18n 키. 라벨 문구 자체는 lib/i18n.js에 있다.
export const TAG_I18N_KEY = {
  limited: 'dex_tag_limited',
  invest: 'dex_tag_invest',
  expert: 'dex_tag_expert',
  partner: 'dex_tag_partner',
};

// 아키타입의 mode -> i18n 키. lib/dex.js의 MODE_KR과 같은 매핑을 언어별로 쓴다.
export const MODE_I18N_KEY = {
  campaign: 'mode_campaign', story: 'mode_campaign',
  bossing: 'mode_bossing', raid: 'mode_bossing',
  pvp: 'mode_pvp', tribe_tower: 'mode_tribe_tower',
};
