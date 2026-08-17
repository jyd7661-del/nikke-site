// 니케 캐릭터 상세 페이지 — /nikke/[id] (2026-08-13, 성장 계획 Phase 1)
//
// 목적: 검색 유입. characterDatabase.json 하나로 196페이지를 빌드 때 정적 생성한다.
// 데이터가 갱신되면 다음 빌드에서 페이지가 따라 바뀌므로 유지비가 없고,
// 정적 페이지라 방문당 API 비용도 0이다.
//
// ⚠️ 서버 컴포넌트라 클라이언트 i18n을 쓸 수 없다(개인정보처리방침과 같은 제약).
//    한국어 기준으로 렌더하되 title(영문)·name_ja(일문)를 본문에 함께 실어 색인시킨다.
// ⚠️ 여기 표시되는 티어·스킬·조합은 전부 데이터 파일의 값 그대로다(A등급).
//    이 페이지에서 새 판정·점수를 만들지 않는다.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  CHARACTERS, getCharacter, byTitle, investmentFor, teamsFor,
  CLASS_KR, ELEMENT_KR, CORP_KR, WEAPON_KR, MODE_KR, TAG_KR,
} from '@/lib/dex';
import { nikkeImageUrl } from '@/lib/nikkeImage';
import DexSkillList from '@/components/DexSkillList';
import DexTierPanel from '@/components/DexTierPanel';

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

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-200 text-right">{value}</span>
    </div>
  );
}

function TierBadge({ label, tier }) {
  return (
    <div className="flex-1 rounded-lg bg-slate-800/60 px-3 py-2 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-extrabold text-nikke-accent">{tier || '—'}</div>
    </div>
  );
}

// 멤버 이름 칩 — DB에 있으면 상세 페이지로 링크(내부 링크 = SEO), 없으면 텍스트만
function MemberChip({ title }) {
  const m = byTitle(title);
  if (!m) return <span className="text-slate-400">{title}</span>;
  return (
    <Link href={`/nikke/${m.id}`} className="text-sky-400 hover:underline">
      {m.name_kr}
    </Link>
  );
}

