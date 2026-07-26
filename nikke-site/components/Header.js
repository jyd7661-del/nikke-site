'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';

export default function Header() {
  const { user, profile, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);

  const sendLink = async (e) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      alert('아직 Supabase 연결이 설정되지 않았습니다. README.md를 참고해 .env.local을 설정해주세요.');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) alert(error.message);
    else setSent(true);
  };

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setOpen(false);
  };

  return (
    <header className="border-b border-slate-800 bg-nikke-panel/70 backdrop-blur sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="font-extrabold text-lg shrink-0">
          <span className="text-nikke-accent">니케</span> 조합 추천
        </Link>
        <nav className="flex items-center gap-3 sm:gap-4 text-sm text-slate-300">
          <Link href="/" className="hover:text-white">
            추천
          </Link>
          <Link href="/combos" className="hover:text-white">
            커뮤니티 조합
          </Link>
          <Link href="/board" className="hover:text-white">
            게시판
          </Link>

          {loading ? null : user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 hidden sm:inline">
                {profile?.nickname || user.email}
              </span>
              <button
                onClick={logout}
                className="px-2.5 py-1 rounded border border-slate-700 hover:border-rose-400 text-xs"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setOpen((v) => !v)}
                className="px-3 py-1.5 rounded bg-nikke-accent text-slate-900 font-semibold text-xs"
              >
                로그인
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
                  {sent ? (
                    <p className="text-xs text-emerald-300">
                      메일함에서 로그인 링크를 확인해주세요!
                    </p>
                  ) : (
                    <form onSubmit={sendLink} className="flex flex-col gap-2">
                      <input
                        type="email"
                        required
                        placeholder="이메일 주소"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs outline-none focus:border-nikke-accent"
                      />
                      <button
                        type="submit"
                        className="bg-nikke-accent text-slate-900 rounded py-1.5 text-xs font-semibold"
                      >
                        로그인 링크 받기
                      </button>
                      <p className="text-[10px] text-slate-500">
                        비밀번호 없이, 받은 메일의 링크를 클릭하면 로그인됩니다.
                      </p>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
