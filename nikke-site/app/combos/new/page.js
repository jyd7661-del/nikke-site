'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import MemberSelect from '@/components/MemberSelect';
import { createCombo } from '@/lib/combos';

export default function NewComboPage() {
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
        <p className="text-sm text-slate-400">조합을 등록하려면 먼저 로그인해주세요.</p>
      </main>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || members.length === 0) {
      alert('조합 이름과 최소 1명 이상의 니케를 선택해주세요.');
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
      alert('등록에 실패했습니다: ' + (error.message || error));
      return;
    }
    router.push('/combos');
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-6">내 조합 등록</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">조합 이름</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 초반 무과금 캠페인 팀"
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">용도</label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="예: 캠페인 / 보스전 / 아레나"
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">설명</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="이 조합을 왜 추천하는지, 어떻게 운영하는지 적어주세요"
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-nikke-accent resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">구성원 (최대 5명, {members.length}/5)</label>
          <MemberSelect selected={members} onToggle={toggleMember} />
        </div>
        <button
          disabled={submitting}
          className="bg-nikke-accent text-slate-900 font-bold px-5 py-2.5 rounded-lg disabled:opacity-50"
        >
          등록하기
        </button>
      </form>
    </main>
  );
}
