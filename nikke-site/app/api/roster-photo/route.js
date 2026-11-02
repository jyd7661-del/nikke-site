import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { CHARACTERS } from '@/data/characters';
import characterDatabase from '@/data/characterDatabase.json';
import { LOCALES } from '@/lib/i18n';
import {
  candidateLines, buildRosterObservePrompt, matchObserved, rosterPhotoRequest, parseRosterPhoto,
  mergeScanCards, altNamesFromCdb, ROSTER_PHOTO_MODEL,
} from '@/lib/rosterPhotoPrompt';

// =============================================================================
// 사진으로 보유 니케 넣기 — 베타 (2026-11-02)
//
// 게임 「니케」 목록 캡처 한 장을 받아 하이쿠 5.5가 읽고, 화면 id 목록으로 돌려준다.
// 배당달력 import-holdings와 같은 방식이다: 사진 한 장 = 요청 한 번(Vercel 본문 4.5MB 제한), 조각은 동시에.
//   세로 캡처 → 조각 1개. 가로 캡처 → 화면(lib/rosterPhotoImage.js)이 세로 띠 3개로 잘라 보낸다
//   (그대로 보내면 API가 1.15MP로 줄여 글자가 뭉개진다 — 11-02 시험).
// 11-02 시험: 세로 10장 카드 110장 중 107장(+조각 다시 찾기 109), 애장품 오표시 0, 장당 약 3원 · 가로 장당 약 11원.
//
// 개선 고리(유저 지시 11-02 "올린 사진과 실제 결과를 비교해서 점점 개선"): 사진·AI 결과를 roster_photo_scans와
// 비공개 버킷 roster-photos에 남기고, 사용자가 확인하고 넣은 목록은 ./confirm이 같은 행에 채운다.
// 비교는 scripts/reviewRosterPhotos.mjs. supabase/roster_photo_migration.sql.
//
// 막는 것: IP당 하루 PHOTO_DAILY_LIMIT장, 사이트 전체 AI 원 단위 천장(AI_DAILY_BUDGET_KRW — ai-recommend와 같은 통).
// =============================================================================

export const runtime = 'nodejs';
export const maxDuration = 60;

const PHOTO_DAILY_LIMIT = Number(process.env.ROSTER_PHOTO_DAILY_LIMIT || 20);
const AI_DAILY_BUDGET_KRW = Number(process.env.AI_DAILY_BUDGET_KRW || 10000);
// 조각 하나의 base64 길이 상한(≈1.9MB 파일). 화면이 긴 변 2400·2.6MP·JPEG 0.8로 맞추면 폰 세로 캡처가 400KB 안팎이다.
const MAX_PART_B64 = 2_600_000;
const MAX_PARTS = 3;
// 하이쿠 5.5 단가(USD/1M) — app/api/ai-recommend/route.js PRICE_USD_PER_M과 같은 값. $1 = 1,400원
const PRICE = { in: 0.1, out: 0.5 };
const costKrw = (u) => Math.round((((u?.input_tokens || 0) * PRICE.in + (u?.output_tokens || 0) * PRICE.out) / 1e6) * 1400 * 100) / 100;

const json = (body, status = 200) => Response.json(body, { status });

