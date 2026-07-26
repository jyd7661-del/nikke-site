'use client';

// 실제 서비스 시 Google AdSense 코드가 들어갈 자리입니다.
// 1) AdSense 계정 승인 후 발급받는 <script> 태그를 app/layout.js <head>에 추가하고
// 2) 아래 <ins class="adsbygoogle" ...> 블록의 주석을 해제한 뒤 data-ad-client / data-ad-slot 값을 채워주세요.
export default function AdSlot({ label = '광고', size = 'banner' }) {
  const heightClass = size === 'banner' ? 'h-24' : size === 'square' ? 'h-64' : 'h-40';

  return (
    <div
      className={`w-full ${heightClass} border border-dashed border-slate-700/70 rounded-xl flex items-center justify-center text-slate-500 text-sm bg-slate-900/30`}
    >
      {/*
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
        data-ad-slot="XXXXXXXXXX"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      */}
      {label} 영역 (AdSense 승인 후 노출)
    </div>
  );
}