export default function NikkeDetailPage({ params }) {
  const c = getCharacter(params.id);
  if (!c) notFound();

  const t = c.tiers || {};
  const invNote = investmentFor(c.title);
  const teams = teamsFor(c.title);
  const shownTeams = teams.slice(0, 6);
  const tags = c.prydwenTags || [];

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      {/* 머리말 — 세 언어 이름을 전부 실어 어느 언어로 검색해도 걸리게 한다 */}
      <p className="text-sm text-slate-500 mb-1">
        <Link href="/nikke" className="hover:underline">니케 도감</Link> /
      </p>
      <h1 className="text-3xl font-extrabold text-white">{c.name_kr}</h1>
      <p className="text-slate-400 mt-1 mb-6">
        {c.title}{c.name_ja ? ` · ${c.name_ja}` : ''}
      </p>

      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        {c.img && (
          /* 이미지는 니케 국제 위키(Fandom) 참조 — lib/nikkeImage.js */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nikkeImageUrl(c.img)}
            alt={c.name_kr}
            loading="lazy"
            className="w-40 rounded-xl bg-slate-800 self-start shrink-0"
          />
        )}
        <div className="flex-1">
          <InfoRow label="등급" value={c.rarity} />
          <InfoRow label="버스트" value={`버스트 ${c.burst}`} />
          <InfoRow label="클래스" value={CLASS_KR[c.class] || c.class} />
          <InfoRow label="속성" value={ELEMENT_KR[c.element] || c.element} />
          <InfoRow label="무기" value={WEAPON_KR[c.weapon] || String(c.weapon || '').toUpperCase()} />
          <InfoRow label="제조사" value={CORP_KR[c.manufacturer] || c.manufacturer} />
          {c.squad && <InfoRow label="소속 부대" value={c.squad} />}
          {c.releaseDate && <InfoRow label="출시일" value={c.releaseDate} />}
          {c.overspec && (
            <InfoRow label="오버스펙" value="⭐ 소속 기업 타워 + 필그림/오버스펙 타워 양쪽 출전 가능" />
          )}
        </div>
      </div>

      {/* 티어 — prydwen 티어리스트 값 그대로 */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">모드별 티어</h2>
        {/* 애장품 유무를 토글로 나눠 본다 — 도감은 서버 컴포넌트라 상태를 못 쓰므로
            이 절만 클라이언트 컴포넌트로 뺐다(components/DexTierPanel.js).
            TierBadge를 props로 넘겨 이 페이지의 배지 모양을 그대로 쓴다. */}
        <DexTierPanel
          tiers={t}
          treasureTiers={invNote?.treasureTiers || null}
          treasureTiersNote={invNote?.treasureTiersNote || null}
        />
        {tags.length > 0 && (
          <ul className="mt-3 text-sm text-amber-400/90 space-y-1">
            {tags.map((tag) => TAG_KR[tag] && <li key={tag}>· {TAG_KR[tag]}</li>)}
          </ul>
        )}
        <p className="text-xs text-slate-600 mt-2">출처: prydwen.gg 티어리스트</p>
      </section>

      {/* 스킬 — 사이트 언어 설정을 따라간다.
          이 페이지는 서버 컴포넌트라 useLanguage()를 쓸 수 없어서, 스킬 블록만 클라이언트
          컴포넌트로 떼어냈다(components/DexSkillList.js). 세 언어를 props로 넘기므로
          정적 생성은 그대로 유지되고 토글에만 반응한다.
          한국어 문구는 게임 내 공식 텍스트이며 나무위키를 경로로 수집했다(위키 서술은 제외).
          아직 없는 캐릭터는 영어로 폴백한다 — `docs/open-items.md` 참고. */}
      <DexSkillList skills={c.skills || []} />

      {/* 투자·운용 노트 — characterInvestmentNotes.json에 있는 캐릭터만 */}
      {invNote && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-white mb-3">투자 · 운용</h2>
          <div className="rounded-lg bg-slate-800/40 p-4 space-y-3 text-sm text-slate-300 leading-relaxed">
            {invNote.treasureNote && (
              <p><strong className="text-slate-100">애장품:</strong> {invNote.treasureNote}</p>
            )}
            {invNote.investmentProfile && (
              <p><strong className="text-slate-100">투자 프로필:</strong> {invNote.investmentProfile}</p>
            )}
            {invNote.skillPriority && (
              <p><strong className="text-slate-100">스킬 우선순위:</strong> {invNote.skillPriority}</p>
            )}
            {invNote.overloadPriority && (
              <p><strong className="text-slate-100">오버로드 우선순위:</strong> {invNote.overloadPriority}</p>
            )}
            {invNote.totemRole && invNote.totemNote && (
              <p><strong className="text-slate-100">토템 운용:</strong> {invNote.totemNote}</p>
            )}
            {invNote.notes && <p>{invNote.notes}</p>}
          </div>
        </section>
      )}

      {/* 등장 조합 — prydwen 아키타입에서 이 캐릭터가 멤버인 것 */}
      {teams.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-white mb-1">등장 조합 {teams.length}개</h2>
          {teams.length > shownTeams.length && (
            <p className="text-xs text-slate-500 mb-3">대표 {shownTeams.length}개만 표시합니다.</p>
          )}
          <div className="space-y-3 mt-3">
            {shownTeams.map((a) => (
              <div key={a.id} className="rounded-lg bg-slate-800/40 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-bold text-slate-100">{a.name}</h3>
                  <span className="text-xs text-slate-500 shrink-0">{MODE_KR[a.mode] || a.mode}</span>
                </div>
                <p className="text-sm mt-2 space-x-2">
                  {(a.members || []).map((m, i) => (
                    <span key={m}>
                      {i > 0 && <span className="text-slate-600">· </span>}
                      <MemberChip title={m} />
                    </span>
                  ))}
                </p>
                {a.note && <p className="text-sm text-slate-400 mt-2 leading-relaxed">{a.note}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 도구로 보내는 퍼널 — 이 페이지의 최종 목적 */}
      <div className="rounded-xl bg-nikke-accent/10 border border-nikke-accent/30 p-5 text-center">
        <p className="text-slate-200 mb-3">
          보유 니케를 선택하면 {c.name_kr} 포함 최적 5인 조합을 추천해 드립니다.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-nikke-accent px-5 py-2.5 font-bold text-slate-900 hover:opacity-90"
        >
          내 로스터로 조합 추천 받기 →
        </Link>
      </div>
    </main>
  );
}
