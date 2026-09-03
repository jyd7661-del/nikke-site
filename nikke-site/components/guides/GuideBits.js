import Link from 'next/link';

// 가이드 글의 공용 조각. 서버 컴포넌트다 — 가이드 본문은 전부 빌드 때 정적으로 그린다.
//
// ⚠️ 클라이언트 i18n을 쓰지 않는다(`/nikke` 상세와 같은 제약). 가이드는 한국어로 쓰는
//    분석 글이라 번역 대상이 아니다 — 여기서 `useLanguage()`를 부르면 서버 컴포넌트가
//    깨진다. 언어별로 갈려야 하는 것이 생기면 그 블록만 클라이언트로 뗀다.

export function Section({ id, title, children }) {
  return (
    <section className="mt-10 scroll-mt-24" id={id}>
      <h2 className="text-xl font-bold text-slate-100 border-l-4 border-nikke-accent pl-3">{title}</h2>
      <div className="mt-4 space-y-4 text-slate-300 leading-7">{children}</div>
    </section>
  );
}

/** 표. 넓은 표는 가로로만 스크롤시킨다 — 본문이 가로 스크롤되면 모바일에서 못 읽는다. */
export function Table({ head, rows, align = [] }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-700">
            {head.map((h, i) => (
              <th key={h} className={`py-2 px-2 font-semibold text-slate-400 whitespace-nowrap ${align[i] === 'r' ? 'text-right' : 'text-left'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-slate-800/70">
              {r.map((cell, ci) => (
                <td key={ci} className={`py-2 px-2 ${align[ci] === 'r' ? 'text-right tabular-nums' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 출처·주의를 다는 상자. 어디서 온 값인지 글 안에서 구분하기 위한 것이다. */
export function Note({ kind = 'source', children }) {
  const tone = kind === 'warn'
    ? 'border-amber-500/40 bg-amber-500/5 text-amber-200/90'
    : 'border-slate-700 bg-slate-800/40 text-slate-400';
  return <div className={`text-sm rounded-lg border px-4 py-3 leading-6 ${tone}`}>{children}</div>;
}

/** 캐릭터 이름 → 도감 링크. id가 없으면(=DB에 없는 이름) 링크를 걸지 않는다. */
export function CharLink({ c }) {
  if (!c?.id) return <span>{c?.kr || c?.title}</span>;
  return <Link href={`/nikke/${c.id}`} className="text-sky-400 hover:underline">{c.kr}</Link>;
}

export function Lead({ children }) {
  return <p className="text-slate-300 leading-7 text-[15px]">{children}</p>;
}
