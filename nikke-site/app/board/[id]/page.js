'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import {
  fetchPost, fetchComments, createComment, fetchProfilesByIds, BOARD_CATEGORIES,
  updatePost, deletePost, updateComment, deleteComment,
} from '@/lib/board';
import { fetchTranslations } from '@/lib/translate';
import { useLanguage } from '@/components/LanguageProvider';
import { dateLocale } from '@/lib/i18n';
import TranslationToggle from '@/components/TranslationToggle';

const CATEGORY_LABEL_KEY = Object.fromEntries(BOARD_CATEGORIES.map((c) => [c.key, c.labelKey]));
const CATEGORY_BADGE_STYLE = {
  bug: 'text-rose-300 bg-rose-500/10 border-rose-500/40',
  suggestion: 'text-sky-300 bg-sky-500/10 border-sky-500/40',
  free: 'text-slate-400 bg-slate-500/10 border-slate-500/40',
};

export default function PostDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  // 번역본과 "원문 보기" 상태. 글과 댓글을 따로 토글하면 화면이 번잡해져서 한 번에 바꾼다.
  const [postTr, setPostTr] = useState(null);
  const [commentTr, setCommentTr] = useState({});
  const [showOriginal, setShowOriginal] = useState(false);
  const [nicknames, setNicknames] = useState({});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // 글 수정 모드. 2026-08-09 추가 — DB 정책은 처음부터 있었는데 화면에 버튼이 없어서
  // "수정·삭제가 안 된다"는 제보를 받았다.
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  // 댓글 수정 모드 (한 번에 하나만)
  const [editingComment, setEditingComment] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');

  const load = async () => {
    setLoading(true);
    const [p, c] = await Promise.all([fetchPost(id), fetchComments(id)]);
    setPost(p);
    setComments(c);
    const ids = new Set(c.map((x) => x.user_id));
    if (p) ids.add(p.user_id);
    setNicknames(await fetchProfilesByIds([...ids]));
    const [pt, ct] = await Promise.all([
      p ? fetchTranslations('post', [p.id], lang) : Promise.resolve({}),
      fetchTranslations('comment', c.map((x) => x.id), lang),
    ]);
    setPostTr(p ? pt[p.id] || null : null);
    setCommentTr(ct);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lang]);

  // 번역본이 있고 원문 보기를 누르지 않았을 때만 번역문을 쓴다.
  const useTr = Boolean(postTr) && !showOriginal;
  const shownTitle = useTr && postTr.title ? postTr.title : post?.title;
  const shownContent = useTr && postTr.content ? postTr.content : post?.content;

  const isMine = Boolean(user && post && user.id === post.user_id);

  const startEdit = () => {
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditPrivate(Boolean(post.is_private));
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) return;
    setSubmitting(true);
    const { error } = await updatePost(user.id, id, {
      title: editTitle.trim(),
      content: editContent.trim(),
      isPrivate: editPrivate,
    });
    setSubmitting(false);
    if (error) { alert(t('edit_failed_retry')); return; }
    setEditing(false);
    load();
  };

  const removePost = async () => {
    // 댓글은 DB의 ON DELETE CASCADE가 함께 지운다(lib/board.js 주석 참고).
    if (!confirm(t('confirm_delete_post'))) return;
    const { error } = await deletePost(user.id, id);
    if (error) { alert(t('delete_failed')); return; }
    router.push('/board');
  };

  const saveComment = async (commentId) => {
    if (!commentDraft.trim()) return;
    const { error } = await updateComment(user.id, commentId, commentDraft.trim());
    if (error) { alert(t('comment_edit_failed')); return; }
    setEditingComment(null);
    load();
  };

  const removeComment = async (commentId) => {
    if (!confirm(t('confirm_delete_comment'))) return;
    const { error } = await deleteComment(user.id, commentId);
    if (error) { alert(t('comment_delete_failed')); return; }
    load();
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!user) {
      alert(t('login_required_comment'));
      return;
    }
    if (!text.trim()) return;
    setSubmitting(true);
    await createComment(user.id, id, text.trim());
    setText('');
    setSubmitting(false);
    load();
  };

  if (loading) return <main className="max-w-2xl mx-auto px-4 py-8 text-sm text-slate-500">{t('loading')}</main>;
  // 비밀글 URL을 로그아웃 상태로 열면 여기로 온다(RLS가 행 자체를 안 내려준다).
  // 여기에도 나가는 길이 있어야 막다른 길이 되지 않는다.
  if (!post) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-slate-500 mb-1">{t('post_not_found')}</p>
        <p className="text-xs text-slate-600 mb-4">
          {t('post_not_found_note')}
        </p>
        <Link href="/board" className="text-xs text-slate-500 hover:text-slate-300">
          {t('back_to_list')}
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* 목록으로 돌아가는 길이 없어서 브라우저 뒤로가기밖에 방법이 없었다(2026-08-09 제보).
          보던 게시판 탭을 그대로 들고 돌아간다. */}
      <div className="mb-4">
        <Link
          href={post.category ? `/board?category=${post.category}` : '/board'}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
        >
          {t('back_to_list')}
        </Link>
      </div>
      <span
        className={`inline-block text-[10px] border rounded-full px-2 py-0.5 mb-2 ${
          CATEGORY_BADGE_STYLE[post.category] || CATEGORY_BADGE_STYLE.free
        }`}
      >
        {t(CATEGORY_LABEL_KEY[post.category] || 'board_cat_free')}
      </span>
      {post.is_private && (
        <>
          <span className="inline-block text-[10px] border rounded-full px-2 py-0.5 mb-2 ml-1 text-amber-300 bg-amber-500/10 border-amber-500/40">
            {t('private_post_badge')}
          </span>
          {/* 로그아웃하면 본인도 못 본다는 점을 분명히 알린다. 로그아웃 상태에서는 서버가
              작성자를 구분할 방법이 없어(익명과 동일) 목록에서도 사라지는데, 이걸 모르면
              "내 글이 사라졌다"고 오해하게 된다(2026-08-09 실제 제보). */}
          <p className="text-xs text-amber-200/70 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
            {t('private_post_explain')}
          </p>
        </>
      )}

      {editing ? (
        <div className="border-b border-slate-800 pb-6 mb-6">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm mb-2 outline-none focus:border-nikke-accent"
          />
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={8}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm mb-2 outline-none focus:border-nikke-accent"
          />
          <label className="flex items-center gap-2 text-xs text-slate-400 mb-3 cursor-pointer">
            <input type="checkbox" checked={editPrivate} onChange={(e) => setEditPrivate(e.target.checked)} />
            {t('keep_private_label')}
          </label>
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              disabled={submitting}
              className="bg-nikke-accent text-slate-900 font-semibold text-sm px-4 py-2 rounded disabled:opacity-50"
            >
              {t('save')}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="border border-slate-700 text-slate-300 text-sm px-4 py-2 rounded hover:border-slate-500"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold mb-1">{shownTitle}</h1>
          <p className="text-xs text-slate-500 mb-4 flex items-center gap-2 flex-wrap">
            <span>
              {nicknames[post.user_id] || t('anonymous_commander')} · {new Date(post.created_at).toLocaleString(dateLocale(lang))}
            </span>
            <TranslationToggle
              available={Boolean(postTr)}
              showingOriginal={showOriginal}
              onToggle={() => setShowOriginal((v) => !v)}
            />
            {/* 원문이 다른 언어인데 번역본이 아직 없는 경우. 왜 내 언어로 안 보이는지 알려준다.
                번역은 글 등록 직후 백그라운드로 만들어지므로 몇 초 뒤 새로고침하면 대개 나온다. */}
            {!postTr && post.source_lang && post.source_lang !== lang && (
              <span className="text-[11px] text-slate-600">🌐 {t('translate_pending')}</span>
            )}
          </p>
          <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{shownContent}</p>
          <div className="border-b border-slate-800 pb-6 mb-6">
            {isMine && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={startEdit}
                  className="text-xs border border-slate-700 text-slate-300 px-3 py-1.5 rounded hover:border-slate-500"
                >
                  {t('edit')}
                </button>
                <button
                  onClick={removePost}
                  className="text-xs border border-rose-500/40 text-rose-300 px-3 py-1.5 rounded hover:border-rose-500"
                >
                  {t('delete')}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <h2 className="text-sm font-semibold text-slate-400 mb-3">{t('comments')} {comments.length}</h2>
      <div className="space-y-3 mb-6">
        {comments.map((c) => (
          <div key={c.id} className="bg-nikke-panel border border-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">
              {nicknames[c.user_id] || t('anonymous_commander')} · {new Date(c.created_at).toLocaleString(dateLocale(lang))}
            </p>
            {editingComment === c.id ? (
              <div className="flex gap-2">
                <input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-nikke-accent"
                />
                <button onClick={() => saveComment(c.id)} className="text-xs bg-nikke-accent text-slate-900 font-semibold px-3 rounded">
                  {t('save')}
                </button>
                <button onClick={() => setEditingComment(null)} className="text-xs border border-slate-700 text-slate-300 px-3 rounded">
                  {t('cancel')}
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-200 whitespace-pre-wrap">
                  {!showOriginal && commentTr[c.id]?.content ? commentTr[c.id].content : c.content}
                </p>
                {user && user.id === c.user_id && (
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => { setEditingComment(c.id); setCommentDraft(c.content); }}
                      className="text-[11px] text-slate-500 hover:text-slate-300 underline decoration-dotted"
                    >
                      {t('edit')}
                    </button>
                    <button
                      onClick={() => removeComment(c.id)}
                      className="text-[11px] text-slate-500 hover:text-rose-300 underline decoration-dotted"
                    >
                      {t('delete')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {comments.length === 0 && <p className="text-sm text-slate-600">{t('comment_empty')}</p>}
      </div>

      <form onSubmit={submitComment} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={user ? t('comment_placeholder') : t('comment_login_placeholder')}
          disabled={!user}
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent disabled:opacity-50"
        />
        <button
          disabled={!user || submitting}
          className="bg-nikke-accent text-slate-900 font-semibold text-sm px-4 py-2 rounded disabled:opacity-50"
        >
          {t('submit_short')}
        </button>
      </form>
    </main>
  );
}