const cdbById = new Map(characterDatabase.map((c) => [c.id, c]));
const VALID_IDS = new Set(CHARACTERS.map((c) => c.id));
const ALT_NAMES = altNamesFromCdb(cdbById);
// 한국어 화면이면 한국어 이름만(11-02 시험 조건 그대로 — 영어·일본어 칸을 넣자 메이든을 아이스 로즈로 읽었다),
// 영어·일본어 화면이면 게임도 그 언어일 가능성이 커서 두 이름 칸을 더한다.
// 11-02 오후부터 **아이콘 먼저** 방식: AI는 카드에서 본 것(속성·버스트·이름 글자·하트 + 짐작)만 적고 고르기는 matchObserved.
// 같은 캡처 10장(정답 110명) 비교 — 이전(AI가 바로 id): 확실·맞음 103 · 확실·틀림 1 · 놓침 3 /
// 아이콘 먼저: 확실·맞음 107 · 확실·틀림 0 · 놓침 2. 비용은 10장 30 → 36원.
const PROMPTS = {
  ko: buildRosterObservePrompt(candidateLines(CHARACTERS, cdbById), false),
  alt: buildRosterObservePrompt(candidateLines(CHARACTERS, cdbById, ALT_NAMES), true),
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
const hashIp = (ip) => crypto.createHash('sha256').update(ip).digest('hex');

// 로그인했으면 누가 올렸는지 남긴다(없어도 된다). app/api/translate/route.js callerUserId와 같은 방식.
async function callerUserId(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;
  const c = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await c.auth.getUser();
  return error || !data?.user ? null : data.user.id;
}

const isB64 = (s) => typeof s === 'string' && s.length > 100 && s.length <= MAX_PART_B64 && /^[A-Za-z0-9+/=]+$/.test(s.slice(0, 200));

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const lang = LOCALES.includes(body?.lang) ? body.lang : 'ko';
  const orientation = body?.orientation === 'landscape' ? 'landscape' : 'portrait';
  const parts = Array.isArray(body?.parts) ? body.parts : [];
  if (!parts.length || parts.length > MAX_PARTS || !parts.every(isB64)) return json({ error: 'bad_image' }, 400);
  // 세로는 화면이 photo를 따로 안 보낸다 — 읽은 그 사진을 보관한다
  const photo = isB64(body?.photo) ? body.photo : orientation === 'portrait' ? parts[0] : null;

  const sb = serviceClient();
  if (!sb || !process.env.ANTHROPIC_API_KEY) return json({ error: 'unavailable' }, 503);

  const ipHash = hashIp(getClientIp(req));
  const today = new Date().toISOString().slice(0, 10);
  const userId = await callerUserId(req);
  // 운영자(profiles.is_admin — 게시판 is_board_admin과 같은 표시)는 장수 한도를 받지 않는다(11-02 유저 "난 한도가 없어야할 것 같아" —
  // 같은 캡처로 시험을 되풀이하다 24장째에 걸렸다). 사이트 전체 원 단위 천장은 운영자도 그대로 받는다.
  let isAdmin = false;
  if (userId) {
    const { data: prof } = await sb.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
    isAdmin = !!prof?.is_admin;
  }
  // 한도 조회가 실패하면 **닫는다** — ai-recommend 설명과 달리 이 기능은 꺼져도 손으로 고르면 된다.
  if (!isAdmin) {
    const { count, error: cntErr } = await sb
      .from('roster_photo_scans').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).eq('usage_date', today);
    if (cntErr) { console.error('[ROSTER_PHOTO] 한도 조회 실패', cntErr); return json({ error: 'unavailable' }, 503); }
    if ((count || 0) >= PHOTO_DAILY_LIMIT) return json({ error: 'daily_limit', limit: PHOTO_DAILY_LIMIT }, 429);
  }
  const { data: budget, error: bErr } = await sb.from('ai_daily_budget').select('krw').eq('usage_date', today).maybeSingle();
  if (bErr) { console.error('[ROSTER_PHOTO] 예산 조회 실패', bErr); return json({ error: 'unavailable' }, 503); }
  if (Number(budget?.krw || 0) >= AI_DAILY_BUDGET_KRW) return json({ error: 'budget' }, 503);

  const prompt = lang === 'ko' ? PROMPTS.ko : PROMPTS.alt;
  const altNames = lang === 'ko' ? null : ALT_NAMES;
  const client = new Anthropic();
  const t0 = Date.now();

  const reads = await Promise.all(parts.map(async (data, part) => {
    try {
      const msg = await client.messages.create(rosterPhotoRequest(prompt, { type: 'image/jpeg', data }));
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { usage: msg.usage, parsed: parseRosterPhoto(text), part };
    } catch (e) {
      console.error('[ROSTER_PHOTO] AI 호출 실패', part, e?.status, e?.message);
      return { usage: null, parsed: null, part };
    }
  }));
  const krw = reads.reduce((s, r) => s + costKrw(r.usage), 0);
  if (krw > 0) {
    const { error } = await sb.rpc('add_ai_daily_cost', { p_krw: krw });
    if (error) console.error('[AI_BUDGET] 원 단위 누적 실패 — 지출이 실제보다 낮게 기록됩니다', error);
  }
  if (reads.every((r) => !r.parsed)) return json({ error: 'read_failed' }, 502);

  // AI가 본 것(아이콘·짐작)도 같이 남긴다 — 틀렸을 때 아이콘을 잘못 읽었는지 이름을 잘못 읽었는지 가린다
  const aiCards = reads.flatMap((r) => (r.parsed?.cards || []).map((c) => ({
    ...matchObserved({ ...c, name: String(c.name || '').slice(0, 60) }, CHARACTERS, cdbById, altNames),
    el: String(c.element || '').slice(0, 10), wp: String(c.weapon || '').slice(0, 5), bu: String(c.burst ?? '').slice(0, 3),
    guess: String(c.guess || '').slice(0, 60),
    part: r.part,
  })));
  const { found, unknown } = mergeScanCards(aiCards, VALID_IDS);

  // 사진 보관 — 실패해도 결과는 돌려준다(개선 자료가 한 장 빠질 뿐).
  const scanId = crypto.randomUUID();
  let photoPath = null;
  if (photo) {
    const path = `${today}/${scanId}.jpg`;
    const { error } = await sb.storage.from('roster-photos').upload(path, Buffer.from(photo, 'base64'), { contentType: 'image/jpeg' });
    if (error) console.error('[ROSTER_PHOTO] 사진 보관 실패', error);
    else photoPath = path;
  }
  const { error: insErr } = await sb.from('roster_photo_scans').insert({
    id: scanId, usage_date: today, ip_hash: ipHash, user_id: userId, lang, orientation,
    parts: parts.length, photo_path: photoPath, model: ROSTER_PHOTO_MODEL, krw, ms: Date.now() - t0, ai_cards: aiCards,
  });
  if (insErr) console.error('[ROSTER_PHOTO] 기록 실패', insErr);

  return json({ scanId: insErr ? null : scanId, found, unknown, partial: reads.some((r) => !r.parsed) });
}
