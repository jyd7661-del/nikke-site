'use client';

import { localePath } from '@/lib/locale';

import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { MODE_I18N_KEY } from '@/lib/dexLabels';
import { memberName } from '@/lib/memberName';

// 도감 상세의 "등장 조합" 절.
//
// ■ 본문 다국어 (2026-08-24 B단계)
//   data/synergyNotes.json의 archetypes가 name_en/name_ja/note_en/note_ja를 함께 갖는다.
//   ⚠️ 아직 번역이 없는 항목은 **한국어로 폴백**하고, 폴백이 하나라도 있으면 안내를 띄운다.
//   (원문이 이미 영어인 prydwen Team Database 조합도 있어서 en이 원문과 같을 수 있다)
//
// ⚠️ 멤버는 **서버에서 미리 풀어서** 받는다({ id, title, name_kr, name_ja } 또는 { title }).
//    여기서 lib/dex.js의 byTitle을 부르면 characterDatabase.json(약 700KB)가 브라우저 번들에
//    실린다 — 실제로 그렇게 만들었다가 /nikke의 First Load JS가 94kB -> 347kB로 뛰었다.
//    자세한 경위는 lib/dexLabels.js 주석.
function MemberChip({ member, lang }) {
  if (!member?.id) return <span className="text-slate-400">{member?.title}</span>;
  return (
    <Link href={localePath(lang, `/nikke/${member.id}`)} className="text-sky-400 hover:underline">
      {memberName(member, lang)}
    </Link>
  );
}

export default function DexTeams({ teams, totalCount }) {
  const { lang, t } = useLanguage();
  const shown = teams || [];
  if (shown.length === 0) return null;
  const total = totalCount ?? shown.length;

  // 언어별 값을 고른다. 없으면 한국어 원문.
  const pick = (a, field) => {
    const ko = a[field];
    if (!ko) return null;
    if (lang === 'ko') return { text: ko, fellBack: false };
    const v = a[`${field}_${lang}`];
    return v ? { text: v, fellBack: false } : { text: ko, fellBack: true };
  };
  const anyFallback = shown.some((a) => ['name', 'note'].some((f) => pick(a, f)?.fellBack));

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-1">{t('dex_teams_heading')(total)}</h2>
      {anyFallback && <p className="text-xs text-slate-500 mb-2">{t('dex_body_ko_note')}</p>}
      <div className="space-y-3 mt-3">
        {shown.map((a) => (
          <div key={a.id} className="rounded-lg bg-slate-800/40 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-bold text-slate-100">{pick(a, 'name')?.text}</h3>
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
            {/* 2026-11-04: 설명은 접어 둔다 — 크라운 쪽 6개 조합 설명이 2,700자였다(유저: "글이 좀 많은데 의미가 큰 글은 많이 없는 것 같아").
                조합 이름·멤버만으로 훑고, 대체 멤버 같은 설명이 필요한 사람만 연다 */}
            {pick(a, 'note') && (
              <details className="mt-2 group">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 select-none">{t('dex_teams_note_toggle')}</summary>
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{pick(a, 'note').text}</p>
              </details>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
