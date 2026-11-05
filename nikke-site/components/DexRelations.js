'use client';

import { useState } from 'react';
import Link from 'next/link';
import { localePath } from '@/lib/locale';
import { useLanguage } from '@/components/LanguageProvider';
import { elementLabel, weaponLabel, squadLabel } from '@/lib/dexLabels';
import { memberName } from '@/lib/memberName';

// 도감 상세의 "함께 쓰면 좋은 니케" · "스킬로 이어지는 니케" (2026-10-11. "대신 쓸 수 있는 니케"는 2026-11-04 뺐다 — lib/dexRelations.js 머리말).
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

// 앞 몇 명만 보이고 나머지는 펼친다(11-05 유저: "목록은 왜 이거밖에 없지? 요약할꺼면 등 이라는 단어가 있어야할 것 같은데").
function MoreList({ items, show, children }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rest = items.length - show;
  return (
    <>
      {children(open ? items : items.slice(0, show))}
      {rest > 0 && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2">
          {open ? t('dex_less') : t('dex_more')(rest)}
        </button>
      )}
    </>
  );
}

const skillName = (s, lang) => (lang === 'ko' ? s.name_kr || s.name : lang === 'ja' ? s.name_ja || s.name : s.name);

export default function DexRelations({ self, partners }) {
  const { lang, t } = useLanguage();
  const name = memberName(self, lang);
  const condText = (cond, squad) => [
    cond.element && t('dex_cond_element')(elementLabel(cond.element, lang)),
    cond.weapon && t('dex_cond_weapon')(weaponLabel(cond.weapon)),
    cond.squad && t('dex_cond_squad')(squadLabel(squad, lang) || ''),
    cond.burst && t('dex_cond_burst')(cond.burst),
    cond.charge && t('dex_cond_charge'),
    cond.lowestAtk && t('dex_cond_lowest_atk'),
    cond.ammo && t('dex_cond_ammo'),
    cond.dmgKind && t('dex_cond_dmg')(cond.dmgKind),
  ].filter(Boolean).join(' · ');

  if (!partners.list.length) return null;
  // 2026-11-05: 「함께 쓰면 좋은 니케」와 「스킬로 이어지는 니케」를 한 칸으로(유저 "한 칸으로 합치기"). 니케마다 같이 쓰인 수 + 스킬 연결.
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-1">{t('dex_comp_heading')}</h2>
      <p className="text-xs text-slate-500 mb-3">{t('dex_comp_desc')(name, partners.rankerTeams, partners.archetypeTeams)}</p>
      {partners.gives.length > 0 && (
        <ul className="mb-3 space-y-1 text-xs text-slate-400">
          {partners.gives.map((g, i) => <li key={i}>{t('dex_skill_gives')(skillName(g.skill, lang), condText(g.cond, g.squad), g.total)}</li>)}
        </ul>
      )}
      <MoreList items={partners.list} show={8}>
        {(list) => (
          <ul className="space-y-2 text-sm">
            {list.map((x) => (
              <li key={x.id}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Chip m={x} lang={lang} />
                  <span className="text-slate-500 text-xs">
                    {[x.ranker > 0 && t('dex_comp_ranker')(x.ranker, partners.rankerTeams), x.archetype > 0 && t('dex_comp_arch')(x.archetype)].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {x.links.map((l, j) => (
                  <p key={j} className="text-xs text-slate-500 pl-2">
                    {l.dir === 'give'
                      ? t('dex_link_give')(name, skillName(l.skill, lang), condText(l.cond, l.squad))
                      : t('dex_link_recv')(name, skillName(l.skill, lang), condText(l.cond, l.squad))}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </MoreList>
    </section>
  );
}
