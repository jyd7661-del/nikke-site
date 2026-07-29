'use client';

import { useState } from 'react';
import { nikkeImageUrl } from '@/lib/nikkeImage';

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

// shape="circle"(기본): 원형 작은 아이콘. 목록/칩 등 좁은 공간용.
// shape="portrait": 카드 폭을 꽉 채우는 세로형(상반신) 이미지. 캐릭터 선택 그리드용 - 더 크고 상반신까지 보이게.
export default function CharacterAvatar({ character, size = 'sm', shape = 'circle', className = '' }) {
  const [failed, setFailed] = useState(false);
  const src = character?.img ? nikkeImageUrl(character.img) : null;

  if (shape === 'portrait') {
    const shapeClass = 'w-full aspect-[3/4] rounded-t-lg';
    if (!src || failed) {
      return (
        <span
          className={`flex items-center justify-center font-bold text-white shrink-0 text-3xl ${colorFor(
            character?.id || '?'
          )} ${shapeClass} ${className}`}
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
        className={`object-cover object-top shrink-0 bg-slate-800 ${shapeClass} ${className}`}
      />
    );
  }

  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.sm;

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
