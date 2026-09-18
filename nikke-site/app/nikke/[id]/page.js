// 니케 캐릭터 상세 페이지 — /nikke/[id] (2026-08-13, 성장 계획 Phase 1)
//
// 목적: 검색 유입. characterDatabase.json 하나로 상세 페이지를 빌드 때 정적 생성한다.
// 데이터가 갱신되면 다음 빌드에서 페이지가 따라 바뀌므로 유지비가 없고,
// 정적 페이지라 방문당 API 비용도 0이다.
//
// ⚠️ 이 파일은 서버 컴포넌트라 클라이언트 i18n(useLanguage)을 쓸 수 없다.
//    generateMetadata(검색엔진에 나가는 제목·설명)는 **한국어 고정이 맞다** —
//    언어별 URL을 나누지 않기로 한 결정(components/LanguageProvider.js)의 연장이다.
//
//    화면에 보이는 부분은 전부 클라이언트 컴포넌트로 뺐다(2026-08-24):
//      DexHeader / DexInfoTable / DexTierSection / DexSkillList / DexInvestment /
//      DexTeams / DexCta
//    그전에는 스킬(DexSkillList)과 티어 칸 안(DexTierPanel)만 번역되고 나머지는 한국어로
//    남아 "절반만 번역된" 화면이었다. 클라이언트 컴포넌트도 초기 HTML은 서버가 렌더하므로
//    정적 생성과 색인은 그대로다.
//
// ⚠️ 여기 표시되는 티어·스킬·조합은 전부 데이터 파일의 값 그대로다(A등급).
//    이 페이지에서 새 판정·점수를 만들지 않는다.
import { notFound } from 'next/navigation';
import {
  CHARACTERS, getCharacter, byTitle, investmentFor, teamsFor,
  CLASS_KR, ELEMENT_KR, CORP_KR,
} from '@/lib/dex';
import { usageFor, USAGE_TOTALS, USAGE_SOURCE } from '@/lib/usage';
import { nikkeImageUrl } from '@/lib/nikkeImage';
import DexHeader from '@/components/DexHeader';
import DexInfoTable from '@/components/DexInfoTable';
import DexTierSection from '@/components/DexTierSection';
import DexSkillList from '@/components/DexSkillList';
import DexInvestment from '@/components/DexInvestment';
import DexTeams from '@/components/DexTeams';
import DexUsage from '@/components/DexUsage';
import DexCta from '@/components/DexCta';

export function generateStaticParams() {
  return CHARACTERS.map((c) => ({ id: c.id }));
}

export function generateMetadata({ params }) {
  const c = getCharacter(params.id);
  if (!c) return {};
  const t = c.tiers || {};
  const teams = teamsFor(c.title);
  return {
    title: `${c.name_kr} (${c.title}) 티어·스킬·조합 | 니케 조합 추천`,
    description:
      `승리의 여신: 니케 ${c.name_kr} — ${CORP_KR[c.manufacturer] || c.manufacturer} ` +
      `${ELEMENT_KR[c.element] || c.element} ${CLASS_KR[c.class] || c.class}, 버스트 ${c.burst}. ` +
      `캠페인 ${t.story || '—'} · 보스전 ${t.bossing || '—'} · PvP ${t.pvp || '—'} 티어, ` +
      `스킬 3종과 등장 조합 ${teams.length}개 정리.`,
    // 정본 주소 — 캐릭터마다 자기 주소를 가리킨다.
    alternates: { canonical: `/nikke/${c.id}` },
    openGraph: {
      title: `${c.name_kr} — 니케 조합 추천`,
      images: c.img ? [nikkeImageUrl(c.img)] : [],
    },
  };
}

