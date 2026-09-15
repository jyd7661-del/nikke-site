// AI가 구성한 5인을 엔진 규칙으로 검산한다 (2026-09-15, docs/ai-teams-plan.md §1·§7-3).
// 운영(route.js)과 실험(experimentThinRoster.mjs)이 같은 판정을 쓴다 — 실험에서 "규칙 위반 0"이었다는
// 말이 운영에서도 같은 뜻이려면 판정 코드가 하나여야 한다.
//
// 검산은 **규칙 위반만** 본다. 시뮬레이터 점수로 AI 답을 고르지 않는다(판정과 동전 수준임이 실측됨 — 씨앗 1·2).
// 확장자를 붙인다 — 실험 스크립트가 node로 직접 import한다(webpack도 명시 확장자를 그대로 받는다).
import { burstValid, towerEligible } from './aiTeamPrompt.js';

// members: AI가 답한 title 5개. rosterChars: 보유 캐릭터(characterDatabase 항목) 배열. tower: 기업 타워 또는 null.
// 반환: { ok, flaws: string[], resolved: 캐릭터 객체 배열 }. flaws는 재요청 프롬프트에 그대로 붙일 수 있는 영문 한 줄들.
export function verifyAiTeam(members, rosterChars, { tower = null } = {}) {
  const byTitle = new Map(rosterChars.map((c) => [c.title, c]));
  const flaws = [];
  const list = Array.isArray(members) ? members : [];
  if (list.length !== 5) flaws.push(`Exactly 5 members are required (got ${list.length}).`);
  const unknown = list.filter((t) => !byTitle.has(t));
  if (unknown.length) flaws.push(`Not in the roster (use exact title strings from the roster): ${unknown.join(', ')}.`);
  const resolved = list.map((t) => byTitle.get(t)).filter(Boolean);
  if (new Set(resolved.map((c) => c.id)).size !== resolved.length) flaws.push('Members must be 5 distinct characters.');
  if (resolved.length === 5 && !burstValid(resolved)) flaws.push('Burst I, II and III must each be covered by a different member.');
  if (tower) {
    const bad = resolved.filter((c) => !towerEligible(c, tower));
    if (bad.length) flaws.push(`Not allowed to enter this tower (${tower}): ${bad.map((c) => c.title).join(', ')}.`);
  }
  return { ok: flaws.length === 0, flaws, resolved };
}
