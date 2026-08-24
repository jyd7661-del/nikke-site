'use client';

import { useLanguage } from '@/components/LanguageProvider';

// 도감 상세의 "투자 · 운용" 절.
//
// ■ 본문 다국어 (2026-08-24 B단계)
//   data/characterInvestmentNotes.json이 필드마다 <필드>_en / <필드>_ja 를 함께 갖는다.
//   번역은 AI API를 부르지 않고 세션에서 직접 만들어 데이터에 넣었다 — 정적 페이지라
//   방문당 비용이 0이고, 조합 설명 AI(건당 4.9원)와는 성격이 다르다.
//
//   ⚠️ 아직 번역이 없는 항목은 **한국어로 폴백**한다. 빈칸을 보여주는 것보다 낫고,
//      번역 전 상태와 같다. 한 캐릭터라도 폴백이 생기면 안내 문구를 띄운다.
export default function DexInvestment({ note }) {
  const { lang, t } = useLanguage();
  if (!note) return null;

  // 언어별 값을 고른다. 없으면 한국어 원문.
  const pick = (field) => {
    const ko = note[field];
    if (!ko) return null;
    if (lang === 'ko') return { text: ko, fellBack: false };
    const v = note[`${field}_${lang}`];
    return v ? { text: v, fellBack: false } : { text: ko, fellBack: true };
  };

  const rows = [
    ['dex_inv_treasure', 'treasureNote'],
    ['dex_inv_profile', 'investmentProfile'],
    ['dex_inv_skill', 'skillPriority'],
    ['dex_inv_overload', 'overloadPriority'],
    ['dex_inv_totem', note.totemRole ? 'totemNote' : null],
  ]
    .filter(([, f]) => f)
    .map(([key, f]) => [key, pick(f)])
    .filter(([, v]) => v);

  const plain = pick('notes');
  const anyFallback = rows.some(([, v]) => v.fellBack) || plain?.fellBack;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-3">{t('dex_investment_heading')}</h2>
      {anyFallback && <p className="text-xs text-slate-500 mb-2">{t('dex_body_ko_note')}</p>}
      <div className="rounded-lg bg-slate-800/40 p-4 space-y-3 text-sm text-slate-300 leading-relaxed">
        {rows.map(([key, v]) => (
          <p key={key}>
            <strong className="text-slate-100">{t(key)}:</strong> {v.text}
          </p>
        ))}
        {plain && <p>{plain.text}</p>}
      </div>
    </section>
  );
}
