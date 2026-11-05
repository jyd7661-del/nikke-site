// 도감 상세의 "함께 쓰면 좋은 니케" · "스킬로 이어지는 니케" (2026-10-11)
// 2026-11-04 「대신 쓸 수 있는 니케」를 뺐다 — 유저: "그냥 티어로 나눠서 말해주는 것 같고, 무기 특성에 따라서 버프받기 좋아서라던지
//   속성이 같아서 대체가 가능하다는게 아닌 것 같아서 별로 의미 없어보여". 같은 버스트·클래스 중 티어가 높은 니케일 뿐, 대체 근거가 아니었다.
//
// 유저: "정보를 얻는 사람에게 유용한 정보면 괜찮은데" — 도감에 오는 사람이 묻는 것: 이 니케 대신 누구를 쓰나, 누구와 같이 쓰나.
// 이 파일은 **서버 전용**이다(characterDatabase.json·synergyNotes.json을 읽는다 — 클라이언트가 import하면 번들에 약 700KB가 실린다).
// 화면 컴포넌트(components/DexRelations.js)에는 계산 결과(순수 데이터)만 넘긴다.
//
// ⚠️ 여기서 새 판정·점수를 만들지 않는다(도감 원칙). 전부 데이터에서 그대로 따라 나오는 사실이다:
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

const slim = (c) => ({ id: c.id, title: c.title, name_kr: c.name_kr, name_ja: c.name_ja || null });
const bestTier = (c) => Math.max(0, ...Object.values(c.tiers || {}).map((t) => TIER_RANK[t] || 0));

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
  // 아군이 쏜 탄 수로 발동하는 절("Activates each time total ammo consumed by allies reaches 400") — 대상절이 아니라 발동 조건이라
  // 위에서 안 잡힌다(2026-11-05 유저: "팀원 총 탄환별 효과니까 연발이 빠른 총과 같이 쓰면 좋거든" — 리틀 머메이드 · 신데렐라 : 크리스탈 웨이브).
  // 탄을 많이 쓰는 무기 = data/weapons.json 장탄 수 중앙값 MG 300 · SMG 120 · AR 60 · SG 9 · SR/RL 6 → MG·SMG. 연사속도는 데이터에 없다.
  const ammoSkill = (c.skills || []).find((s) => /ammo consumed by allies/i.test(String(s.desc || '')));
  if (ammoSkill) out.push({ key: 'ammo', scope: null, effect: '', cond: { ammo: true }, skill: { name: ammoSkill.name, name_kr: ammoSkill.name_kr || null, name_ja: ammoSkill.name_ja || null } });
  // 아군 전체 버프인데 **효과 종류**가 특정 니케에게만 드는 것(2026-11-05 유저 "비슷하게 소외받고 있는 캐릭터들은 없을까" → "그래").
  // 「Affects all allies. Pierce Damage ▲」는 관통으로 때리는 니케에게만 의미가 있다. 받는 쪽은 스킬 원문에 그 피해를 내는 문장이 있는 니케
  // (DMG_KINDS.deals — 11-05 받는 쪽 41명을 원문으로 대조했다). 차지 대미지는 무기(RL·SR)로 정한다(벨벳 · 얀 · 애드미).
  for (const s of c.skills || []) {
    let allAllies = false;
    for (const x of String(s.desc || '').split(/(?<=\.)\s+/)) {
      if (/\baffects\b/i.test(x)) allAllies = /affects all allies(?! with| of| from)/i.test(x);   // 「all allies with a Sniper Rifle」(D : 킬러 와이프)는 무기 조건이라 위 대상절이 맡는다
      if (!allAllies) continue;
      for (const [kind, d] of Object.entries(DMG_KINDS)) {
        if (!d.buff.test(x) || out.some((o) => o.key === `dmg|${kind}`)) continue;
        out.push({ key: `dmg|${kind}`, scope: null, effect: '', cond: { dmgKind: kind }, skill: { name: s.name, name_kr: s.name_kr || null, name_ja: s.name_ja || null } });
      }
    }
  }
  return out;
}

const AMMO_HEAVY = ['mg', 'smg'];
const skillText = (c) => (c.skills || []).map((s) => String(s.desc || '')).join(' ');
const DMG_KINDS = {
  charge: { buff: /charge damage( multiplier)? ?▲/i, deals: (m) => ['rl', 'sr'].includes(String(m.weapon).toLowerCase()) },
  pierce: { buff: /pierce damage ?▲/i, deals: (m) => /gains? (continuous )?pierce|additional effects?( \d)?: (gains )?pierce|deals for pierce/i.test(skillText(m)) },
  distributed: { buff: /distributed damage( dealt)? ?▲/i, deals: (m) => /as distributed damage|deals distributed damage|dealing distributed damage/i.test(skillText(m)) },
  sustained: { buff: /sustained damage ?▲/i, deals: (m) => /as sustained damage|deals sustained damage/i.test(skillText(m)) },
  true: { buff: /true damage ?▲/i, deals: (m) => /as (burst skill )?true damage|deal true damage|deals true damage|into true damage/i.test(skillText(m)) },
};
// 검사용(scripts/testDexRelations.mjs) — 그 효과 종류를 받는 쪽인가
export const dealsDamageKind = (kind, m) => Boolean(DMG_KINDS[kind]?.deals(m));
const targetsOf = (g, x, pool) => (g.cond.ammo ? pool.filter((m) => AMMO_HEAVY.includes(String(m.weapon).toLowerCase()))
  : g.cond.dmgKind ? pool.filter((m) => DMG_KINDS[g.cond.dmgKind].deals(m))
  : (resolveAllyScope(g.scope, x, pool, g.effect) || []));

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
    const targets = targetsOf(g, c, CHARACTERS).filter((x) => x.id !== c.id && isBuffReceiver(x));
    return {
      skill: g.skill, cond: g.cond, squad: g.cond.squad ? (c.squad || null) : null, total: targets.length,
      top: targets.sort(order).slice(0, 4).map(slim),
    };
  }).filter((g) => g.total > 0);
  const receives = [];
  if (isBuffReceiver(c)) CHARACTERS.forEach((x) => {
    if (x.id === c.id) return;
    const hit = conditionalScopes(x).find((g) => targetsOf(g, x, [c]).length > 0);
    if (hit) receives.push({ ...x, skill: hit.skill, cond: hit.cond, squad: hit.cond.squad ? (x.squad || null) : null });
  });
  receives.sort(order);
  return { gives, receivesTotal: receives.length, receives: receives.slice(0, 6).map((r) => ({ ...slim(r), skill: r.skill, cond: r.cond, squad: r.squad })) };
}
