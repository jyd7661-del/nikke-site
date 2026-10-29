'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fetchProfile } from '@/lib/roster';
import { takeLoginReturn } from '@/lib/login';

const AuthContext = createContext({ user: null, profile: null, loading: true, refreshProfile: () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (u) => {
    if (!u) {
      setProfile(null);
      return;
    }
    const p = await fetchProfile(u.id);
    setProfile(p);
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      loadProfile(u).finally(() => setLoading(false));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      // 구글 로그인에서 돌아오면 첫 화면에 떨어진다 — 로그인을 누른 페이지로 다시 보낸다(lib/login.js).
      // INITIAL_SESSION도 본다: auth-js는 URL에서 받은 세션의 SIGNED_IN을 setTimeout으로 쏘는데, 이 구독이 그보다 늦게 걸리면
      // SIGNED_IN은 못 받고 세션이 든 INITIAL_SESSION만 온다. 돌아갈 경로는 로그인 버튼을 누른 직후에만 있어 평소 새로고침엔 안 걸린다.
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && u) {
        const back = takeLoginReturn();
        if (back && back !== window.location.pathname + window.location.search) {
          window.location.replace(back);
          return;
        }
      }
      setUser(u);
      loadProfile(u);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile: () => loadProfile(user) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
