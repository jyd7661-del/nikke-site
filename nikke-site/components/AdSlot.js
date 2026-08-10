'use client';

import { useEffect, useRef } from 'react';
import { useLanguage } from '@/components/LanguageProvider';

// Google AdSense 연동 슬롯.
// - Vercel 환경변수에 NEXT_PUBLIC_ADSENSE_CLIENT_ID(예: ca-pub-1234567890123456)와
//   이 size에 대응하는 슬롯 ID(NEXT_PUBLIC_ADSENSE_SLOT_BANNER/RECTANGLE/SQUARE)가 모두
//   설정되면 실제 <ins class="adsbygoogle"> 광고 유닛을 렌더링한다.
// - 계정 승인 전이거나 슬롯 미발급 상태라 둘 중 하나라도 비어있으면 기존처럼 자리만
//   차지하는 플레이스홀더를 보여준다. 즉 이 커밋만으로는 화면에 변화가 없고,
//   나중에 Vercel 환경변수만 추가하면 코드 수정 없이 바로 광고가 켜진다.
// - app/layout.js에 adsbygoogle.js 로더 <Script>가 이미 붙어 있어야 실제로 렌더링된다.
const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

// Next.js가 process.env.XXX를 빌드 타임에 정적으로 치환하기 때문에 동적 키(process.env[key])
// 접근은 안 되므로, size별 슬롯 값을 여기서 각각 직접 참조해 맵으로 만들어둔다.
const SLOTS = {
  banner: process.env.NEXT_PUBLIC_ADSENSE_SLOT_BANNER,
  rectangle: process.env.NEXT_PUBLIC_ADSENSE_SLOT_RECTANGLE,
  square: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SQUARE,
};

export default function AdSlot({ label, size = 'banner' }) {
  const { t } = useLanguage();
  const shownLabel = label || t('ad');
  const heightClass = size === 'banner' ? 'h-24' : size === 'square' ? 'h-64' : 'h-40';
  const slot = SLOTS[size];
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID || !slot || pushedRef.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch (e) {
      console.error('AdSense push error', e);
    }
  }, [slot]);

  if (CLIENT_ID && slot) {
    return (
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    );
  }

  return (
    <div
      className={`w-full ${heightClass} border border-dashed border-slate-700/70 rounded-xl flex items-center justify-center text-slate-500 text-sm bg-slate-900/30`}
    >
      {t('ad_placeholder')(shownLabel)}
    </div>
  );
}
