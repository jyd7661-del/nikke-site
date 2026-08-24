'use client';

import { useLanguage } from '@/components/LanguageProvider';
import { classLabel, elementLabel, corpLabel, weaponLabel } from '@/lib/dexLabels';

// 도감 상세의 기본 정보 표(등급·버스트·클래스·속성·무기·제조사·부대·출시일·오버스펙).
//
// 라벨과 값이 **둘 다** 한국어로 박혀 있어 언어를 바꿔도 안 바뀌던 자리다(2026-08-24 유저 지적).
// 값의 표기는 data/glossary.json 한 곳에서 온다 — lib/dex.js의 classLabel/elementLabel/
// corpLabel이 그걸 읽는다. 여기서 새 번역표를 만들지 않는다.
//
// ⚠️ 소속 부대(squad)는 영문 표기 그대로 둔다. 데이터가 영어 하나뿐이고
//    번역하면 추론(B등급)이 된다. 페르소나 콜라보 2명은 squad 자체가 비어 있다.
function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-800 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-200 font-medium text-right">{value}</span>
    </div>
  );
}

export default function DexInfoTable({ character }) {
  const { lang, t } = useLanguage();
  const c = character;

  return (
    <div className="flex-1">
      <InfoRow label={t('dex_rarity')} value={c.rarity} />
      <InfoRow label={t('dex_burst')} value={t('dex_burst_value')(c.burst)} />
      <InfoRow label={t('dex_class')} value={classLabel(c.class, lang)} />
      <InfoRow label={t('dex_element')} value={elementLabel(c.element, lang)} />
      <InfoRow label={t('dex_weapon')} value={weaponLabel(c.weapon)} />
      <InfoRow label={t('dex_corp')} value={corpLabel(c.manufacturer, lang)} />
      {c.squad && <InfoRow label={t('dex_squad')} value={c.squad} />}
      {c.releaseDate && <InfoRow label={t('dex_release')} value={c.releaseDate} />}
      {c.overspec && <InfoRow label={t('dex_overspec')} value={t('dex_overspec_value')} />}
    </div>
  );
}
