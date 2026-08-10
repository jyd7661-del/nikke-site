import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { LOCALES } from '@/lib/i18n';
import { protectText, restoreText, ambiguousHints, glossaryVersion } from '@/lib/glossary';

// =============================================================================
// 커뮤니티 글 번역 API (2026-08-09)
//
// 한국어로 쓴 글을 일본어 설정 사용자가 일본어로 읽게 한다. 글을 쓰거나 고칠 때 호출하면
// 나머지 두 언어로 번역해 content_translations 에 저장한다.
//
// 핵심 원칙: **AI는 이름을 건드리지 않는다.**
// 번역 전에 아는 이름·용어를 토큰(⟦0⟧)으로 빼내고, 번역 뒤 대상 언어 표기로 되돌린다
// (lib/glossary.js). 토큰이 하나라도 사라지거나 없는 번호가 생기면 그 번역은 **버린다.**
// 이름이 틀린 번역을 저장하느니 원문을 그대로 보여주는 편이 낫다.
//
// 설계상 지킨 것 세 가지:
//   1) 본문을 클라이언트에서 받지 않는다. entityId 만 받고 서버가 DB에서 다시 읽는다.
//      본문을 받으면 남의 글 자리에 아무 내용이나 번역본으로 심을 수 있다.
//   2) 원문이 그대로면 AI를 부르지 않는다(src_hash). 안 그러면 같은 글에 번역을 반복
//      요청하는 것만으로 비용을 태울 수 있다.
//   3) 로그인한 사용자만 부를 수 있다. 익명 호출로 예산을 소진시키는 걸 막는다.
// =============================================================================

const MODEL = 'claude-haiku-4-5';
const DAILY_LIMIT = Number(process.env.TRANSLATE_DAILY_LIMIT || 2000);
// 너무 긴 글은 자른다. 게시판 글이 이보다 길 일은 드물고, 상한이 없으면 한 건이 예산을 다 쓴다.
const MAX_CHARS = 4000;

const ENTITY = {
  post: { table: 'posts', fields: ['title', 'content'] },
  comment: { table: 'comments', fields: ['content'] },
  combo: { table: 'user_combos', fields: ['name', 'purpose', 'description'] },
};

const json = (body, status = 200) => Response.json(body, { status });

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // 공개 키로 되돌아가지 않는다. 되돌아가면 content_translations 쓰기가 막혀 있어
  // 어차피 실패하고, 그 실패가 조용히 묻힌다(HANDOFF §2-3).
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function callerUserId(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const c = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await c.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

// 일일 총 상한. 조회 실패 시에는 열어둔다 — Supabase가 잠깐 흔들렸다고 번역이 통째로 멈추는 건
// 과하다. 다만 조용히 넘어가면 보호가 사라진 걸 아무도 모르므로 눈에 띄는 태그로 로그를 남긴다.
async function overDailyLimit(sb) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from('translate_daily_budget').select('count').eq('usage_date', today).maybeSingle();
  if (error) {
    console.error('[TRANSLATE_BUDGET] 상한 조회 실패 — 보호가 걸리지 않은 채로 진행합니다', error);
    return false;
  }
  return (data?.count || 0) >= DAILY_LIMIT;
}

async function bumpDailyUsage(sb) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from('translate_daily_budget').select('count').eq('usage_date', today).maybeSingle();
  const { error } = data
    ? await sb.from('translate_daily_budget').update({ count: data.count + 1 }).eq('usage_date', today)
    : await sb.from('translate_daily_budget').insert({ usage_date: today, count: 1 });
  if (error) console.error('[TRANSLATE_BUDGET] 사용량 증가 실패 — 카운터가 실제보다 낮습니다', error);
}

const SYSTEM = `You translate posts from a Korean game community site for the mobile game NIKKE.

CRITICAL RULES about the placeholder tokens:
- The text contains tokens shaped like ⟦0⟧, ⟦1⟧, ⟦2⟧.
- Each token stands for a proper noun (a character name or a game term).
- Reproduce every token EXACTLY as it appears. Never translate, renumber, reorder into a different meaning, split, or drop a token.
- The set of tokens in your output must be exactly the set in the input — same numbers, same count.
- Grammar particles around a token (Korean 은/는/이/가, Japanese は/が/を) SHOULD be translated normally.

Other rules:
- Keep the register casual and conversational, the way game community posts are written.
- Do not add commentary, greetings, or explanations. Translate only.
- Preserve line breaks.
- If a field is empty, return an empty string for it.

Reply with JSON only, no markdown fences.`;

