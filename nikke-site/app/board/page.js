'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchPosts, fetchProfilesByIds, BOARD_CATEGORIES } from '@/lib/board';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { useAuth } from '@/components/AuthProvider';

const TABS = [{ key: 'all', label: '전체' }, ...BOARD_CATEGORIES];
const CATEGORY_LABEL = Object.fromEntries(BOARD_CATEGORIES.map((c) => [c.key, c.label]));
const CATEGORY_BADGE_STYLE = {
  bug: 'text-rose-300 bg-rose-500/10 border-rose-500/40',
  suggestion: 'text-sky-300 bg-sky-500/10 border-sky-500/40',
  free: 'text-slate-400 bg-slate-500/10 border-slate-500/40',
};

export default function BoardPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  // 글 상세에서 "목록으로" 눌러 돌아왔을 때 보던 게시판을 되살린다.
  // (useSearchParams 대신 window를 쓰는 이유는 app/board/new/page.js 주석 참고)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('category');
    if (q && TABS.some((t) => t.key === q)) setTab(q);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const list = await fetchPosts(tab);
      setPosts(list);
      setNicknames(await fetchProfilesByIds([...new Set(list.map((p) => p.user_id))]));
      setLoading(false);
    })();
  }, [tab]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">게시판</h1>
        {user ? (
          <Link
            // 지금 보고 있는 게시판을 그대로 들고 간다. 이게 없어서 버그 제보 탭에서
            // 글쓰기를 눌러도 자유 게시판으로 시작하는 문제가 있었다(2026-08-09 제보).
            href={tab && tab !== 'all' ? `/board/new?category=${tab}` : '/board/new'}
            className="text-xs bg-nikke-accent text-slate-900 font-semibold px-3 py-1.5 rounded-lg hover:brightness-110 transition"
          >
            + 글쓰기
          </Link>
        ) : (
          <span className="text-xs text-slate-500">로그인 후 글쓰기 가능</span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        자유롭게 공략, 잡담, 질문을 나눠보세요. 버그를 발견했거나 사이트에 바라는 점이 있다면 버그 제보 / 건의사항
        게시판에 남겨주세요.
      </p>

      <div className="flex gap-1.5 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              tab === t.key
                ? 'bg-nikke-accent text-slate-900 border-nikke-accent font-semibold'
                : 'border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!isSupabaseConfigured && (
        <p className="text-sm text-rose-300 mb-6">
          Supabase 연결이 아직 설정되지 않아 게시판 기능을 사용할 수 없습니다. README.md를 참고해주세요.
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">불러오는 중...</p>}
      {!loading && posts.length === 0 && isSupabaseConfigured && (
        <p className="text-sm text-slate-500">아직 게시글이 없습니다. 첫 글을 남겨보세요!</p>
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
                {CATEGORY_LABEL[post.category] || '자유'}
              </span>
              {post.is_private && (
                <span
                  className="text-[10px] shrink-0 border rounded-full px-2 py-0.5 text-amber-300 bg-amber-500/10 border-amber-500/40"
                  title="운영자와 작성자만 볼 수 있는 글입니다"
                >
                  🔒
                </span>
              )}
              <span className="text-sm text-slate-100 truncate">{post.title}</span>
            </span>
            <span className="text-xs text-slate-500 shrink-0 ml-3">
              {nicknames[post.user_id] || '익명 지휘관'} ·{' '}
              {new Date(post.created_at).toLocaleDateString('ko-KR')}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
