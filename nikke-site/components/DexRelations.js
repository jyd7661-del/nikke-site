'use client';

import Link from 'next/link';
import { localePath } from '@/lib/locale';
import { useLanguage } from '@/components/LanguageProvider';
import { elementLabel, weaponLabel, squadLabel } from '@/lib/dexLabels';
import { memberName } from '@/lib/memberName';

// 도감 상세의 "대신 쓸 수 있는 니케" · "함께 쓰면 좋은 니케" · "스킬로 이어지는 니케" (2026-10-11).
// 계산은 서버(lib/dexRelations.js)가 하고 여기는 그리기만 한다 — 여기서 lib/dex·dexRelations를 import하면
// characterDatabase.json이 브라우저 번들에 실린다(DexTeams·DexUsage와 같은 이유).
// 유저 기준: "정보를 얻는 사람에게 유용한 정보" — 이 니케 대신 누구를, 누구와 같이 쓰나.

function Chip({ m, lang, extra }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <Link href={localePath(lang, `/nikke/${m.id}`)} className="text-sky-400 hover:underline">{memberName(m, lang)}</Link>
      {extra && <span className="text-slate-500 text-xs">{extra}</span>}
    </span>
  );
}

const MODE_KEY = { campaign: 'mode_campaign', bossing: 'mode_bossing', pvp: 'mode_pvp' };
const skillName = (s, lang) => (lang === 'ko' ? s.name_kr || s.name : lang === 'ja' ? s.name_ja || s.name : s.name);

export default function DexRelations({ self, alternatives, companions, skill }) {
  const { lang, t } = useLanguage();
  const name = memberName(self, lang);
  const condText = (cond, squad) => [
    cond.element && t('dex_cond_element')(elementLabel(cond.element, lang)),
    cond.weapon && t('dex_cond_weapon')(weaponLabel(cond.weapon)),
    cond.squad && t('dex_cond_squad')(squadLabel(squad, lang) || ''),
    cond.burst && t('dex_cond_burst')(cond.burst),
    cond.charge && t('dex_cond_charge'),
    cond.lowestAtk && t('dex_cond_lowest_atk'),
  ].filter(Boolean).join(' · ');

  return (
    <>
      {alternatives.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-white mb-1">{t('dex_alt_heading')}</h2>
          <p className="text-xs text-slate-500 mb-3">{t('dex_alt_desc')}</p>
          <div className="space-y-2">
            {alternatives.map((m) => (
              <div key={m.mode} className="rounded-lg bg-slate-800/40 px-4 py-3 text-sm">
                <span className="text-slate-400">{t(MODE_KEY[m.mode])}</span>{' '}
                <span className="text-slate-500 text-xs">({t('dex_alt_mine')(name, m.tier)})</span>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {m.higher.length
                    ? m.higher.map((x) => <Chip key={x.id} m={x} lang={lang} extra={x.tier} />)
                    : <span className="text-slate-400">{t('dex_alt_none')}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {companions.list.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-white mb-1">{t('dex_comp_heading')}</h2>
          <p className="text-xs text-slate-500 mb-3">{t('dex_comp_desc')(name, companions.rankerTeams, companions.archetypeTeams)}</p>
          <ul className="space-y-1.5 text-sm">
            {companions.list.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline gap-x-2">
                <Chip m={x} lang={lang} />
                <span className="text-slate-500 text-xs">
                  {[x.ranker > 0 && t('dex_comp_ranker')(x.ranker, companions.rankerTeams), x.archetype > 0 && t('dex_comp_arch')(x.archetype)].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(skill.gives.length > 0 || skill.receives.length > 0) && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-white mb-1">{t('dex_skill_heading')}</h2>
          <p className="text-xs text-slate-500 mb-3">{t('dex_skill_desc')}</p>
          {skill.gives.map((g, i) => (
            <div key={`g${i}`} className="rounded-lg bg-slate-800/40 px-4 py-3 text-sm mb-2">
              <p className="text-slate-300">{t('dex_skill_gives')(skillName(g.skill, lang), condText(g.cond, g.squad), g.total)}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {g.top.map((x) => <Chip key={x.id} m={x} lang={lang} />)}
              </div>
            </div>
          ))}
          {skill.receives.length > 0 && (
            <div className="rounded-lg bg-slate-800/40 px-4 py-3 text-sm">
              <p className="text-slate-300">{t('dex_skill_receives')(name, skill.receivesTotal)}</p>
              <ul className="mt-1 space-y-1">
                {skill.receives.map((x) => (
                  <li key={x.id}><Chip m={x} lang={lang} extra={`${skillName(x.skill, lang)} · ${condText(x.cond, x.squad)}`} /></li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}