function buildUserPrompt({ sourceLang, targets, maskedFields, hintsByLang }) {
  const langName = { ko: 'Korean', en: 'English', ja: 'Japanese' };
  const lines = [
    `Source language: ${langName[sourceLang]}`,
    `Translate into: ${targets.map((l) => langName[l]).join(', ')}`,
    '',
    'Fields to translate (JSON):',
    JSON.stringify(maskedFields, null, 2),
    '',
  ];
  for (const lang of targets) {
    const hints = hintsByLang[lang] || [];
    if (!hints.length) continue;
    // 치환하지 못한(일상 낱말과 겹치는) 이름들. 문맥상 게임 캐릭터·용어를 가리킬 때만
    // 아래 표기를 쓰고, 평범한 낱말로 쓰였으면 평범하게 번역하라고 맡긴다.
    lines.push(
      `Glossary for ${langName[lang]} — these source words are ALSO ordinary words.`,
      `Use the official spelling ONLY when the context means the NIKKE character or game term:`
    );
    for (const h of hints) lines.push(`  ${h.from} → ${h.to}  (${h.kind})`);
    lines.push('');
  }
  lines.push(
    'Return exactly this shape:',
    JSON.stringify(
      Object.fromEntries(targets.map((l) => [l, Object.fromEntries(Object.keys(maskedFields).map((f) => [f, '...']))])),
      null, 2
    )
  );
  return lines.join('\n');
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const { entityType, entityId } = body || {};
  const spec = ENTITY[entityType];
  if (!spec || typeof entityId !== 'string' || !entityId) {
    return json({ error: 'entityType/entityId가 올바르지 않습니다.' }, 400);
  }

  const sb = serviceClient();
  if (!sb) {
    console.error('[TRANSLATE] SUPABASE_SERVICE_ROLE_KEY가 없습니다 — 번역을 저장할 수 없습니다.');
    return json({ error: '번역 기능이 아직 설정되지 않았습니다.' }, 503);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[TRANSLATE] ANTHROPIC_API_KEY가 없습니다.');
    return json({ error: '번역 기능이 아직 설정되지 않았습니다.' }, 503);
  }

  const userId = await callerUserId(req);
  if (!userId) return json({ error: '로그인이 필요합니다.' }, 401);

  // 본문은 클라이언트를 믿지 않고 DB에서 다시 읽는다.
  const { data: row, error: rowErr } = await sb
    .from(spec.table).select(['id', 'user_id', 'source_lang', ...spec.fields].join(',')).eq('id', entityId).maybeSingle();
  if (rowErr) return json({ error: '원문을 읽지 못했습니다.' }, 500);
  if (!row) return json({ error: '원문을 찾을 수 없습니다.' }, 404);
  if (row.user_id !== userId) return json({ error: '본인 글만 번역할 수 있습니다.' }, 403);

  const sourceLang = LOCALES.includes(row.source_lang) ? row.source_lang : 'ko';
  const targets = LOCALES.filter((l) => l !== sourceLang);

  const source = {};
  for (const f of spec.fields) {
    const v = row[f];
    if (typeof v === 'string' && v.trim()) source[f] = v.slice(0, MAX_CHARS);
  }
  if (!Object.keys(source).length) return json({ ok: true, skipped: 'empty' });

  const gver = glossaryVersion();
  const srcHash = crypto.createHash('sha256')
    .update(JSON.stringify({ source, sourceLang, gver })).digest('hex').slice(0, 32);

  // 이미 같은 원문·같은 용어집으로 번역해 둔 언어는 건너뛴다. AI 호출이 0이 된다.
  const { data: existing } = await sb
    .from('content_translations').select('lang, src_hash, status')
    .eq('entity_type', entityType).eq('entity_id', entityId);
  const done = new Set((existing || []).filter((r) => r.src_hash === srcHash && r.status === 'done').map((r) => r.lang));
  const todo = targets.filter((l) => !done.has(l));
  if (!todo.length) return json({ ok: true, cached: true, langs: [...done] });

  if (await overDailyLimit(sb)) {
    // 실패로 기록하지 않는다 — 원문이 잘못된 게 아니라 오늘 예산이 없을 뿐이고,
    // failed 로 남기면 나중에 재시도 대상에서 빠진다.
    return json({ ok: false, budgetExhausted: true }, 200);
  }

  // 이름·용어를 토큰으로 빼낸다.
  const maskedFields = {};
  const usedByField = {};
  // 어떤 낱말이 이름으로 치환됐는지 기록해 둔다. 번역 결과가 이상할 때 원인을 바로
  // 짚기 위한 것이다 — 없으면 번역문만 보고 216개 표기와 사람이 대조해야 한다.
  const protectedTerms = new Map();
  for (const [f, v] of Object.entries(source)) {
    const { masked, used } = protectText(v, sourceLang);
    maskedFields[f] = masked;
    usedByField[f] = used;
    for (const e of used) protectedTerms.set(`${e.id}|${e[sourceLang]}`, { id: e.id, form: e[sourceLang] });
  }
  const protectedList = [...protectedTerms.values()];
  const wholeText = Object.values(source).join('\n');
  const hintsByLang = Object.fromEntries(todo.map((l) => [l, ambiguousHints(wholeText, sourceLang, l)]));

  let parsed;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserPrompt({ sourceLang, targets: todo, maskedFields, hintsByLang }) }],
    });
    const raw = (msg.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  } catch (e) {
    console.error('[TRANSLATE] 번역 호출 실패', e);
    return json({ error: '번역에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 502);
  }
  await bumpDailyUsage(sb);

  const rows = [];
  const rejected = [];
  for (const lang of todo) {
    const out = parsed?.[lang];
    if (!out || typeof out !== 'object') { rejected.push({ lang, why: 'no output' }); continue; }
    const fields = {};
    let broken = null;
    for (const f of Object.keys(source)) {
      const r = restoreText(out[f] ?? '', usedByField[f], lang);
      // ⚠️ 여기가 "이름이 완벽해야 한다"를 실제로 보장하는 지점이다.
      // 토큰이 사라졌거나 없는 번호가 생겼다면 AI가 이름을 건드린 것이므로 채택하지 않는다.
      if (!r.ok) { broken = `${f}: missing=${r.missing.join(',')} leftover=${r.leftover.join(',')}`; break; }
      fields[f] = r.text;
    }
    if (broken) { rejected.push({ lang, why: broken }); continue; }
    rows.push({
      entity_type: entityType, entity_id: entityId, lang,
      fields, source_lang: sourceLang, status: 'done',
      engine: MODEL, glossary_ver: gver, src_hash: srcHash, note: null,
      protected: protectedList,
      updated_at: new Date().toISOString(),
    });
  }

  // 토큰이 깨진 언어는 저장하지 않되, 흔적은 남긴다. 그래야 나중에 재시도 대상으로 찾을 수 있고
  // "왜 이 글만 번역이 안 되지"를 추적할 수 있다.
  for (const r of rejected) {
    rows.push({
      entity_type: entityType, entity_id: entityId, lang: r.lang,
      fields: {}, source_lang: sourceLang, status: 'failed',
      engine: MODEL, glossary_ver: gver, src_hash: srcHash,
      protected: protectedList,
      note: `토큰 검증 실패 — ${r.why}`, updated_at: new Date().toISOString(),
    });
    console.error(`[TRANSLATE] 토큰 검증 실패로 번역을 버렸습니다 (${entityType}/${entityId}/${r.lang}) ${r.why}`);
  }

  const { error: upErr } = await sb
    .from('content_translations').upsert(rows, { onConflict: 'entity_type,entity_id,lang' });
  if (upErr) {
    console.error('[TRANSLATE] 저장 실패', upErr);
    return json({ error: '번역본 저장에 실패했습니다.' }, 500);
  }

  return json({
    ok: true,
    translated: rows.filter((r) => r.status === 'done').map((r) => r.lang),
    failed: rejected.map((r) => r.lang),
  });
}
