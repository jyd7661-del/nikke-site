// 분석 쿠키 동의(2026-10-28, 유저 "해" — CMP 판단 대기를 닫음). GA4(components/GoogleAnalytics.js)에만 쓴다.
//
// 누구에게 묻나: 유럽경제지역·영국·스위스. 판별은 브라우저 시간대(Europe/…)로 한다 — 서버 호출이 없어 방문당 비용 0.
//   빗나가도 안전한 쪽으로만 틀린다: 구글 쪽 기본값(GoogleAnalytics.js `region`)은 IP 기준으로 그 지역을 이미 '거부'로 둔다.
//   · 유럽 IP인데 시간대가 유럽이 아님(VPN·여행) → 배너가 안 뜨고 쿠키도 안 켜진다(기본 거부 그대로).
//   · 유럽 밖 IP인데 시간대가 유럽(러시아·튀르키예 등) → 배너가 뜬다. 거부하면 'denied'로 덮어쓴다.
// 고른 값은 이 브라우저에만 남는다(localStorage). 개인정보처리방침의 "쿠키 설정" 버튼으로 다시 고를 수 있다.
// ⚠️ 광고(애드센스)용 동의는 이걸로 안 된다 — 유럽 광고에는 구글 인증 CMP가 필요하다(애드센스 "개인정보 보호 및 메시지").

export const CONSENT_KEY = 'nikke-analytics-consent';
export const CONSENT_OPEN_EVENT = 'nikke-consent-open';

export function inConsentRegion() {
  try {
    // 유럽 밖 이름을 쓰는 EEA 시간대: 아이슬란드·카나리아(스페인)·마데이라·아조레스(포르투갈)·키프로스.
    return /^(Europe\/|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$|Asia\/(Nicosia|Famagusta)$)/.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  } catch {
    return false;
  }
}

export function readConsent() {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(v) {
  try {
    localStorage.setItem(CONSENT_KEY, v);
  } catch {
    // 저장이 막힌 브라우저(사생활 보호 창 등)는 이번 화면에만 적용된다.
  }
  window.dataLayer = window.dataLayer || [];
  // gtag()와 같은 모양으로 넣는다 — gtag.js는 dataLayer의 arguments 객체만 명령으로 읽는다.
  (function gtag() { window.dataLayer.push(arguments); })('consent', 'update', { analytics_storage: v });
}

export function openConsentSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
