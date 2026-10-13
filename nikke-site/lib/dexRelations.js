// 도감 상세의 "대신 쓸 수 있는 니케" · "함께 쓰면 좋은 니케" · "스킬로 이어지는 니케" (2026-10-11)
//
// 유저: "정보를 얻는 사람에게 유용한 정보면 괜찮은데" — 도감에 오는 사람이 묻는 것: 이 니케 대신 누구를 쓰나, 누구와 같이 쓰나.
// 이 파일은 **서버 전용**이다(characterDatabase.json·synergyNotes.json을 읽는다 — 클라이언트가 import하면 번들에 약 700KB가 실린다).
// 화면 컴포넌트(components/DexRelations.js)에는 계산 결과(순수 데이터)만 넘긴다.
//
// ⚠️ 여기서 새 판정·점수를 만들지 않는다(도감 원칙). 전부 데이터에서 그대로 따라 나오는 사실이다:
//   대신 쓸 니케   — 같은 버스트 단계·같은 클래스 중 그 모드 prydwen 티어가 더 높은 니케(티어 값 그대로)
//   함께 쓸 니케   — 랭커 실사용 조합(lib/usage.js partners — 같은 5인 안에 같이 나온 횟수)과 prydwen 추천 조합에서 같은 팀에 든 횟수
//                    유저 예시(10-11): 민트 ↔ 프리카, 마스트 : 로망틱 메이드 ↔ 크라운·앵커, 홍련 : 흑영 ↔ 리버렐리오 — scripts/testDexRelations.mjs가 지킨다
//   스킬 연결      — 스킬 원문의 조건부 아군 대상절("Affects all Water Code allies" 등, lib/buffTargets.js와 같은 해석)
//                    2026-10-13: 버스트 단계 대상절도 읽는다 — 리버렐리오 "공격력이 가장 낮은 3버스트 아군 1명에게 차지 속도 ▲" → 3버스트 차지 무기(RL·SR),
//                    홍련 : 흑영이 여기서 이어진다(유저: "그래야 홍련흑영과의 조합이 설명되니까")
import db from '@/data/characterDatabase.json';
import syn from '@/data/synergyNotes.json';
import { usageFor } from '@/lib/usage';
import { scopeOf, resolveAllyScope, scopeCondition, isBuffReceiver } from '@/lib/buffTargets';

const CHARACTERS = Array.isArray(db) ? db : db.characters;
const BY_TITLE = new Map(CHARACTERS.map((c) => [c.title, c]));
const TIER_RANK = { SSS: 9, SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };
const MODES = [['campaign', 'story'], ['bossing', 'bossing'], ['pvp', 'pvp']];

const slim = (c) => ({ id: c.id, title: c.title, name_kr: c.name_kr, name_ja: c.name_ja || null });
const stagesOf = (c) => (c.burstFlex && Array.isArray(c.burstStages) && c.burstStages.length ? c.burstStages.map(String) : [String(c.burst)]);
const bestTier = (c) => Math.max(0, ...Object.values(c.tiers || {}).map((t) => TIER_RANK[t] || 0));