export default function NikkeDetailPage({ params }) {
  const c = getCharacter(params.id);
  if (!c) notFound();

  const invNote = investmentFor(c.title);
  const teams = teamsFor(c.title);
  const shownTeams = teams.slice(0, 6);

  // 조합 멤버를 **서버에서** 캐릭터 객체로 풀어 둔다. 클라이언트에서 byTitle을 부르면
  // lib/dex.js가 딸려 들어가 characterDatabase.json 666KB가 브라우저 번들에 실린다
  // (실측: /nikke First Load JS 94kB -> 347kB). 순수 데이터만 넘긴다.
  const teamsForClient = shownTeams.map((a) => ({
    id: a.id,
    name: a.name,
    name_en: a.name_en || null,
    name_ja: a.name_ja || null,
    mode: a.mode,
    note: a.note || null,
    note_en: a.note_en || null,
    note_ja: a.note_ja || null,
    members: (a.members || []).map((title) => {
      const m = byTitle(title);
      return m
        ? { id: m.id, title: m.title, name_kr: m.name_kr, name_ja: m.name_ja || null }
        : { title };
    }),
  }));

  // 실사용 데이터(enikk 집계). 없으면 null이고 DexUsage가 절을 통째로 안 그린다.
  //
  // ⚠️ 여기서도 멤버를 **서버에서** 캐릭터 객체로 풀어 넘긴다. 클라이언트에서 풀면
  //    characterDatabase.json 666KB가 브라우저 번들에 실린다(DexTeams와 같은 이유).
  // ⚠️ 조회 키는 title이다. id로 부르면 198명 전원이 null이 되고 **에러 없이 절만 사라진다** —
  //    scripts/testDexUsage.mjs가 그 경우를 못으로 박아뒀다.
  const u = usageFor(c.title);
  const asMember = (title) => {
    const m = byTitle(title);
    return m ? { id: m.id, title: m.title, name_kr: m.name_kr, name_ja: m.name_ja || null } : { title };
  };
  // 모드별로 표본이 가장 큰 조합 하나씩만 싣는다(크라운은 61건에 등장한다 — 전부 실으면
  // 페이지가 조합 목록으로 뒤덮인다). lib/usage.js가 이미 표본 내림차순으로 준다.
  const usageForClient = u && {
    totals: USAGE_TOTALS,
    counts: u.counts,
    tiers: u.tiers,
    source: USAGE_SOURCE,
    partners: u.partners.slice(0, 5).map((p) => ({ member: asMember(p.title), count: p.count })),
    teams: ['raid', 'tower', 'campaign', 'pvp']
      .map((kind) => u[kind][0])
      .filter(Boolean)
      .map((e) => ({ ...e, members: e.members.map(asMember) })),
    subsets: u.pvpSubsets.slice(0, 3).map((e) => ({ ...e, members: e.members.map(asMember) })),
  };

  // 헤더·정보표·CTA에는 **필요한 필드만** 넘긴다. 캐릭터 객체를 그대로 넘기면 skills가
  // 컴포넌트마다 RSC 페이로드에 중복 직렬화된다(스킬 본문은 DexSkillList로 한 번만 간다).
  const info = {
    id: c.id, title: c.title, name_kr: c.name_kr, name_ja: c.name_ja || null,
    rarity: c.rarity, burst: c.burst, class: c.class, element: c.element,
    weapon: c.weapon, manufacturer: c.manufacturer, squad: c.squad || null,
    releaseDate: c.releaseDate || null, overspec: c.overspec || false,
  };

  // ⚠️ 클라이언트 컴포넌트에는 **함수를 props로 넘길 수 없다** — next build가
  //    "Functions cannot be passed directly to Client Components"로 실패한다
  //    (2026-08-15에 실제로 그렇게 만들었다가 잡혔다). 순수 데이터만 넘긴다.
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <DexHeader character={info} />

      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        {c.img && (
          /* 이미지는 니케 국제 위키(Fandom) 참조 — lib/nikkeImage.js.
             신규 캐릭터는 위키에 초상화가 올라오기 전이라 비어 있을 수 있다. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nikkeImageUrl(c.img)}
            alt={c.name_kr}
            loading="lazy"
            className="w-40 rounded-xl bg-slate-800 self-start shrink-0"
          />
        )}
        <DexInfoTable character={info} />
      </div>

      {/* 티어 — prydwen 티어리스트 값 그대로. 애장품 유무는 DexTierPanel이 토글로 나눈다 */}
      <DexTierSection
        tiers={c.tiers || {}}
        treasureTiers={invNote?.treasureTiers || null}
        treasureTiersNote={invNote?.treasureTiersNote || null}
        tags={c.prydwenTags || []}
      />

      {/* 스킬 — 세 언어를 props로 받아 사이트 언어 설정을 따라간다.
          한국어 문구는 게임 내 공식 텍스트이며 나무위키를 경로로 수집했다(위키 서술은 제외).
          아직 없는 캐릭터는 영어로 폴백한다 — docs/open-items.md 참고. */}
      <DexSkillList skills={c.skills || []} />

      {/* 투자·운용 — characterInvestmentNotes.json에 있는 캐릭터만.
          본문은 아직 한국어뿐이라 다른 언어에서는 안내 문구가 함께 뜬다. */}
      <DexInvestment note={invNote} />

      {/* 등장 조합 — prydwen 아키타입에서 이 캐릭터가 멤버인 것 */}
      <DexTeams teams={teamsForClient} totalCount={teams.length} />

      {/* 실사용 데이터 — enikk에서 옮긴 조합 214건을 우리가 집계한 것.
          위 '등장 조합'(prydwen의 추천 구성)과 성격이 다르다: 이쪽은 실제로 쓰인 기록이다. */}
      <DexUsage usage={usageForClient} />

      {/* 도구로 보내는 퍼널 — 이 페이지의 최종 목적 */}
      <DexCta character={info} />
    </main>
  );
}
