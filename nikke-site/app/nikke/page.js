// 니케 도감 인덱스 — /nikke (2026-08-13, 성장 계획 Phase 1)
//
// 캐릭터 상세 페이지의 목차. 서버 정적 렌더(SEO)이며 데이터 파일이 곧 목록이다.
//
// ⚠️ 이 파일은 서버 컴포넌트라 클라이언트 i18n을 쓸 수 없다. metadata(검색엔진에 나가는
//    제목·설명)는 한국어 고정이 맞다 — 언어별 URL을 나누지 않기로 한 결정의 연장이다.
//    **화면에 보이는 목록은 components/DexGrid.js(클라이언트)로 뺐다**(2026-08-24).
//    그전에는 이름·속성·클래스·제조사가 전부 한국어로 박혀 있어 언어를 바꿔도 안 바뀌었다.
//    클라이언트 컴포넌트도 초기 HTML은 서버가 렌더하므로 정적 생성과 색인은 그대로다.
import { CHARACTERS } from '@/lib/dex';
import DexGrid from '@/components/DexGrid';

export const metadata = {
  title: `니케 캐릭터 도감 — 전체 ${CHARACTERS.length}명 티어·스킬·조합 | 니케 조합 추천`,
  description:
    `승리의 여신: 니케 캐릭터 ${CHARACTERS.length}명의 모드별 티어, 스킬, 등장 조합을 정리한 도감. ` +
    '캐릭터를 고르면 상세 정보와 추천 조합을 볼 수 있습니다.',
  // 정본 주소. ?utm_source= 같은 쿼리가 붙은 주소가 별개 URL로 색인되는 것을 막는다.
  // metadataBase(app/layout.js)가 있어 상대 경로가 절대 주소로 풀린다.
  alternates: { canonical: '/nikke' },
};

// 출시일 내림차순(최신 먼저) — 신규 캐릭터를 찾는 방문이 대부분이다.
// 정렬은 서버에서 한다: 클라이언트로 넘기는 값이 이미 정해져 있어야 초기 HTML과 어긋나지 않는다.
// ⚠️ 클라이언트 컴포넌트에 넘기는 값은 **RSC 페이로드로 직렬화된다.**
//    캐릭터 객체를 통째로 넘기면 skills(3개 × 3개국어 설명)까지 전부 실려 문서가 수백 KB
//    커진다. 카드가 실제로 쓰는 필드만 추린다.
const CARD_FIELDS = ['id', 'name_kr', 'title', 'name_ja', 'burst', 'element', 'class', 'manufacturer', 'img'];
const SORTED = [...CHARACTERS]
  .sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')))
  .map((c) => Object.fromEntries(CARD_FIELDS.map((k) => [k, c[k] ?? null])));

export default function NikkeIndexPage() {
  return (
    // 목록은 카드가 많아 다른 페이지(max-w-5xl)보다 넓게 잡는다.
    // 5xl(1024px)에 8열을 넣으면 카드가 100px대로 뭉개진다.
    <main className="max-w-7xl mx-auto px-4 py-10">
      <DexGrid characters={SORTED} />
    </main>
  );
}
