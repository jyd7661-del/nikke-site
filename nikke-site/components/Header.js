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
  const [open, setOpen] = useState(false);

  const NAV_LINKS = [
    { href: '/', label: t('nav_recommend') },
    { href: '/nikke', label: t('nav_dex') },
    { href: '/combos', label: t('nav_combos') },
    { href: '/board', label: t('nav_board') },
  ];

  // 구글 로그인 (2026-08-09 도입).
  //
  // 왜 바꿨나: 기존 매직링크(signInWithOtp)는 **로그인할 때마다 이메일을 한 통씩** 태운다.
  // Supabase 내장 메일은 시간당 2통이 한도이고 그 한도가 **프로젝트 전체 공유**라,
  // 공개하면 하루 몇 명만 로그인해도 나머지는 아예 로그인을 못 한다(실제로 막혀봄, §7 참고).
  // OAuth는 이메일을 0통 쓰고, 사용자 입장에서도 메일함을 오갈 필요가 없어 마찰이 훨씬 낮다.
  //
  // 기존 계정은 그대로 이어진다: 이 프로젝트의 기존 사용자는 email_confirmed 상태이고
  // 구글이 돌려주는 이메일도 검증된 값이라, 같은 주소면 Supabase가 같은 user_id에
  // 구글 신원을 붙인다(보유 니케·게시글·운영자 권한 유지).
  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      alert(t('supabase_not_configured'));
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) alert(error.message);
  };

  // 매직링크(signInWithOtp) 로그인은 2026-08-09에 **없앴습니다.**
  // 남겨두면 안 되는 이유가 분명했습니다: Supabase 내장 메일은 시간당 2통이 한도인데
  // 그 한도가 프로젝트 전체 공유라, 오픈 후 몇 명만 눌러도 나머지는 로그인이 막힙니다.
  // "가끔 되는 로그인 버튼"은 아예 없는 것보다 나쁩니다.
  // 다시 살리려면 외부 SMTP(SendGrid 등)를 먼저 붙여야 합니다.

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
            <span className="text-nikke-accent">{t('site_name_brand')}</span> {t('site_name_suffix')}
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
                  <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={signInWithGoogle}
                        className="flex items-center justify-center gap-2 bg-white text-slate-800 rounded py-2 text-xs font-semibold hover:brightness-95 transition"
                      >
                        <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
                          <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.4 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.8" />
                          <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.900l-.4.03-6.8 5.2-.1.4C7.8 40.9 15.3 46 24 46" />
                          <path fill="#FBBC05" d="M11.5 27.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l0-.5-6.9-5.3-.2.1C2.8 15.6 2 19.2 2 23s.8 7.4 2.4 10.3z" />
                          <path fill="#EA4335" d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.4 29.9 1 24 1 15.3 1 7.8 6.1 4.4 13.7l7.1 5.5C13.3 13.3 18.2 9.5 24 9.5" />
                        </svg>
                        {t('login_google')}
                      </button>
                      <p className="text-[10px] text-slate-500">
                        {t('login_google_note')}
                      </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
