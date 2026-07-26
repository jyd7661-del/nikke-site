'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 환경변수(.env.local)가 설정되지 않은 상태에서도 앱이 죽지 않도록 null로 둡니다.
// 로그인/저장/게시판 기능을 쓰려면 .env.local.example을 참고해 값을 채워주세요.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const isSupabaseConfigured = Boolean(supabase);
