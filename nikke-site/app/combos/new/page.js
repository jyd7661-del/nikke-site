'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import MemberSelect from '@/components/MemberSelect';
import { useLanguage } from '@/components/LanguageProvider';
import { createCombo } from '@/lib/combos';

export default function NewComboPage() {
  const { t } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleMember = (id) => {
    setMembers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  if (loading) return null;

  if (!user) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-slate-400">{t('login_required_combo')}</p>
      </main>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || members.length === 0) {
      alert(t('combo_validation'));
      return;
    }
    setSubmitting(true);
    const { error } = await createCombo(user.id, {
      name: name.trim(),
      purpose: purpose.trim(),
      description: description.trim(),
      members,
    });
    setSubmitting(false);
    if (error) {
      alert(t('submit_failed') + ': ' + (error.message || error));
      return;
    }
    router.push('/combos');
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-6">{t('combo_add_heading')}</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">{t('combo_name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('combo_name_placeholder')}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">{t('combo_purpose')}</label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={t('combo_purpose_example')}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">{t('combo_description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t('combo_desc_long_placeholder')}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">{t('combo_members')(members.length)}</label>
          <MemberSelect selected={members} onToggle={toggleMember} />
        </div>
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
