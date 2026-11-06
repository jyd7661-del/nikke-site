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
import soloRaid from '@/data/soloRaidTeams.json';
import towerComps from '@/data/towerCompositions.json';
import metaStats from '@/data/metaStats.json';
import partnerNotes from '@/data/partnerNotes.json';
import { scopeOf, resolveAllyScope, scopeCondition, isBuffReceiver } from '@/lib/buffTargets';

const CHARACTERS = Array.isArray(db) ? db : db.characters;
const BY_TITLE = new Map(CHARACTERS.map((c) => [c.title, c]));
const TIER_RANK = { SSS: 9, SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };

const slim = (c) => ({ id: c.id, title: c.title, name_kr: c.name_kr, name_ja: c.name_ja || null, img: c.img || null });   // img: 「함께 쓰면 좋은 니케」 얼굴(11-06 유저 "여기도 초상화가 있어야할 것 같아")
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
      top: targets.sort(order).map(slim),   // 전부 넘긴다 — 화면이 앞 4명만 보이고 나머지는 「더 보기」(11-05 유저: "목록은 왜 이거밖에 없지?")
    };
  }).filter((g) => g.total > 0);
  const receives = [];
  if (isBuffReceiver(c)) CHARACTERS.forEach((x) => {
    if (x.id === c.id) return;
    const hit = conditionalScopes(x).find((g) => targetsOf(g, x, [c]).length > 0);
    if (hit) receives.push({ ...x, skill: hit.skill, cond: hit.cond, squad: hit.cond.squad ? (x.squad || null) : null });
  });
  receives.sort(order);
  return { gives, receivesTotal: receives.length, receives: receives.map((r) => ({ ...slim(r), skill: r.skill, cond: r.cond, squad: r.squad })) };
}

// 「함께 쓰면 좋은 니케」 — **우연보다 자주 같이 쓰인 니케**(2026-11-06 유저: "이렇게 되면 함께쓰기 좋은 니케가 아니라 쓰인이력이 많은 니케인데
// 그건 별로 좋은 정보는 아닌 것 같아" → "그렇게 해보고 목록에 있는 이유를 같이 서술해줘").
// 같이 쓰인 횟수는 인기와 판의 제약을 그대로 탄다 — 에이드 : 에이전트 바니 ↔ 아니스 : 스타 4건은 전부 테트라 타워(테트라만 나간다)였고,
// 기업별로 나눠 재면 우연의 0.82배였다. 그래서 **같은 판끼리만** 기대 동시 등장(nA·nB/N)을 더해 실제와 비교한다(리프트).
//   판 = 보스전 약점 속성 시즌 묶음(soloRaidTeams.weakness) · 타워 기업 풀(towerCompositions.pools) · 캠페인(metaStats.campaignCompositions).
//   검증(11-06): 민트 ↔ 프리카 5.5배 · 리버렐리오 ↔ 홍련 : 흑영 7.6배 · 마스트 ↔ 앵커 : 이노센트 메이드 2.5배.
//   마스트 ↔ 크라운은 1.2배 — 둘 다 거의 모든 캠페인 팀에 들어 "서로를 골라서"가 아니라 "각자 필수라서" 겹친다. 목록에서 빠지는 게 의도다(유저 "그렇게 해보고").
// 넣는 기준: 같이 쓰인 게 **3번 이상**이고 우연보다 많을 때(리프트 > 1). 2번 이하는 우연일 수 있다. 스킬로 이어지는 니케는 기록이 적어도 넣는다(이유가 따로 있다).
const POOLS = (() => {
  const out = [];
  const byWeak = new Map();
  for (const s of soloRaid.seasons || []) for (const t of s.teams || []) {
    const k = String(s.weakness || '');
    if (!byWeak.has(k)) byWeak.set(k, []);
    byWeak.get(k).push(new Set(t.members || []));
  }
  for (const [k, teams] of byWeak) out.push({ kind: 'raid', key: k, teams });
  for (const p of towerComps.pools || []) out.push({ kind: 'tower', key: p.tower || 'normal', teams: (p.teams || []).map((t) => new Set(t.members || [])) });
  out.push({ kind: 'campaign', key: '', teams: ((metaStats.campaignCompositions || {}).list || []).map((t) => new Set(t.members || [])) });
  return out.map((p) => {
    const n = new Map();
    p.teams.forEach((t) => t.forEach((m) => n.set(m, (n.get(m) || 0) + 1)));
    return { ...p, n };
  });
})();
export function coUse(a, b) {
  let obs = 0; let exp = 0; const by = [];
  for (const p of POOLS) {
    const N = p.teams.length; const na = p.n.get(a) || 0; const nb = p.n.get(b) || 0;
    if (!N || !na || !nb) continue;
    const ab = p.teams.reduce((k, t) => k + (t.has(a) && t.has(b) ? 1 : 0), 0);
    obs += ab; exp += (na * nb) / N;
    if (ab) by.push({ kind: p.kind, key: p.key, n: ab });
  }
  return { obs, exp, lift: exp > 0 ? obs / exp : null, by: by.sort((x, y) => y.n - x.n) };
}
const MIN_TOGETHER = 3;

