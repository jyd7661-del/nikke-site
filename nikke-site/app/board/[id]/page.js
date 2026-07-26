'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { fetchPost, fetchComments, createComment, fetchProfilesByIds } from '@/lib/board';

export default function PostDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [p, c] = await Promise.all([fetchPost(id), fetchComments(id)]);
    setPost(p);
    setComments(c);
    const ids = new Set(c.map((x) => x.user_id));
    if (p) ids.add(p.user_id);
    setNicknames(await fetchProfilesByIds([...ids]));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submitComment = async (e) => {
    e.preventDefault();
    if (!user) {
      alert('댓글을 쓰려면 로그인이 필요해요.');
      return;
    }
    if (!text.trim()) return;
    setSubmitting(true);
    await createComment(user.id, id, text.trim());
    setText('');
    setSubmitting(false);
    load();
  };

  if (loading) return <main className="max-w-2xl mx-auto px-4 py-8 text-sm text-slate-500">불러오는 중...</main>;
  if (!post) return <main className="max-w-2xl mx-auto px-4 py-8 text-sm text-slate-500">글을 찾을 수 없습니다.</main>;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-1">{post.title}</h1>
      <p className="text-xs text-slate-500 mb-4">
        {nicknames[post.user_id] || '익명 지휘관'} · {new Date(post.created_at).toLocaleString('ko-KR')}
      </p>
      <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed border-b border-slate-800 pb-6 mb-6">
        {post.content}
      </p>

      <h2 className="text-sm font-semibold text-slate-400 mb-3">댓글 {comments.length}</h2>
      <div className="space-y-3 mb-6">
        {comments.map((c) => (
          <div key={c.id} className="bg-nikke-panel border border-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">
              {nicknames[c.user_id] || '익명 지휘관'} · {new Date(c.created_at).toLocaleString('ko-KR')}
            </p>
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{c.content}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="text-sm text-slate-600">첫 댓글을 남겨보세요.</p>}
      </div>

      <form onSubmit={submitComment} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={user ? '댓글을 입력하세요' : '로그인 후 댓글을 남길 수 있어요'}
          disabled={!user}
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent disabled:opacity-50"
        />
        <button
          disabled={!user || submitting}
          className="bg-nikke-accent text-slate-900 font-semibold text-sm px-4 py-2 rounded disabled:opacity-50"
        >
          등록
        </button>
      </form>
    </main>
  );
}
