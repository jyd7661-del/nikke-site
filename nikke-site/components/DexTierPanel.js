'use client';

import { useState } from 'react';
import { useLanguage } from '@/components/LanguageProvider';

// 도감 상세의 "모드별 티어" 절. 애장품 유무를 **토글로 나눠** 본다.
//
// ■ 왜 토글인가 (2026-08-15 유저 지적)
//
//   처음엔 기본 티어 아래에 애장품 티어를 함께 쌓아 보여줬는데, 유저 지적 —
//   "애장품이냐 아니냐 상태에 따라서 따로볼 수 있어야할 것 같은데?"
//   맞다. 둘을 한꺼번에 쌓으면 어느 쪽이 이 캐릭터의 기준인지 흐릿해진다. 메인 화면의
//   💎 버튼과도 방식이 어긋난다.
//
//   그 전에는 애장품 티어가 **아예 없었다.** 그래서 페이지가 스스로 모순됐다 — 헬름이
//   여기서는 '보스전 B'인데 바로 아래 애장품 설명에는 "애장품 이후 평가가 완전히
//   뒤바뀜"이라고 적혀 있었다. 차이가 큰 편이다:
//     헬름     B/B/C   → S/SS/SSS
//     프리바티  B/B/B   → SS/SS/SS
//     목단     D/D/SS  → SS/SS/SSS
//   추천 엔진은 이미 이 값을 쓰고 있었다(lib/synergyEngine.js의 effectiveTier). 화면만 몰랐다.
//
// ■ 기본값은 '기본 티어'다
//
//   characterDatabase.json이 이 페이지의 명시된 출처이고, 애장품은 **가지고 있어야** 성립하는
//   조건이다. 없는 것을 기본으로 보여주면 과대 표기가 된다. 애장품이 있는 사용자는 토글로 본다.
//
// ⚠️ 새 판정을 만들지 않는다 — characterInvestmentNotes.json의 treasureTiers를 그대로 옮긴다.
//    (도감 규칙: 표시되는 값은 전부 데이터 파일 그대로여야 한다)

// ⚠️ 배지를 여기서 정의한다. 서버 컴포넌트(app/nikke/[id]/page.js)에서 클라이언트 컴포넌트로
//    **함수를 props로 넘길 수 없다** — next build가 "Functions cannot be passed directly to
//    Client Components"로 실패한다(2026-08-15에 그렇게 만들었다가 잡혔다).
//    모양은 그 페이지의 TierBadge와 같게 유지한다.
function TierBadge({ label, tier }) {
  return (
    <div className="flex-1 rounded-lg bg-slate-800/60 px-3 py-2 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-extrabold text-nikke-accent">{tier || '—'}</div>
    </div>
  );
}

export default function DexTierPanel({ tiers, treasureTiers, treasureTiersNote }) {
  const { t } = useLanguage();
  const [showTreasure, setShowTreasure] = useState(false);

  const shown = showTreasure && treasureTiers ? treasureTiers : tiers || {};
  const hasTreasure = Boolean(treasureTiers);

  return (
    <>
      {hasTreasure && (
        <div className="flex gap-1 mb-3">
          <button
            type="button"
            onClick={() => setShowTreasure(false)}
            className={`text-xs px-3 py-1 rounded-full border transition ${
              !showTreasure
                ? 'bg-nikke-accent text-slate-900 border-nikke-accent font-semibold'
                : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {t('dex_tier_base')}
          </button>
          <button
            type="button"
            onClick={() => setShowTreasure(true)}
            className={`text-xs px-3 py-1 rounded-full border transition ${
              showTreasure
                ? 'bg-amber-400 text-amber-950 border-amber-400 font-semibold'
                : 'border-slate-700 text-slate-400 hover:border-amber-400/60'
            }`}
          >
            💎 {t('dex_tier_treasure')}
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <TierBadge label={t('mode_campaign')} tier={shown.story} />
        <TierBadge label={t('mode_bossing')} tier={shown.bossing} />
        <TierBadge label={t('mode_pvp')} tier={shown.pvp} />
      </div>

      {hasTreasure && showTreasure && treasureTiersNote && (
        <p className="text-xs text-slate-500 mt-2">{treasureTiersNote}</p>
      )}
    </>
  );
}
