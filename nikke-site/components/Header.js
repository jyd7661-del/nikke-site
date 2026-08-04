'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { LOCALES, LOCALE_LABELS } from '@/lib/i18n';

export default function Header() {
  const { user, profile, loading } = useAuth();
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);

  const NAV_LINKS = [
    { href: '/', label: t('nav_recommend') },
    { href: '/combos', label: t('nav_combos') },
    { href: '/board', label: t('nav_board') },
  ];

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
    <header className="border-b border-slate-800/80 bg-nikke-bg/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-lg shrink-0 group">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            className="text-nikke-accent transition-transform group-hover:rotate-12"
          >
            <path
              d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z"
              fill="currentColor"
            />
          </svg>
          <span>
            <span className="text-nikke-accent">니케</span> {t('site_name_suffix')}
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2 text-sm text-slate-300">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  active ? 'text-nikke-accent bg-nikke-accent/10' : 'hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          <div className="flex items-center gap-0.5 ml-1 pl-2 border-l border-slate-800 text-xs">
            {LOCALES.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                title={LOCALE_LABELS[l]}
                className={`px-1.5 py-1 rounded transition-colors ${
                  lang === l ? 'text-nikke-accent bg-nikke-accent/10 font-semibold' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {loading ? null : user ? (
            <div className="flex items-center gap-2 ml-1 pl-2 border-l border-slate-800">
              <span className="text-xs text-slate-400 hidden sm:inline">
                {profile?.nickname || user.email}
              </span>
              <button
                onClick={logout}
                className="px-2.5 py-1 rounded border border-slate-700 hover:border-rose-400 text-xs transition-colors"
              >
                {t('logout')}
              </button>
            </div>
          ) : (
            <div className="relative ml-1">
              <button
                onClick={() => setOpen((v) => !v)}
                className="px-3 py-1.5 rounded-md bg-nikke-accent text-slate-900 font-semibold text-xs hover:brightness-110 transition"
              >
                {t('login')}
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
                  {sent ? (
                    <p className="text-xs text-emerald-300">{t('login_sent')}</p>
                  ) : (
                    <form onSubmit={sendLink} className="flex flex-col gap-2">
                      <input
                        type="email"
                        required
                        placeholder={t('login_email_placeholder')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs outline-none focus:border-nikke-accent"
                      />
                      <button
                        type="submit"
                        className="bg-nikke-accent text-slate-900 rounded py-1.5 text-xs font-semibold"
                      >
                        {t('login_send_link')}
                      </button>
                      <p className="text-[10px] text-slate-500">{t('login_password_note')}</p>
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