// 모드마다 최대 3명. 이 니케의 그 모드 티어가 없으면 그 모드는 건너뛴다(비교 기준이 없다).
// higher가 비면 "같은 역할 중 이 모드 최상위"라는 사실 자체가 정보다 — 화면이 그 문장을 낸다.
export function alternativesFor(c, limit = 3) {
  const mine = stagesOf(c);
  return MODES.map(([mode, key]) => {
    const myTier = c.tiers?.[key];
    if (!TIER_RANK[myTier]) return null;
    const higher = CHARACTERS
      .filter((x) => x.id !== c.id && x.class === c.class && stagesOf(x).some((b) => mine.includes(b)) && (TIER_RANK[x.tiers?.[key]] || 0) > TIER_RANK[myTier])
      .sort((a, b) => (TIER_RANK[b.tiers[key]] - TIER_RANK[a.tiers[key]]) || String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')) || a.title.localeCompare(b.title))
      .slice(0, limit)
      .map((x) => ({ ...slim(x), tier: x.tiers[key] }));
    return { mode, tier: myTier, higher };
  }).filter(Boolean);
}

// 함께 쓸 니케 — 랭커 실사용 조합에서 같이 나온 횟수(그 니케가 든 조합 수 중) → prydwen 추천 조합에서 같은 팀 수 순.
export function companionsFor(c, limit = 6) {
  const u = usageFor(c.title);
  const rankerTeams = u?.counts?.all || 0;
  const ranker = new Map((u?.partners || []).map((p) => [p.title, p.count]));
  const archetypes = (syn.archetypes || []).filter((a) => (a.members || []).includes(c.title));
  const arch = new Map();
  archetypes.forEach((a) => (a.members || []).forEach((m) => { if (m !== c.title) arch.set(m, (arch.get(m) || 0) + 1); }));
  return {
    rankerTeams,
    archetypeTeams: archetypes.length,
    list: [...new Set([...ranker.keys(), ...arch.keys()])]
      .filter((t) => BY_TITLE.has(t))
      .sort((a, b) => ((ranker.get(b) || 0) - (ranker.get(a) || 0)) || ((arch.get(b) || 0) - (arch.get(a) || 0)) || a.localeCompare(b))
      .slice(0, limit)
      .map((t) => ({ ...slim(BY_TITLE.get(t)), ranker: ranker.get(t) || 0, archetype: arch.get(t) || 0 })),
  };
}

// 스킬 원문의 조건부 아군 대상절 — [{ skill: {name,name_kr,name_ja}, cond: {element,weapon,squad} }]
function conditionalScopes(c) {
  const out = [];
  (c.skills || []).forEach((s) => {
    const clauses = String(s.desc || '').split(/(?<=\.)\s+/).map((x) => x.trim());
    clauses.forEach((clause, i) => {
      const sc = scopeOf(clause);
      if (sc === null || resolveAllyScope(sc, c, []) === null) return;
      const effect = clauses[i + 1] || '';   // 효과절 — 차지 속도만 거는 절은 차지 무기에게만 든다(리버렐리오)
      const cond = scopeCondition(sc, effect);
      const key = `${cond.element}|${cond.weapon}|${cond.squad}|${cond.burst}|${cond.charge}`;
      if (!out.some((o) => o.key === key)) out.push({ key, scope: sc, effect, cond, skill: { name: s.name, name_kr: s.name_kr || null, name_ja: s.name_ja || null } });
    });
  });
  return out;
}

// gives: 이 니케의 조건부 버프가 닿는 니케(조건마다 4명 + 전체 수)
// receives: 조건부 버프로 이 니케를 대상에 넣는 니케(6명) — 둘 다 togetherOrder 순
// 받는 쪽은 엔진과 같은 기준(isBuffReceiver — 공격형 또는 3버스트)으로만 센다: 공격 버프가 지원형·1/2버스트 방어형에게 닿는 건 빈 것과 같다
// (처음엔 안 걸러서 마스트 : 로망틱 메이드(지원형) 페이지에 "수냉 아군 공격 버프를 주는 니케"가 나왔다). 받는 쪽이 아니면 receives는 비운다.
// 2026-10-13: 순서는 **함께 쓰인 횟수(랭커 조합 → prydwen 추천 조합) → 티어**. 티어만 보면 대상이 많은 절(리버렐리오 3버스트 차지 무기 28명)에서
// 실제 짝(홍련 : 흑영)이 상위 4명 밖으로 밀린다. 세는 값은 companionsFor와 같은 출처다(새 판정 아님).
function togetherOrder(c) {
  const ranker = new Map((usageFor(c.title)?.partners || []).map((p) => [p.title, p.count]));
  const arch = new Map();
  (syn.archetypes || []).filter((a) => (a.members || []).includes(c.title))
    .forEach((a) => (a.members || []).forEach((m) => { if (m !== c.title) arch.set(m, (arch.get(m) || 0) + 1); }));
  return (a, b) => ((ranker.get(b.title) || 0) - (ranker.get(a.title) || 0)) || ((arch.get(b.title) || 0) - (arch.get(a.title) || 0))
    || bestTier(b) - bestTier(a) || a.title.localeCompare(b.title);
}

export function skillLinksFor(c) {
  const order = togetherOrder(c);
  const gives = conditionalScopes(c).map((g) => {
    const targets = (resolveAllyScope(g.scope, c, CHARACTERS, g.effect) || []).filter((x) => x.id !== c.id && isBuffReceiver(x));
    return {
      skill: g.skill, cond: g.cond, squad: g.cond.squad ? (c.squad || null) : null, total: targets.length,
      top: targets.sort(order).slice(0, 4).map(slim),
    };
  }).filter((g) => g.total > 0);
  const receives = [];
  if (isBuffReceiver(c)) CHARACTERS.forEach((x) => {
    if (x.id === c.id) return;
    const hit = conditionalScopes(x).find((g) => (resolveAllyScope(g.scope, x, [c], g.effect) || []).length > 0);
    if (hit) receives.push({ ...x, skill: hit.skill, cond: hit.cond, squad: hit.cond.squad ? (x.squad || null) : null });
  });
  receives.sort(order);
  return { gives, receivesTotal: receives.length, receives: receives.slice(0, 6).map((r) => ({ ...slim(r), skill: r.skill, cond: r.cond, squad: r.squad })) };
}
