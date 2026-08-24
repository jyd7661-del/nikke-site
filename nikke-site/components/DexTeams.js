'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { MODE_I18N_KEY } from '@/lib/dexLabels';
import { memberName } from '@/lib/memberName';

// 도감 상세의 "등장 조합" 절.
//
// ■ 지금 상태 — 제목·모드 배지·멤버 이름은 번역되고, 조합 이름과 설명은 한국어다
//   data/synergyNotes.json의 archetypes(483개)가 한국어 name/note 하나만 갖고 있다.
//   약 192,000자라 코드로는 못 고치고 번역 데이터가 필요하다. 한국어가 아닐 때는
//   안내 한 줄을 띄워 "고장"이 아님을 알린다.
//
// ⚠️ 멤버는 **서버에서 미리 풀어서** 받는다({ id, title, name_kr, name_ja } 또는 { title }).
//    여기서 lib/dex.js의 byTitle을 부르면 characterDatabase.json 666KB가 브라우저 번들에
//    실린다 — 실제로 그렇게 만들었다가 /nikke의 First Load JS가 94kB -> 347kB로 뛰었다.
//    자세한 경위는 lib/dexLabels.js 주석.
function MemberChip({ member, lang }) {
  if (!member?.id) return <span className="text-slate-400">{member?.title}</span>;
  return (
    <Link href={`/nikke/${member.id}`} className="text-sky-400 hover:underline">
      {memberName(member, lang)}
    </Link>
  );
}

export default function DexTeams({ teams, totalCount }) {
  const { lang, t } = useLanguage();
  const shown = teams || [];
  if (shown.length === 0) return null;
  const total = totalCount ?? shown.length;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-1">{t('dex_teams_heading')(total)}</h2>
      {total > shown.length && (
        <p className="text-xs text-slate-500 mb-3">{t('dex_teams_shown')(shown.length)}</p>
      )}
      {lang !== 'ko' && (
        <p className="text-xs text-slate-500 mb-2">{t('dex_body_ko_note')}</p>
      )}
      <div className="space-y-3 mt-3">
        {shown.map((a) => (
          <div key={a.id} className="rounded-lg bg-slate-800/40 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-bold text-slate-100">{a.name}</h3>
              <span className="text-xs text-slate-500 shrink-0">
                {MODE_I18N_KEY[a.mode] ? t(MODE_I18N_KEY[a.mode]) : a.mode}
              </span>
            </div>
            <p className="text-sm mt-2 space-x-2">
              {(a.members || []).map((m, i) => (
                <span key={m.id || m.title || i}>
                  {i > 0 && <span className="text-slate-600">· </span>}
                  <MemberChip member={m} lang={lang} />
                </span>
              ))}
            </p>
            {a.note && <p className="text-sm text-slate-400 mt-2 leading-relaxed">{a.note}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
