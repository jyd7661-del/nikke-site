// 조건부 아군 버프가 **이 팀에서 시전자 말고 누구에게 닿는가** — D1 판정기 (2026-09-18).
//
// 엔진(lib/synergyEngine.js)과 검사(scripts/testJudgmentMatch.mjs)가 **같은 함수**를 쓴다.
// 검사가 "D1 불일치 8건"이라고 할 때 엔진이 고치는 대상이 정확히 같은 정의여야 한다
// (lib/aiTeamPrompt.js를 실험·운영이 공유하게 한 것과 같은 이유).
//
// ⚠️ 이 파일은 **아무것도 import하지 않는다** — node 스크립트가 그대로 부를 수 있어야 한다.
//
// ■ 무엇을 재는가 (판정이 아니라 사실 확인)
//   스킬 원문의 대상절 "Affects all Electric Code allies." 같은 **조건부 아군 범위**를 읽고,
//   팀에서 그 조건에 맞는 사람을 센다. 시전자 말고 0명이면 그 버프는 이 팀에서 빈다.
//   실제 사례: 아니스:스파클링 서머를 전격 동료 없는 팀에, 누아르·토브를 샷건 동료 없는 팀에.
//   조건 없는 "all allies"는 항상 대상이 있으므로 세지 않는다. 해석 못 하는 절도 세지 않는다
//   (모르는 걸 결함으로 치지 않는다 — 원칙 2).

const lc = (v) => String(v || '').toLowerCase();
// simulateTeams.mjs의 scopeOf와 같은 규칙: "Effect 1:" 같은 번호 접두어를 벗기고 "Affects …"를 읽는다.
const CLAUSE_PREFIX = /^(?:Effect \d+:|Stage \d+:)\s*/i;
export const scopeOf = (clause) => {
  const m = String(clause || '').replace(CLAUSE_PREFIX, '').match(/^Affects\s+(.+?)\.?$/i);
  return m ? m[1] : null;
};

const ELEMENTS = ['fire', 'water', 'wind', 'iron', 'electric'];
// 순서 중요: 'submachine gun'을 'machine gun'보다 먼저 본다(부분 문자열).
// 'rifle'(맨 끝)은 트리나의 "all Electric Code allies with rifles" 용이다. simulateTeams.mjs가 한국어 원문 대조로
// 확정한 대로 소총 = 돌격소총 = ar로 읽는다. 'sniper rifle'·'assault rifle'이 먼저 걸리도록 맨 뒤에 둔다.
const WEAPON_WORDS = [
  ['sniper rifle', 'sr'], ['rocket launcher', 'rl'], ['submachine gun', 'smg'],
  ['assault rifle', 'ar'], ['machine gun', 'mg'], ['shotgun-wielding', 'sg'], ['shotgun', 'sg'], ['rifle', 'ar'],
];

// 대상절 → 팀에서 그 버프를 받는 멤버(시전자 포함). 조건부 아군 범위가 아니거나 해석 못 하면 null.
export function resolveAllyScope(scope, caster, team) {
  const s = lc(scope);
  if (!/all\b/.test(s) || /enem/.test(s)) return null;
  const el = ELEMENTS.find((e) => new RegExp(`all ${e} (code|type) all(y|ies)`).test(s) || new RegExp(`allies with ${e} element`).test(s));
  const wp = WEAPON_WORDS.find(([w]) => s.includes(w));
  const squad = /from the same squad/.test(s);
  if (!el && !wp && !squad) return null;
  let out = team;
  if (el) out = out.filter((m) => lc(m.element) === el);
  if (wp) out = out.filter((m) => lc(m.weapon) === wp[1]);
  if (squad) { if (!caster.squad) return null; out = out.filter((m) => m.squad === caster.squad); }
  return out;
}

// 캐릭터마다 조건부 아군 범위 목록을 한 번만 뽑는다(엔진은 후보 수천 팀에 이걸 부른다).
const scopeCache = new Map();
function conditionalScopes(c) {
  if (scopeCache.has(c.id)) return scopeCache.get(c.id);
  const out = [];
  for (const sk of c.skills || []) {
    for (const clause of String(sk.desc || '').split(/(?<=\.)\s+/)) {
      const sc = scopeOf(clause.trim());
      if (sc === null) continue;
      // 팀 없이도 "조건부인가"는 판단된다 — 빈 팀으로 풀어 null이 아니면 조건부다.
      if (resolveAllyScope(sc, c, []) !== null) out.push(sc.trim());
    }
  }
  const uniq = [...new Set(out)];
  scopeCache.set(c.id, uniq);
  return uniq;
}

// 팀에서 "조건부 아군 버프가 받을 사람 없이 비는" 멤버 목록. [{ title, scopes }]
//
// ■ 2판(2026-09-18) — 1판을 엔진 동점 처리에 넣어 보고 좁혔다.
//   1판은 "시전자 말고 **아무나** 한 명이라도 조건에 맞으면 산 것"이었다. 엔진에 넣으니 바뀐 10건 중
//   **좋아진 4 · 나빠진 4 · 같음 2**로 순효과가 0이었다(probe-data/rejudge-d1v1.json). 나빠진 4건이 한 패턴이었다:
//     · 버프에 "대상을 만들려고" 딜을 안 하는 캐릭터를 끼워 넣었다 — 블랑(아크블랙의 풍압 AR 버프 대상),
//       목단(트리나의 전격 소총 버프 대상), 킬로(아스카의 작열 버프 대상). 셋 다 방어형이다.
//     · 조건부 버프가 곁가지일 뿐인 **공격형**을 뺐다 — 아크레인저 블랙.
//   그래서 두 가지를 좁혔다. 둘 다 스킬 원문·클래스 데이터(A등급)에서 나오는 사실이고 점수가 아니다:
//     ① **공격형 시전자는 세지 않는다.** 공격형의 가치는 본인 딜이고 조건부 버프는 덤이다.
//     ② **대상은 공격형이어야 산 것으로 본다.** 공격 버프가 방어형·지원형에게 닿는 건 빈 것과 같다.
export function buffWithNoTarget(team) {
  const out = [];
  for (const c of team) {
    if (lc(c.class) === 'attacker') continue;                                   // ①
    const dead = conditionalScopes(c).filter((sc) => {
      const t = resolveAllyScope(sc, c, team);
      return t !== null && t.filter((m) => m.id !== c.id && lc(m.class) === 'attacker').length === 0; // ②
    });
    if (dead.length) out.push({ title: c.title, scopes: dead });
  }
  return out;
}

export const deadBuffCount = (team) => buffWithNoTarget(team).length;
