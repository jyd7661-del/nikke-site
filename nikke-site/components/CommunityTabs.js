'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';

// 상단 메뉴 "커뮤니티" 아래의 두 페이지(커뮤니티 조합 · 게시판)를 오가는 탭.
// 메뉴를 하나로 합친 뒤(2026-10-23) 게시판으로 가는 길은 이 탭뿐이다.
const TABS = [
  { href: '/combos', labelKey: 'nav_combos' },
  { href: '/board', labelKey: 'nav_board' },
];

export default function CommunityTabs({ current }) {
  const { t, lp } = useLanguage();
  return (
    <div className="flex gap-1 mb-4 text-sm border-b border-slate-800">
      {TABS.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={lp(tab.href)}
            className={`px-3 py-2 -mb-px border-b-2 whitespace-nowrap transition-colors ${
              active ? 'border-nikke-accent text-nikke-accent font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
