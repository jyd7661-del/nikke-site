'use client';

import { useState } from 'react';
import { useLanguage } from '@/components/LanguageProvider';
import { useAuth } from './AuthProvider';
import { saveNickname } from '@/lib/roster';

// 로그인은 했지만 닉네임이 없는 경우에만 표시되는 작은 배너
export default function NicknamePrompt() {
  const { t } = useLanguage();
  const { user, profile, loading, refreshProfile } = useAuth();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading || !user || (profile && profile.nickname)) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setSaving(true);
    await saveNickname(user.id, value.trim());
    await refreshProfile();
    setSaving(false);
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-nikke-gold/10 border border-nikke-gold/40 rounded-lg px-4 py-3 mb-6 text-sm"
    >
      <span className="text-nikke-gold shrink-0">{t('nickname_prompt')}</span>
      <div className="flex gap-2 w-full sm:w-auto">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('nickname')}
          maxLength={20}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-nikke-accent flex-1"
        />
        <button
          disabled={saving}
          className="bg-nikke-gold text-slate-900 font-semibold text-xs px-3 py-1.5 rounded disabled:opacity-50"
        >
          {t('save')}
        </button>
      </div>
    </form>
  );
}
