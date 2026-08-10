'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { createPost, BOARD_CATEGORIES, defaultPrivateFor } from '@/lib/board';
import { useLanguage } from '@/components/LanguageProvider';

export default function NewPostPage() {
  const { t } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('free');
  // 비밀글 여부. 버그 제보를 고르면 기본으로 켜지되, 사용자가 끌 수 있다.
  // (버그 게시판 전체를 무조건 비밀로 하면 중복 제보가 늘고 색인 페이지가 줄어 애드센스
  //  심사에 불리하다 — supabase/board_private_posts_migration.sql 참고)
  const [isPrivate, setIsPrivate] = useState(defaultPrivateFor('free'));
  // 사용자가 직접 체크박스를 건드렸는지. 건드린 뒤에는 카테고리를 바꿔도 그 선택을 존중한다.
  const [privateTouched, setPrivateTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 목록에서 넘어온 ?category= 를 초기값으로 쓴다.
  //
  // useSearchParams()를 쓰지 않은 이유: 이 저장소에 선례가 없고, App Router에서 정적
  // 프리렌더되는 페이지에 도입하면 Suspense 경계를 요구해 **빌드가 깨질 수 있다.**
  // 로컬 빌드 검증이 제한적이라(§8) 배포에서야 드러나므로, 위험 없는 window 경로를 쓴다.
  // 첫 렌더 뒤 한 번 바뀌는 정도는 감수한다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('category');
    if (!q || !BOARD_CATEGORIES.some((c) => c.key === q)) return;
    setCategory(q);
    setIsPrivate(defaultPrivateFor(q));
  }, []);

  const pickCategory = (key) => {
    setCategory(key);
    if (!privateTouched) setIsPrivate(defaultPrivateFor(key));
  };

  if (loading) return null;
  if (!user) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-slate-400">{t('login_required_write')}</p>
      </main>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    const { data, error } = await createPost(user.id, { title: title.trim(), content: content.trim(), category, isPrivate });
    setSubmitting(false);
    if (error) {
      alert(t('submit_failed') + ': ' + (error.message || error));
      return;
    }
    router.push(`/board/${data.id}`);
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-6">{t('board_write_heading')}</h1>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-1.5">
          {BOARD_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => pickCategory(c.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                category === c.key
                  ? 'bg-nikke-accent text-slate-900 border-nikke-accent font-semibold'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {t(c.labelKey)}
            </button>
          ))}
        </div>
        <label
          className={`flex items-start gap-2 text-xs cursor-pointer border rounded-lg px-3 py-2.5 transition ${
            isPrivate
              ? 'text-amber-200 bg-amber-500/10 border-amber-500/50'
              : 'text-slate-400 border-slate-800 hover:border-slate-700'
          }`}
        >
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => { setIsPrivate(e.target.checked); setPrivateTouched(true); }}
            className="mt-0.5"
          />
          <span>
            {t('post_private_label')}
            <span className="block text-slate-600 mt-0.5">
              {isPrivate
                ? t('post_private_on_note')
                : t('post_private_off_note')}
              {category === 'bug' && ` ${t('post_private_bug_note')}`}
            </span>
          </span>
        </label>
        {category === 'bug' && (
          <p className="text-xs text-slate-500">
            {t('bug_guide')}
          </p>
        )}
        {category === 'suggestion' && (
          <p className="text-xs text-slate-500">{t('suggestion_guide')}</p>
        )}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('title_placeholder')}
          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder={t('content_placeholder')}
          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent resize-none"
        />
        <button
          disabled={submitting}
          className="bg-nikke-accent text-slate-900 font-bold px-5 py-2.5 rounded-lg disabled:opacity-50"
        >
          {t('submit')}
        </button>
      </form>
    </main>
  );
}
