'use client';

import { useState } from 'react';
import { nikkeImageUrl } from '@/lib/nikkeImage';

// 이미지 로드에 실패하면(캐릭터 이미지가 없거나 위키 링크가 깨진 경우) 이니셜 아바타로 대체합니다.
const COLORS = [
  'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500',
  'bg-violet-500', 'bg-fuchsia-500', 'bg-teal-500', 'bg-orange-500',
];

function colorFor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

const SIZE_CLASS = {
  xs: 'w-8 h-8 text-[10px]',
  sm: 'w-12 h-12 text-xs',
  md: 'w-16 h-16 text-base',
};

export default function CharacterAvatar({ character, size = 'sm', className = '' }) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.sm;
  const src = character?.img ? nikkeImageUrl(character.img) : null;

  if (!src || failed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 ${colorFor(
          character?.id || '?'
        )} ${sizeClass} ${className}`}
      >
        {character?.name?.[0] || '?'}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={character.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`rounded-full object-cover object-top shrink-0 border border-slate-700 bg-slate-800 ${sizeClass} ${className}`}
    />
  );
}
