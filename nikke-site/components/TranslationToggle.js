'use client';

import { useLanguage } from './LanguageProvider';

// 번역본과 원문을 오가는 작은 버튼 (2026-08-09)
//
// 자동 번역이라는 걸 숨기지 않는다. 게임 용어가 많은 커뮤니티 글은 기계 번역이 어색해질
// 여지가 있어서, 읽는 사람이 언제든 원문을 확인할 수 있어야 한다.
// (니케 이름과 게임 용어 자체는 AI가 아니라 용어집이 그대로 박아 넣는다 — lib/glossary.js)
export default function TranslationToggle({ available, showingOriginal, onToggle, className = '' }) {
  const { t } = useLanguage();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-nikke-accent border border-slate-800 hover:border-slate-600 rounded-full px-2 py-0.5 transition ${className}`}
      title={showingOriginal ? '' : t('translated_badge')}
    >
      🌐 {showingOriginal ? t('show_translation') : `${t('translated_badge')} · ${t('show_original')}`}
    </button>
  );
}
