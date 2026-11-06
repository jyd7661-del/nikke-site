'use client';

import { useState } from 'react';
import Link from 'next/link';
import { localePath } from '@/lib/locale';
import { useLanguage } from '@/components/LanguageProvider';
import { elementLabel, weaponLabel, squadLabel, classLabel } from '@/lib/dexLabels';
import { memberName } from '@/lib/memberName';
import CharacterAvatar from '@/components/CharacterAvatar';

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

  const whereText = (b) => (b.kind === 'raid' ? `${t('mode_bossing')}(${elementLabel(b.key, lang)})`
    : b.kind === 'tower' ? `${t('mode_tribe_tower')}(${t(`tower_${b.key}`)})` : t('mode_campaign'));

  if (!partners.list.length) return null;
  // 2026-11-05: 「함께 쓰면 좋은 니케」와 「스킬로 이어지는 니케」를 한 칸으로(유저 "한 칸으로 합치기"). 니케마다 같이 쓰인 수 + 스킬 연결.
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-1">{t('dex_comp_heading')}</h2>
      <p className="text-xs text-slate-500 mb-3">{t('dex_comp_desc')(name)}</p>
      {partners.gives.length > 0 && (
        // 11-06 유저 "근데 목단이 관통공격맞아?" — 요약 줄이 목록 바로 위에 있어 아래 목록 전체가 그 버프 대상처럼 읽혔다. 상자로 떼고 「↳ 줄이 붙은 니케가 대상」이라고 밝힌다.
        <div className="mb-3 rounded-lg bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
          <p className="text-slate-300 mb-1">{t('dex_gives_label')(name)}</p>
          <ul className="space-y-1">
          {partners.gives.map((g, i) => <li key={i}>{t('dex_skill_gives')(skillName(g.skill, lang), condText(g.cond, g.squad), g.total)}</li>)}
        </ul>
        </div>
      )}
      <MoreList items={partners.list} show={8}>
        {(list) => (
          <ul className="space-y-2.5 text-sm">
            {list.map((x) => (
              <li key={x.id} className="flex items-start gap-2.5">
                {/* 11-06 유저: "여기도 초상화가 있어야할 것 같아" — 조합 칸 얼굴(DexMemberFaces)과 같은 그림, 목록이라 작은 원형 */}
                {/* 원형(object-top)은 그림마다 얼굴 위치가 달라 머리·모자만 보이는 니케가 많았다(11-06 유저 "위치가 잘 안맞는 경우가 많은 것 같아") → 조합 칸과 같은 3:4 세로 틀 */}
                <Link href={localePath(lang, `/nikke/${x.id}`)} className="shrink-0 w-10 rounded-md overflow-hidden border border-slate-700 bg-slate-900/40" aria-hidden="true" tabIndex={-1}>
                  <CharacterAvatar character={{ id: x.id, img: x.img, name: memberName(x, lang) }} shape="portrait" className="rounded-none" />
                </Link>
                <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Chip m={x} lang={lang} />
                  {x.cls && <span className="text-slate-500 text-xs">{t('dex_role')(x.burst, classLabel(x.cls, lang))}</span>}
                </div>
                {/* 목록에 든 이유(11-06 유저 "목록에 있는 이유를 같이 서술해줘") — 전부 데이터에서 센 값 */}
                <p className="text-xs text-slate-400">
                  {x.together
                    ? t('dex_reason_together')(x.together.lift, x.together.n, x.together.by.map((b) => `${whereText(b)} ${b.n}`).join(' · '))
                    : t('dex_reason_skill_only')}
                  {x.archetype > 0 && <> {t('dex_reason_arch')(x.archetype)}</>}
                </p>
                {x.links.map((l, j) => (
                  <p key={j} className="text-xs text-slate-500">
                    {l.dir === 'give'
                      ? t('dex_link_give')(name, skillName(l.skill, lang), condText(l.cond, l.squad))
                      : t('dex_link_recv')(name, skillName(l.skill, lang), condText(l.cond, l.squad))}
                  </p>
                ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </MoreList>
    </section>
  );
}