// 짝 해설(2026-11-06 유저: "우연보다 몇배 자주 쓰였다는 보는사람입장에서 아무 도움이 안돼. 내가 말한 서술은 어떤 부분때문에 스킬부분에서 이점이 있다"
// → "너가 원문읽고 쓰면 되겠네"). 클로드가 두 니케 스킬 원문을 읽고 쓴 해설(B등급 — 해석). 숫자는 scripts/testPartnerNotes.mjs가 원문과 대조한다.
const NOTE = new Map((partnerNotes.pairs || []).map((p) => [[p.a, p.b].sort().join('||'), p]));
export const noteFor = (a, b) => NOTE.get([a, b].sort().join('||')) || null;

export function partnersFor(c) {
  const sk = skillLinksFor(c);
  const arch = new Map();
  (syn.archetypes || []).filter((a) => (a.members || []).includes(c.title))
    .forEach((a) => (a.members || []).forEach((m) => { if (m !== c.title) arch.set(m, (arch.get(m) || 0) + 1); }));
  const map = new Map();
  const get = (m) => {
    if (!map.has(m.id)) map.set(m.id, { ...slim(m), burst: m.burstFlex && Array.isArray(m.burstStages) && m.burstStages.length ? m.burstStages.join('·') : (m.burst ?? null),   // 단계 선택 니케(레드 후드 등)는 쓸 수 있는 단계를 「1·3」으로
      burstFlex: !!m.burstFlex, cls: m.class || null, together: null, archetype: arch.get(m.title) || 0, links: [] });
    return map.get(m.id);
  };
  for (const m of CHARACTERS) {
    if (m.id === c.id) continue;
    const u = coUse(c.title, m.title);
    if (u.obs >= MIN_TOGETHER && u.lift > 1) { const e = get(m); e.together = { n: u.obs, lift: Math.round(u.lift * 10) / 10, by: u.by }; const nt = noteFor(c.title, m.title); if (nt) e.note = { ko: nt.ko || null, en: nt.en || null, ja: nt.ja || null }; }
  }
  sk.gives.forEach((g) => g.top.forEach((x) => get(BY_TITLE.get(x.title)).links.push({ dir: 'give', skill: g.skill, cond: g.cond, squad: g.squad })));
  sk.receives.forEach((x) => get(BY_TITLE.get(x.title)).links.push({ dir: 'recv', skill: x.skill, cond: x.cond, squad: x.squad }));
  // 스킬 연결만 있고 같이 쓰인 근거가 없는 니케가 수십 명이면(리틀 머메이드 MG·SMG 26명) 목록이 같이 쓰는 짝을 덮는다 —
  // 그들은 같이 쓰인 짝 뒤에, 같이 쓰인 수 → 등급 순으로 둔다.
  const tierOf = (x) => bestTier(BY_TITLE.get(x.title) || {});
  const sameUse = (x) => coUse(c.title, x.title).obs;
  const list = [...map.values()].sort((a, b) => ((b.together ? 1 : 0) - (a.together ? 1 : 0))
    || ((b.together?.lift || 0) - (a.together?.lift || 0)) || ((b.together?.n || 0) - (a.together?.n || 0))
    || (sameUse(b) - sameUse(a)) || (tierOf(b) - tierOf(a)) || a.title.localeCompare(b.title));
  return {
    gives: sk.gives.map((g) => ({ skill: g.skill, cond: g.cond, squad: g.squad, total: g.total })),
    receivesTotal: sk.receivesTotal,
    list,
  };
}
