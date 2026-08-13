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
        // object-top을 쓰지 않는다(= object-position 기본값 center). 도감 `/nikke`와 같은 처리다.
        //
        // 원본(위키 `_MI` 이미지)은 256×507쯤 되는 **가슴까지 오는 상반신 그림**이지 전신이
        // 아니다. 그리고 위쪽 20% 가까이가 머리카락·머리 장식이라 **얼굴은 세로 30~40% 지점**에
        // 있다. 틀(3:4 = 0.75)이 원본(약 0.53)보다 가로로 넓어서 object-cover가 폭을 맞추고
        // 세로를 67%만 남기는데, 어디를 남기느냐가 여기서 갈린다.
        //   object-top   : 원본 0~67%를 보여줌 → 얼굴이 카드의 45~60% 지점, 즉 한가운데
        //   object-center: 원본 16~83%를 보여줌 → 얼굴이 위 20~35% 지점, 그 아래로 상반신
        // 유저 지적 그대로다 — "도감은 얼굴부터 상반신이 나와서 파악하기 좋은데 메인은
        // 가운데 얼굴이 있는 느낌"(2026-08-13). 도감 쪽이 맞아서 그쪽에 맞췄다.
        //
        // 처음에 실루엣의 알파 폭만 보고 "머리가 맨 위에 있으니 object-top이 얼굴을 보여준다"고
        // 판단했는데 틀렸다. 머리 꼭대기와 얼굴은 다른 위치다. 이미지를 실제로 열어보고 잡았다.
        className={`object-cover shrink-0 bg-slate-800 ${shapeClass} ${className}`}
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
