'use client';

import { useLanguage } from '@/components/LanguageProvider';

// 도감 상세의 "투자 · 운용" 절.
//
// ■ 지금 상태 — 라벨만 번역된다
//   제목과 항목 라벨은 사이트 언어를 따라가지만 **본문은 한국어 그대로**다.
//   data/characterInvestmentNotes.json이 한국어 문장 하나만 갖고 있기 때문이다
//   (78명 × 5필드 = 387문장, 약 32,000자). 이건 코드로 못 고치고 번역 데이터가 필요하다.
//
//   그래서 한국어가 아닐 때는 안내 한 줄을 띄운다. 없으면 "번역이 고장났다"로 보인다 —
//   실제로 2026-08-24에 유저가 그렇게 읽었다.
export default function DexInvestment({ note }) {
  const { lang, t } = useLanguage();
  if (!note) return null;

  const rows = [
    ['dex_inv_treasure', note.treasureNote],
    ['dex_inv_profile', note.investmentProfile],
    ['dex_inv_skill', note.skillPriority],
    ['dex_inv_overload', note.overloadPriority],
    ['dex_inv_totem', note.totemRole ? note.totemNote : null],
  ].filter(([, v]) => v);

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-3">{t('dex_investment_heading')}</h2>
      {lang !== 'ko' && (
        <p className="text-xs text-slate-500 mb-2">{t('dex_body_ko_note')}</p>
      )}
      <div className="rounded-lg bg-slate-800/40 p-4 space-y-3 text-sm text-slate-300 leading-relaxed">
        {rows.map(([key, value]) => (
          <p key={key}>
            <strong className="text-slate-100">{t(key)}:</strong> {value}
          </p>
        ))}
        {note.notes && <p>{note.notes}</p>}
      </div>
    </section>
  );
}
