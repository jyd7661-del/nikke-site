// 업데이트 소식 목록 — /updates (2026-10-31). 왜 서버에서 그리는지는 lib/updates.js 맨 위 주석.
//
// 글은 게시판 "업데이트" 분류 그대로다(운영자가 매주 올린다). 번역은 게시판 자동 번역(content_translations)을 쓴다.
// ⚠️ 서버 컴포넌트라 클라이언트 i18n을 못 쓴다 — 라벨은 lib/updates.js의 L에 언어별로 둔다(/nikke와 같은 제약).
import Link from 'next/link';
import { localeMeta, localePath } from '@/lib/locale';
import { dateLocale } from '@/lib/i18n';
import { fetchUpdates, fetchUpdateTranslations, localizeUpdate, lab } from '@/lib/updates';

// 새 글은 배포 없이 10분 안에 보인다.
export const revalidate = 600;

export async function generateMetadata({ params }) {
  const l = lab(params.lang);
  return { title: `${l.title} | 니케 조합 추천`, description: l.desc, ...localeMeta(params.lang, '/updates') };
}

const firstLines = (s, n = 3) => String(s || '').split('\n').filter((x) => x.trim()).slice(0, n).join('\n');

export default async function UpdatesPage({ params }) {
  const lang = params.lang;
  const l = lab(lang);
  const posts = await fetchUpdates();
  const tr = await fetchUpdateTranslations(posts.map((p) => p.id), lang);
  const list = posts.map((p) => localizeUpdate(p, tr[p.id]));
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-extrabold text-slate-100">{l.title}</h1>
      <p className="mt-3 text-slate-400 leading-7">{l.desc}</p>
      {list.length === 0 ? (
        <p className="mt-8 text-slate-500">{l.empty}</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {list.map((p) => (
            <li key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString(dateLocale(lang), { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <h2 className="mt-1 text-lg font-bold text-slate-100">
                <Link href={localePath(lang, `/updates/${p.id}`)} className="hover:text-emerald-300">{p.title}</Link>
              </h2>
              <p className="mt-2 text-sm text-slate-400 leading-6 whitespace-pre-line">{firstLines(p.content)}</p>
              <Link href={localePath(lang, `/updates/${p.id}`)} className="mt-2 inline-block text-sm text-emerald-300 hover:underline">{l.more}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
