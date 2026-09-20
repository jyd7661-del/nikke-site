// 검색엔진에 나가는 제목·설명 — 언어별 (2026-09-19, 언어별 주소 도입과 함께)
//
// ⚠️ **한국어 문구는 언어별 주소 도입 전과 글자 하나 다르지 않게 둔다.** 한국어 주소와 제목이
//    그대로여야 쌓아 둔 한국어 검색 순위를 건드리지 않는다. 9-16에 제목에 세 언어를 섞었다가
//    한국어 검색이 떨어졌다(docs/log/2026-09.md). **한 주소 = 한 언어**다 — 영어 제목에 한국어를,
//    한국어 제목에 일본어를 섞지 않는다(한국어 제목의 "(Crown)"만 예외 — 도입 전부터 있던 표기).
// ⚠️ 서버 전용이 아니어도 되지만, 클라이언트에서 import할 이유는 없다.

import { classLabel, elementLabel, corpLabel } from './dexLabels';
// 한국어는 도입 전 generateMetadata가 쓰던 표를 그대로 쓴다 — 설명문이 글자까지 같아야 한다.
import { CLASS_KR, ELEMENT_KR, CORP_KR } from './dex';

const T = {
  ko: {
    brand: '니케 조합 추천',
    homeTitle: '니케 조합 추천 | 보유 니케로 최적의 팀 짜기',
    homeDesc: '보유중인 니케 캐릭터를 선택하면 캠페인, 보스전, 아레나(PvP)에 맞는 추천 조합을 알려주고, 유저들과 직접 조합을 공유·투표할 수 있는 승리의 여신: 니케 팬 사이트입니다.',
    dexIndexTitle: (n) => `니케 캐릭터 도감 — 전체 ${n}명 티어·스킬·조합 | 니케 조합 추천`,
    dexIndexDesc: (n) => `승리의 여신: 니케 캐릭터 ${n}명의 모드별 티어, 스킬, 등장 조합을 정리한 도감. 캐릭터를 고르면 상세 정보와 추천 조합을 볼 수 있습니다.`,
    dexTitle: (c) => `${c.name_kr} (${c.title}) 티어·스킬·조합 | 니케 조합 추천`,
    dexOgTitle: (c) => `${c.name_kr} — 니케 조합 추천`,
    // 도입 전 문구와 같게 하려고 한국어 라벨은 lib/dex.js의 *_KR 표(= 용어집 한국어)와 같은 값을 쓴다.
    dexDesc: (c, L, t, n) =>
      `승리의 여신: 니케 ${c.name_kr} — ${L.corp} ${L.element} ${L.cls}, 버스트 ${c.burst}. `
      + `캠페인 ${t.story || '—'} · 보스전 ${t.bossing || '—'} · PvP ${t.pvp || '—'} 티어, `
      + `스킬 3종과 등장 조합 ${n}개 정리.`,
    name: (c) => c.name_kr,
  },
  en: {
    brand: 'NIKKE Team Guide',
    homeTitle: 'NIKKE Team Builder — Best Teams from the Nikkes You Own | NIKKE Team Guide',
    homeDesc: 'Pick the Nikkes you own and get recommended teams for Campaign, Solo Raid bosses, Champion Arena (PvP) and Tribe Tower. A fan site for NIKKE: Goddess of Victory where players share and vote on teams.',
    dexIndexTitle: (n) => `NIKKE Character List — Tiers, Skills & Teams for All ${n} Nikkes | NIKKE Team Guide`,
    dexIndexDesc: (n) => `Tier ratings by mode, skills and team compositions for all ${n} characters in NIKKE: Goddess of Victory. Pick a character to see details and recommended teams.`,
    dexTitle: (c) => `${c.title} — Tier, Skills & Teams | NIKKE Team Guide`,
    dexOgTitle: (c) => `${c.title} — NIKKE Team Guide`,
    dexDesc: (c, L, t, n) =>
      `${c.title} in NIKKE: Goddess of Victory — ${L.corp} ${L.element} ${L.cls}, Burst ${c.burst}. `
      + `Campaign ${t.story || '—'} · Bossing ${t.bossing || '—'} · PvP ${t.pvp || '—'} tier, `
      + `3 skills and ${n} team compositions.`,
    name: (c) => c.title,
  },
  ja: {
    brand: 'ニケ編成ガイド',
    homeTitle: 'ニケ編成ガイド | 所持ニケで最強編成を組む',
    homeDesc: '所持しているニケを選ぶと、キャンペーン・ソロレイド・チャンピオンアリーナ(PvP)・トライブタワーに合ったおすすめ編成を提案します。勝利の女神：NIKKEのファンサイトです。',
    dexIndexTitle: (n) => `ニケ キャラクター一覧 — 全${n}人のティア・スキル・編成 | ニケ編成ガイド`,
    dexIndexDesc: (n) => `勝利の女神：NIKKEのキャラクター${n}人のモード別ティア、スキル、登場編成をまとめた図鑑。キャラクターを選ぶと詳細とおすすめ編成が見られます。`,
    dexTitle: (c) => `${c.name_ja || c.title} ティア・スキル・編成 | ニケ編成ガイド`,
    dexOgTitle: (c) => `${c.name_ja || c.title} — ニケ編成ガイド`,
    dexDesc: (c, L, t, n) =>
      `勝利の女神：NIKKE ${c.name_ja || c.title} — ${L.corp} ${L.element} ${L.cls}、バースト${c.burst}。`
      + `キャンペーン ${t.story || '—'} · ボス戦 ${t.bossing || '—'} · PvP ${t.pvp || '—'} ティア、`
      + `スキル3種と登場編成${n}件。`,
    name: (c) => c.name_ja || c.title,
  },
};

export const seo = (lang) => T[lang] || T.ko;

// 도감 상세 설명의 라벨(제조사·속성·클래스)을 그 언어로. 용어집(data/glossary.json)의 확정 표기를 쓴다.
export function dexLabels(c, lang) {
  if (lang === 'ko') {
    return {
      corp: CORP_KR[c.manufacturer] || c.manufacturer,
      element: ELEMENT_KR[c.element] || c.element,
      cls: CLASS_KR[c.class] || c.class,
    };
  }
  return {
    corp: corpLabel(c.manufacturer, lang),
    element: elementLabel(c.element, lang),
    cls: classLabel(c.class, lang),
  };
}
