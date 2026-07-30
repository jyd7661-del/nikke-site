import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const runtime = 'nodejs';

// 하루 IP당 무료 사용 횟수. 트래픽/비용 상황을 보며 나중에 조정하세요.
const DAILY_LIMIT = 8;
const MODEL = 'claude-sonnet-5'; // 2026-07-31: 미사용 레거시 엔드포인트지만 일관성을 위해 sonnet으로 통일 (실제 추천은 app/api/ai-recommend가 처리, 이미 sonnet)

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip) {
  // 원본 IP를 저장하지 않고 해시만 저장해 개인 식별 정보를 남기지 않습니다.
  return crypto.createHash('sha256').update(ip).digest('hex');
}

async function checkAndIncrementRateLimit(supabase, ipHash) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing, error: selectError } = await supabase
    .from('ai_explain_usage')
    .select('count')
    .eq('ip_hash', ipHash)
    .eq('usage_date', today)
    .maybeSingle();

  if (selectError) {
    console.error('rate limit select error', selectError);
    return true; // 레이트리밋 조회 자체가 실패하면(테이블 미생성 등) 기능은 막지 않음
  }

  if (existing) {
    if (existing.count >= DAILY_LIMIT) return false;
    await supabase
      .from('ai_explain_usage')
      .update({ count: existing.count + 1 })
      .eq('ip_hash', ipHash)
      .eq('usage_date', today);
  } else {
    await supabase.from('ai_explain_usage').insert({ ip_hash: ipHash, usage_date: today, count: 1 });
  }
  return true;
}

const MODE_LABEL = { campaign: '캠페인', bossing: '보스전', pvp: 'PvP' };

function buildTeamsText(teams) {
  return teams
    .slice(0, 3)
    .map((t, i) => {
      const membersText = (t.members || [])
        .map((m) => `${m.name_kr}(${m.title}, 버스트${m.burst})`)
        .join(', ');
      const reasonsText = (t.reasons || []).map((r) => `- ${r}`).join('\n');
      return `[조합 ${i + 1}] 포메이션 ${t.formation}, 엔진 점수 ${t.totalScore}\n구성원: ${membersText}\n엔진이 계산한 근거:\n${reasonsText}`;
    })
    .join('\n\n');
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { teams, mode, bossElement } = body || {};
  if (!Array.isArray(teams) || teams.length === 0) {
    return Response.json({ error: '분석할 조합 정보가 없습니다. 먼저 조합 추천을 받아주세요.' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'AI 설명 기능이 아직 설정되지 않았습니다. (관리자: Vercel 환경변수에 ANTHROPIC_API_KEY 추가 필요)' },
      { status: 503 }
    );
  }

  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      const ipHash = hashIp(getClientIp(req));
      const ok = await checkAndIncrementRateLimit(supabase, ipHash);
      if (!ok) {
        return Response.json(
          { error: `오늘 사용 가능한 AI 설명 횟수(${DAILY_LIMIT}회)를 모두 사용했습니다. 내일 다시 시도해주세요.` },
          { status: 429 }
        );
      }
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const modeLabel = MODE_LABEL[mode] || mode || '캠페인';
    const teamsText = buildTeamsText(teams);

    const system = `당신은 모바일 게임 '승리의 여신: 니케'의 조합 추천을 돕는 도우미입니다.
아래에는 규칙 기반 엔진이 사용자의 보유 캐릭터로부터 이미 계산해 낸 상위 조합 후보와, 각 조합이 왜 그 점수를 받았는지의 근거 목록이 주어집니다.
반드시 이 데이터에 있는 캐릭터와 근거만 사용해서 설명하세요. 목록에 없는 캐릭터, 시너지, 새로운 조합을 지어내지 마세요.
당신의 역할은 새 조합을 만드는 것이 아니라, 주어진 후보들을 비교해서 어떤 상황에 어떤 조합이 더 나은지와 그 이유를 사람이 이해하기 쉬운 자연스러운 한국어로 설명하는 것입니다.
근거가 부족해서 확신할 수 없는 부분은 추측하지 말고 솔직하게 표현하세요.
답변은 250~400자 내외로 간결하게 작성하세요.`;

    const userContent = `모드: ${modeLabel}${bossElement ? ` (보스 약점 속성: ${bossElement})` : ''}

${teamsText}

위 후보들을 비교해서 어떤 조합을 우선 추천하는지와 그 이유를 설명해주세요.`;

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = msg.content?.find((c) => c.type === 'text')?.text || '';
    return Response.json({ explanation: text, model: MODEL });
  } catch (err) {
    console.error('ai-explain error', err);
    return Response.json({ error: 'AI 설명을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
