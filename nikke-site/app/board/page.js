'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchPosts, fetchProfilesByIds, BOARD_CATEGORIES } from '@/lib/board';
import { fetchTranslations } from '@/lib/translate';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { useAuth } from '@/components/AuthProvider';
import { useLanguage } from '@/components/LanguageProvider';

const TABS = [{ key: 'all', labelKey: 'filter_all' }, ...BOARD_CATEGORIES];
const CATEGORY_LABEL_KEY = Object.fromEntries(BOARD_CATEGORIES.map((c) => [c.key, c.labelKey]));
const CATEGORY_BADGE_STYLE = {
  bug: 'text-rose-300 bg-rose-500/10 border-rose-500/40',
  suggestion: 'text-sky-300 bg-sky-500/10 border-sky-500/40',
  free: 'text-slate-400 bg-slate-500/10 border-slate-500/40',
};

export default function BoardPage() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const [posts, setPosts] = useState([]);
  const [nicknames, setNicknames] = useState({});
  // 제목 번역본. 목록에서는 토글 없이 번역된 제목만 보여주고, 원문은 글 안에서 볼 수 있다.
  const [titles, setTitles] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  // 글 상세에서 "목록으로" 눌러 돌아왔을 때 보던 게시판을 되살린다.
  // (useSearchParams 대신 window를 쓰는 이유는 app/board/new/page.js 주석 참고)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('category');
    if (q && TABS.some((tb) => tb.key === q)) setTab(q);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const list = await fetchPosts(tab);
      setPosts(list);
      setNicknames(await fetchProfilesByIds([...new Set(list.map((p) => p.user_id))]));
      // 원문이 이미 화면 언어와 같은 글은 번역본이 아예 없다(서버가 만들지 않는다).
      setTitles(await fetchTranslations('post', list.map((p) => p.id), lang));
      setLoading(false);
    })();
  }, [tab, lang]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">{t('nav_board')}</h1>
        {user ? (
          <Link
            // 지금 보고 있는 게시판을 그대로 들고 간다. 이게 없어서 버그 제보 탭에서
            // 글쓰기를 눌러도 자유 게시판으로 시작하는 문제가 있었다(2026-08-09 제보).
            href={tab && tab !== 'all' ? `/board/new?category=${tab}` : '/board/new'}
            className="text-xs bg-nikke-accent text-slate-900 font-semibold px-3 py-1.5 rounded-lg hover:brightness-110 transition"
          >
            {t('board_write')}
          </Link>
        ) : (
          <span className="text-xs text-slate-500">{t('board_write_login_required')}</span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        {t('board_intro')}
      </p>

      <div className="flex gap-1.5 mb-6">
        {/* ⚠️ 콜백 인자를 t 로 쓰면 번역 함수 t 를 가린다(2026-08-10). 이름을 tb 로 둔다. */}
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              tab === tb.key
                ? 'bg-nikke-accent text-slate-900 border-nikke-accent font-semibold'
                : 'border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {!isSupabaseConfigured && (
        <p className="text-sm text-rose-300 mb-6">
          {t('supabase_not_configured_board')}
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">{t('loading')}</p>}
      {!loading && posts.length === 0 && isSupabaseConfigured && (
        <p className="text-sm text-slate-500">{t('board_empty')}</p>
      )}

      <div className="divide-y divide-slate-800 border-t border-b border-slate-800 rounded-lg overflow-hidden bg-nikke-panel/30">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/board/${post.id}`}
            className="flex items-center justify-between py-3 px-3 hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                className={`text-[10px] shrink-0 border rounded-full px-2 py-0.5 ${
                  CATEGORY_BADGE_STYLE[post.category] || CATEGORY_BADGE_STYLE.free
                }`}
              >
                {t(CATEGORY_LABEL_KEY[post.category] || 'board_cat_free')}
              </span>
              {post.is_private && (
                <span
                  className="text-[10px] shrink-0 border rounded-full px-2 py-0.5 text-amber-300 bg-amber-500/10 border-amber-500/40"
                  title={t('private_post_title')}
                >
                  🔒
                </span>
              )}
              {titles[post.id]?.title && (
                <span
                  className="text-[10px] shrink-0 text-slate-500"
                  title={t('translated_title_title')}
                >
                  🌐
                </span>
              )}
              <span className="text-sm text-slate-100 truncate">{titles[post.id]?.title || post.title}</span>
            </span>
            <span className="text-xs text-slate-500 shrink-0 ml-3">
              {nicknames[post.user_id] || t('anonymous_commander')} ·{' '}
              {new Date(post.created_at).toLocaleDateString('ko-KR')}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
