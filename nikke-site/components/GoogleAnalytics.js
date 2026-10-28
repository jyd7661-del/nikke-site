import Script from 'next/script';
import { CONSENT_KEY } from '@/lib/consent';

// Google Analytics 4 (2026-10-27). 유저: 「여기에 넣어서 이제 같이 보려고」 — 주인의 앱(앱 개발 정보)이 구글 계정의 GA4 속성을
// 전부 모아 보여 준다. Vercel Web Analytics·자체 계측(TrafficBeacon)은 그대로 두고 GA4를 하나 더 붙인다.
// GA4는 쿠키를 쓴다. 유럽경제지역·영국·스위스는 analytics_storage 기본값을 '거부'로 두고(동의 모드 — 쿠키 없이 익명 신호만),
// 동의 배너(components/ConsentBanner.js, 2026-10-28)에서 동의하면 켠다. 광고 쪽(ad_*)은 건드리지 않는다.
// 운영 배포에서만 싣는다 — 미리보기 배포가 운영 숫자에 섞이지 않게. 측정 ID가 정해지기 전에는 아무것도 싣지 않는다.
export const GA_MEASUREMENT_ID = 'G-5B5JZHZY1P';
const CONSENT_DENIED_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
];

export const isGaEnabled = () => process.env.VERCEL_ENV === 'production' && /^G-[A-Z0-9]{6,}$/.test(GA_MEASUREMENT_ID) && GA_MEASUREMENT_ID !== 'G-PENDING';

export default function GoogleAnalytics() {
  if (!isGaEnabled()) return null;
  // 기본값 다음에 이 브라우저에서 전에 고른 값을 바로 덮는다 — 첫 페이지뷰가 나가기 전에(순서가 바뀌면 동의한 사람의 첫 화면이 빠진다).
  return (
    <>
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',region:${JSON.stringify(CONSENT_DENIED_REGIONS)}});
try{var c=localStorage.getItem('${CONSENT_KEY}');if(c==='granted'||c==='denied')gtag('consent','update',{analytics_storage:c});}catch(e){}
gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');`}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
    </>
  );
}
