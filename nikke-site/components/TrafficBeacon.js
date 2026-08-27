'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// 자체 방문 계측 비콘. (2026-08-26)
//
// `navigator.sendBeacon`을 쓰는 이유: 렌더를 막지 않고, 페이지를 떠나는 중에도 전송이
// 보장된다. fetch로 하면 이동 중 취소되어 마지막 페이지가 조용히 빠진다.
//
// ⚠️ 정적 페이지의 "방문당 비용 0" 성질을 여기서 포기한다(CLAUDE.md). 방문마다
//    요청 1회 + DB upsert 1회가 붙는다. 그 대가로 얻는 것은 **쿼리 가능한 숫자**이고,
//    그게 있어야 주간 리포트 자동화가 사람 손 없이 돈다.
export default function TrafficBeacon() {
  const pathname = usePathname();
  const lastSent = useRef(null);

  useEffect(() => {
    if (!pathname) return;
    // ⚠️ 개발 모드의 StrictMode는 effect를 두 번 실행한다. 같은 경로를 연달아 보내지 않는다.
    //    (운영에서도 리렌더로 중복 발사되는 것을 막는다)
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    const body = JSON.stringify({ path: pathname });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      } else {
        // sendBeacon이 없는 낡은 브라우저 폴백. 실패해도 조용히 넘어간다.
        fetch('/api/track', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
      }
    } catch {
      // 계측 실패가 화면에 영향을 주면 안 된다.
    }
  }, [pathname]);

  return null;
}
