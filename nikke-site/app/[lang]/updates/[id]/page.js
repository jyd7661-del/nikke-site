// 업데이트 소식 한 편 — /updates/[id] (2026-10-31). 왜 서버에서 그리는지는 lib/updates.js 맨 위 주석.
// 번역이 안 끝난 언어 주소는 한국어 원문을 보여 주되 noindex + canonical 한국어판으로 둔다 —
// 영어 주소에 한국어 본문을 색인시키면 해가 된다(lib/locale.js isLocalizedForSearch 주석).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { localeMeta, localePath } from '@/lib/locale';
import { dateLocale } from '@/lib/i18n';
import { fetchUpdate, fetchUpdateTranslations, localizeUpdate, lab } from '@/lib/updates';

export const revalidate = 600;
// 빌드 때는 아무것도 미리 만들지 않고, 첫 방문 때 만든 뒤 10분 동안 캐시한다(방문마다 DB를 부르지 않게).
export async function generateStaticParams() {
  return [];
}
// ⚠️ app/[lang]/layout.js가 dynamicParams = false(언어 셋만 허용)라 그대로 물려받으면 글 주소가 전부 404다(10-31 첫 배포에서 실제로 났다).
export const dynamicParams = true;

async function load(id, lang) {
  const post = await fetchUpdate(id);
  if (!post) return null;
  const tr = await fetchUpdateTranslations([post.id], lang);
  return localizeUpdate(post, tr[post.id]);
}

export async function generateMetadata({ params }) {
  const p = await load(params.id, params.lang);
  if (!p) return { robots: { index: false, follow: true } };
  const path = `/updates/${p.id}`;
  const meta = params.lang === 'ko' || p.translated
    ? localeMeta(params.lang, path)
    : { alternates: { canonical: path }, robots: { index: false, follow: true } };
  const description = String(p.content).replace(/\s+/g, ' ').slice(0, 150);
  return { title: `${p.title} | ${lab(params.lang).title}`, description, ...meta };
}

export default async function UpdatePage({ params }) {
  const lang = params.lang;
  const l = lab(lang);
  const p = await load(params.id, lang);
  if (!p) notFound();
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href={localePath(lang, '/updates')} className="text-sm text-slate-500 hover:text-slate-300">← {l.title}</Link>
      <p className="mt-6 text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString(dateLocale(lang), { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <h1 className="mt-1 text-2xl font-extrabold text-slate-100">{p.title}</h1>
      <div className="mt-6 text-slate-300 leading-7 whitespace-pre-line">{p.content}</div>
      <Link href={localePath(lang, `/board/${p.id}`)} className="mt-8 inline-block text-sm text-emerald-300 hover:underline">{l.board} →</Link>
    </main>
  );
}
