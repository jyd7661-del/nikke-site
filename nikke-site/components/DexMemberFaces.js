'use client';

import Link from 'next/link';
import { localePath } from '@/lib/locale';
import { memberName } from '@/lib/memberName';
import CharacterAvatar from '@/components/CharacterAvatar';

// 도감 상세 조합 칸의 멤버 얼굴 줄 (2026-11-04, 유저: "여기서 니케 얼굴이 보이면 더 좋을 것 같아").
// DexTeams("등장 조합")·DexUsage("실사용 데이터")가 함께 쓴다. 추천 결과 카드(ResultPanel)와 같은 세로 초상화에 이름을 겹친 모양이다.
// 5칸 고정 격자라 휴대폰 폭(카드 안쪽 약 340px)에서도 한 줄에 들어가고, 3명짜리 PvP 부분 조합은 왼쪽부터 채운다.
// 멤버는 서버가 { id, title, name_kr, name_ja, img }로 풀어 넘긴다 — 여기서 lib/dex.js를 부르면 DB가 번들에 실린다(DexTeams 머리말).
export default function DexMemberFaces({ members, lang }) {
  return (
    <div className="mt-2 grid grid-cols-5 gap-1.5 sm:max-w-md">
      {(members || []).map((m, i) => {
        const name = m?.id ? memberName(m, lang) : m?.title;
        const face = (
          <>
            <CharacterAvatar character={{ id: m?.id, img: m?.img, name }} shape="portrait" className="rounded-b-lg" />
            <span className="absolute inset-x-0 bottom-0 px-0.5 pt-4 pb-0.5 text-[10px] font-semibold text-center leading-tight line-clamp-2 break-keep text-slate-100 drop-shadow-[0_1px_2px_rgba(2,6,23,0.95)] bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent">
              {name}
            </span>
          </>
        );
        const cls = 'relative block rounded-lg overflow-hidden border border-slate-700 bg-slate-900/40';
        return m?.id ? (
          <Link key={m.id} href={localePath(lang, `/nikke/${m.id}`)} title={name} className={`${cls} transition hover:border-nikke-accent`}>
            {face}
          </Link>
        ) : (
          <div key={m?.title || i} title={name} className={cls}>{face}</div>
        );
      })}
    </div>
  );
}
