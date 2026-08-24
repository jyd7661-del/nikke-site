'use client';

import { useLanguage } from '@/components/LanguageProvider';
import DexTierPanel from '@/components/DexTierPanel';
import { TAG_I18N_KEY } from '@/lib/dexLabels';

// 도감 상세의 "모드별 티어" 절 전체 — 제목 + 티어 패널 + prydwen 태그 + 출처.
//
// DexTierPanel(애장품 토글)은 이미 클라이언트였는데 **그 바깥의 제목·태그·출처만**
// 서버 쪽 한국어로 남아 있어서, 언어를 바꾸면 칸 안(Campaign/Boss/PvP)만 영어가 되고
// 제목은 "모드별 티어"로 남는 어정쩡한 상태였다(2026-08-24 유저 지적).
export default function DexTierSection({ tiers, treasureTiers, treasureTiersNote, tags }) {
  const { t } = useLanguage();
  const list = tags || [];

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-3">{t('dex_tier_heading')}</h2>
      <DexTierPanel
        tiers={tiers}
        treasureTiers={treasureTiers}
        treasureTiersNote={treasureTiersNote}
      />
      {list.length > 0 && (
        <ul className="mt-3 text-sm text-amber-400/90 space-y-1">
          {list.map((tag) => TAG_I18N_KEY[tag] && <li key={tag}>· {t(TAG_I18N_KEY[tag])}</li>)}
        </ul>
      )}
      <p className="text-xs text-slate-600 mt-2">{t('dex_tier_source')}</p>
    </section>
  );
}
