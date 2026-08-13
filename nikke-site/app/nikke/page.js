// 니케 도감 인덱스 — /nikke (2026-08-13, 성장 계획 Phase 1)
//
// 196명 상세 페이지의 목차. 서버 정적 렌더(SEO)이며 데이터 파일이 곧 목록이다.
// ⚠️ 서버 컴포넌트라 클라이언트 i18n 불가 — 한국어 기준(상세 페이지와 동일한 제약).
import Link from 'next/link';
import { CHARACTERS, CLASS_KR, ELEMENT_KR, CORP_KR } from '@/lib/dex';
import { nikkeImageUrl } from '@/lib/nikkeImage';

export const metadata = {
  title: `니케 캐릭터 도감 — 전체 ${CHARACTERS.length}명 티어·스킬·조합 | 니케 조합 추천`,
  description:
    `승리의 여신: 니케 캐릭터 ${CHARACTERS.length}명의 모드별 티어, 스킬, 등장 조합을 정리한 도감. ` +
    '캐릭터를 고르면 상세 정보와 추천 조합을 볼 수 있습니다.',
};

// 출시일 내림차순(최신 먼저) — 신규 캐릭터를 찾는 방문이 대부분이다
const SORTED = [...CHARACTERS].sort((a, b) =>
  String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')));

export default function NikkeIndexPage() {
  return (
    // 목록은 카드가 많아 다른 페이지(max-w-5xl)보다 넓게 잡는다.
    // 5xl(1024px)에 8열을 넣으면 카드가 100px대로 뭉개진다.
    <main className="max-w-7xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold text-white mb-2">니케 캐릭터 도감</h1>
      <p className="text-slate-400 mb-8">
        전체 {CHARACTERS.length}명 — 모드별 티어 · 스킬 · 등장 조합. 최신 출시 순.
      </p>
      {/* 한 화면에 들어오는 인원을 늘리려고 4열 → 8열로 넓혔다(2026-08-13).
          카드가 커서 스크롤만 길고 정보량이 적다는 지적. 이미지·글자도 함께 줄였다.
          모바일에서 8열은 카드가 40px대라 못 쓴다 — 화면 폭에 따라 3→4→6→8로 올린다. */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {SORTED.map((c) => (
          <Link
            key={c.id}
            href={`/nikke/${c.id}`}
            className="rounded-lg bg-slate-800/40 hover:bg-slate-800 p-1.5 transition-colors"
          >
            {c.img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={nikkeImageUrl(c.img)}
                alt={c.name_kr}
                loading="lazy"
                className="w-full aspect-[3/4] object-cover rounded bg-slate-800 mb-1.5"
              />
            )}
            <div className="font-bold text-slate-100 text-xs leading-tight break-keep">{c.name_kr}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
              B{c.burst} · {ELEMENT_KR[c.element] || c.element} · {CLASS_KR[c.class] || c.class}
            </div>
            <div className="text-[11px] text-slate-600 leading-tight">{CORP_KR[c.manufacturer] || c.manufacturer}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
