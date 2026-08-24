'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { memberName } from '@/lib/memberName';

// 도감 상세의 머리말 — 빵부스러기 + 이름 + 부제.
//
// ■ 왜 클라이언트로 뺐는가
//   도감은 서버 컴포넌트라 useLanguage()를 못 쓴다. 예전에는 name_kr만 크게 띄웠고
//   언어를 바꿔도 한국어 그대로였다(2026-08-24 유저 지적).
//
// ■ 세 언어 이름은 계속 본문에 남는다
//   부제에 나머지 두 표기를 함께 실어 어느 언어로 검색해도 걸리게 한다. 서버가 렌더하는
//   기본 HTML은 한국어 기준이므로 색인에는 변화가 없다.
//   ⚠️ 이름 선택은 lib/characterNames.js의 memberName을 그대로 쓴다. 여기서 따로
//      { ko: name_kr, en: title, ja: name_ja } 를 만들면 규칙이 두 곳으로 갈라진다.
export default function DexHeader({ character }) {
  const { lang, t } = useLanguage();
  const c = character;

  const primary = memberName(c, lang);
  const others = [c.name_kr, c.title, c.name_ja].filter((n) => n && n !== primary);

  return (
    <>
      <p className="text-sm text-slate-500 mb-1">
        <Link href="/nikke" className="hover:underline">{t('dex_breadcrumb')}</Link> /
      </p>
      <h1 className="text-3xl font-extrabold text-white">{primary}</h1>
      <p className="text-slate-400 mt-1 mb-6">{others.join(' · ')}</p>
    </>
  );
}
