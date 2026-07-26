'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchPosts, fetchProfilesByIds } from '@/lib/board';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { useAuth } from '@/components/AuthProvider';

export default function BoardPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const list = await fetchPosts();
      setPosts(list);
      setNicknames(await fetchProfilesByIds([...new Set(list.map((p) => p.user_id))]));
      setLoading(false);
    })();
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">게시판</h1>
        {user ? (
          <Link href="/board/new" className="text-xs bg-nikke-accent text-slate-900 font-semibold px-3 py-1.5 rounded">
            + 글쓰기
          </Link>
        ) : (
          <span className="text-xs text-slate-500">로그인 후 글쓰기 가능</span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">자유롭게 공략, 잡담, 질문을 나눠보세요.</p>

      {!isSupabaseConfigured && (
        <p className="text-sm text-rose-300 mb-6">
          Supabase 연결이 아직 설정되지 않아 게시판 기능을 사용할 수 없습니다. README.md를 참고해주세요.
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">불러오는 중...</p>}
      {!loading && posts.length === 0 && isSupabaseConfigured && (
        <p className="text-sm text-slate-500">아직 게시글이 없습니다. 첫 글을 남겨보세요!</p>
      )}

      <div className="divide-y divide-slate-800 border-t border-b border-slate-800">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/board/${post.id}`}
            className="flex items-center justify-between py-3 px-1 hover:bg-slate-900/40"
          >
            <span className="text-sm text-slate-100 truncate">{post.title}</span>
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
