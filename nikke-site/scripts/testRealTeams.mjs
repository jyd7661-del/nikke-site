#!/usr/bin/env node
/**
 * 등록된 **실제 조합**으로 우리 규칙을 검증한다.
 *
 *   node scripts/testRealTeams.mjs
 *
 * 왜 필요한가 (2026-09-01):
 *   우리 엔진은 "버스트 I·II·III가 각 1명 이상"을 하드 제약으로 건다. 이건 게임 규칙이라
 *   맞는 제약인데, **우리 캐릭터 데이터가 틀리면 진짜 조합이 조용히 탈락한다.**
 *   실제로 그랬다 — enikk 실사용 조합 214건 중 20건이 "버스트 체인 없음"으로 후보에서
 *   빠져 있었고, 원인은 조합이 아니라 라피: 레드 후드의 `burstFlex`가 비어 있던 것이었다.
 *   그중에는 타워 elysion 클리어의 20.8%를 차지하는 5건이 통째로 들어 있었다.
 *
 *   `docs/engine.md`에는 그 20건이 "진짜로 버스트 체인이 없는 실사용 조합"이라고 적혀
 *   있었다. 근거 없이 규칙을 풀지 않은 것은 옳았지만, **"우리 규칙이 실제 기록을 얼마나
 *   떨어뜨리는가"를 아무도 계속 세고 있지 않았다.** 이 스크립트가 그걸 센다.
 *
 * 판정 기준: 사람들이 실제로 클리어에 쓴 조합은 우리 규칙에서도 성립해야 한다.
 *   성립하지 않는 게 있으면 **둘 중 하나가 틀린 것이다** — 우리 데이터이거나, 우리 규칙이다.
 *   어느 쪽인지는 사람이 판단한다. 기준선: 무효 0건.
 *
 * ⚠️ 여기서 버스트 **순환 속도**(쿨타임)는 판정하지 않는다. 2026-09-01 실측에서
 *    "20초마다 풀버스트"를 기준으로 재봤더니 PvP 등록 조합 20건 중 19건이 걸렸다 —
 *    아레나는 그 주기로 도는 판이 아니라서다. 솔로레이드도 34%가 걸렸는데 그쪽은
 *    40초 순환을 감수하는 상위 기록이 실제로 많다. 그래서 순환은 **참고 지표로만** 찍는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'lib');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-realteams-'));

// 엔진은 JSON을 import assertion 없이 읽어서 순수 Node로 직접 못 부른다.
// testEngineReasons.mjs와 같은 방식으로 임시 사본을 만들어 부르고 끝나면 지운다.
const fixImports = (src) =>
  src
    .replace(/from '\.\.\/data\/([\w.]+)\.json';/g, (_, name) =>
      `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${name}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/(\w+)(?:\.js)?';/g, (_, name) =>
      `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${name}.mjs`)).href)};`);
for (const f of ['synergyEngine', 'engineReasons', 'i18n', 'buffTargets', 'pvpBurst']) {
  fs.writeFileSync(path.join(tmp, `${f}.mjs`), fixImports(fs.readFileSync(path.join(LIB, `${f}.js`), 'utf8')));
}
const engine = await import(pathToFileURL(path.join(tmp, 'synergyEngine.mjs')).href);

const j = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cdb = j('characterDatabase.json');
const byTitle = new Map(cdb.map((c) => [c.title, c]));

// --- 등록된 실사용 조합 모으기 (수집 규칙은 docs/data.md) ---
const teams = [];
j('soloRaidTeams.json').seasons.forEach((s) => (s.teams || []).forEach((t) =>
  teams.push({ src: '솔로레이드', mode: 'bossing', members: t.members, w: t.parses,
    ctx: { bossElement: engine.WEAKNESS_TO_BOSS_ELEMENT[String(s.weakness || '').toLowerCase()] },
    label: `시즌${s.raid} ${s.boss} · ${t.parses} parses` })));
j('towerCompositions.json').pools.forEach((p) => (p.teams || []).forEach((t) =>
  teams.push({ src: '타워', mode: 'tribe_tower', members: t.members, w: t.uses, ctx: { tower: p.tower || null },
    label: `${p.pool}${p.tower ? '/' + p.tower : ''} · ${t.pctOfClears}% of clears` })));
const ms = j('metaStats.json');
(ms.campaignCompositions?.list || []).forEach((t) =>
  teams.push({ src: '캠페인', mode: 'campaign', members: t.members, w: t.totalUses, label: `${t.pctOfClears}% of clears` }));
(ms.pvp?.topTeams || []).forEach((t) =>
  teams.push({ src: 'PvP', mode: 'pvp', members: t.members, w: t.n, label: `승률 ${t.wr}% · 채택 ${t.adoption}%` }));

const problems = [];
const stats = new Map();
const SOLO_B3 = '[버스트 3 단독]';   // lib/engineReasons.js solo_burst3의 머리말(한국어)

// --- 참고 지표: 풀버스트 순환 (판정 아님) ---
const cdOf = (c) => {
  const s = (c.skills || [])[(c.skills || []).length - 1];
  const n = Number(s?.cd);
  return Number.isNaN(n) || !n ? null : n;
};
function cycleSeconds(members) {
  const flex = members.filter((m) => m.burstFlex);
  const stage = { 1: [], 2: [], 3: [] };
  members.filter((m) => !m.burstFlex).forEach((m) => { if (stage[m.burst]) stage[m.burst].push(cdOf(m) ?? 40); });
  const evaluate = (st) => {
    let worst = 0;
    for (const b of ['1', '2', '3']) {
      if (!st[b].length) return Infinity;
      worst = Math.max(worst, 1 / st[b].reduce((a, c) => a + 1 / c, 0));
    }
    return worst;
  };
  if (!flex.length) return evaluate(stage);
  let best = Infinity;
  for (const b of ['1', '2', '3']) {
    if (!flex.every((m) => (Array.isArray(m.burstStages) ? m.burstStages.map(String) : ['1', '2', '3']).includes(b))) continue;
    const st = { 1: [...stage[1]], 2: [...stage[2]], 3: [...stage[3]] };
    flex.forEach((m) => st[b].push(cdOf(m) ?? 40));
    best = Math.min(best, evaluate(st));
  }
  return best;
}

for (const t of teams) {
  const members = t.members.map((n) => byTitle.get(n));
  const missing = t.members.filter((n) => !byTitle.get(n));
  if (missing.length) {
    // 이름이 안 맞으면 그 조합은 매칭에서 통째로 빠진다 — 조용한 누락이라 여기서 잡는다.
    problems.push(`[${t.src}] ${t.label}: 이름을 characterDatabase에서 못 찾음 — ${missing.join(', ')}`);
    continue;
  }
  const s = stats.get(t.src) || { n: 0, invalid: 0, unreachable: 0, cyc: { ok: 0, slow: 0 } };
  s.n += 1;
  const scored = engine.scoreTeam(members, t.mode, {});
  if (!scored.valid) {
    s.invalid += 1;
    problems.push(
      `[${t.src}] ${t.label}: 실제로 쓰인 조합인데 우리 규칙에서 버스트 체인 불성립 — ` +
      `${members.map((m) => `${m.name_kr || m.title}(B${m.burst}${m.burstFlex ? '/유연' : ''})`).join(', ')}`);
  }
  // 2026-09-02 추가: **그 조합이 실사용 경로로 실제로 도달되는가.**
  //
  // 규칙상 유효한 것과 엔진이 실제로 찾아내는 것은 다르다. 실제로 솔로레이드 조합 125건이
  // `s.weakness === bossElement` 한 줄 때문에 **보스 속성을 고르는 순간 전부 걸러져** 2026-08-19
  // 이후 한 번도 매칭되지 않았다(데이터 어휘 iron vs 화면 어휘 Iron, electric vs Electronic).
  // 위의 valid 검사는 그걸 못 잡는다 — 조합 자체는 멀쩡했기 때문이다.
  // 그 조합 5명만 담은 로스터에 그 조합의 맥락(보스 속성·타워 풀)을 그대로 넘겨서,
  // findRealUsageTeamMatch가 그 조합을 돌려주는지 본다.
  // 2026-10-01: 실사용 경로는 애장품이 필요한 멤버를 애장품 없이 가진 사용자에게 그 기록을 안 낸다(유저: 완성 조합 사용자는 애장품이 거의 있다).
  // 기록은 보유자의 것이므로 여기서는 전원 애장품 보유로 찾는다 — 도달성(어휘·맥락)만 본다.
  const found = engine.findRealUsageTeamMatch(members, t.mode, { ...(t.ctx || {}), treasureIds: new Set(members.map((m) => m.id)) });
  if (!found) {
    s.unreachable += 1;
    problems.push(
      `[${t.src}] ${t.label}: 실사용 경로가 이 조합을 못 찾는다 ` +
      `(맥락 ${JSON.stringify(t.ctx || {})}) — ${t.members.join(', ')}`);
  } else {
    const got = new Set(found.members.map((m) => m.title));
    if (!t.members.every((x) => got.has(x))) {
      s.unreachable += 1;
      problems.push(`[${t.src}] ${t.label}: 실사용 경로가 **다른** 조합을 돌려줬다 — ` +
        `기대 ${t.members.join(', ')} / 실제 ${[...got].join(', ')}`);
    }
  }

  // 2026-09-21 추가: **'버스트 3 단독' 문장이 랭커 조합에 붙으면 오탐이다.**
  // 이 문장의 근거가 "PvE 등록 조합 194건 중 0건"이므로, 등록 조합에 하나라도 붙는 순간 문장 속 숫자가 거짓이 된다
  // (데이터가 갱신돼 실제로 단독 조합이 등록되면 여기서 걸린다 — 그때는 문장을 고치거나 범위를 다시 잰다).
  if (t.src !== 'PvP' && (scored.reasons || []).some((r) => String(r).startsWith(SOLO_B3))) {
    problems.push(`[${t.src}] ${t.label}: 실제로 쓰인 조합에 '버스트 3 단독' 문장이 붙었다 — ${t.members.join(', ')}`);
  }
  // 2026-09-26 추가: **PvP 등록 조합에 '낭비 인원'이 나오면 안 된다.**
  // 낭비 판정은 20초 순환 전제라 PvP에서 껐다(synergyEngine NO_WASTE_RULE_MODES). 끄기 전엔 PvP 상위 22팀 중 13팀이
  // 걸려 랭커 구성을 0점 처리했고, 엔진이 블랑+나유타 같은 조합을 피했다. 다시 켜지면 여기서 걸린다.
  // 같은 날 솔로레이드도 껐다(등록 125건 중 34건이 걸렸다 — 버스트를 안 써도 평타·스킬로 딜을 넣는 공격형이 25명).
  if ((t.src === 'PvP' || t.src === '솔로레이드') && (scored.wastedCount || 0) > 0) {
    problems.push(`[${t.src}] ${t.label}: 실제로 쓰인 조합에 낭비 인원 ${scored.wastedCount}명 — 이 모드의 낭비 판정이 다시 켜졌다 — ${t.members.join(', ')}`);
  }
  const cyc = cycleSeconds(members);
  if (cyc <= 20.001) s.cyc.ok += 1; else s.cyc.slow += 1;
  stats.set(t.src, s);
}

// --- '버스트 3 단독' 문장의 합성 시험 (2026-09-21) — 나와야 할 때 나오고, 아닐 때 안 나오는가 ---
{
  const T = (names) => names.map((n) => byTitle.get(n));
  const says = (names, mode) => (engine.scoreTeam(T(names), mode, {}).reasons || []).some((r) => String(r).startsWith(SOLO_B3));
  const cases = [
    ['3버스트 1명(캠페인) → 나온다', ['Miranda', 'Emma', 'Delta', 'Diesel', 'Rapi'], 'campaign', true],
    ['같은 5명 PvP → 안 나온다', ['Miranda', 'Emma', 'Delta', 'Diesel', 'Rapi'], 'pvp', false],
    ['3버스트 2명 → 안 나온다', ['Miranda', 'Emma', 'Delta', 'Rapi', 'Snow White'], 'campaign', false],
    ['3버스트 1명 + 남는 유연 멤버(레드 후드) → 안 나온다', ['Miranda', 'Delta', 'Diesel', 'Rapi', 'Red Hood'], 'campaign', false],
    ['유연 멤버가 빈 1단계를 메우러 가면 3은 혼자다 → 나온다', ['Rapi: Red Hood', 'Delta', 'Diesel', 'Signal', 'Rapi'], 'campaign', true],
  ];
  for (const [label, names, mode, want] of cases) {
    const miss = names.filter((n) => !byTitle.get(n));
    if (miss.length) { problems.push(`[버스트 3 단독 시험] 시험용 이름이 DB에 없다 — ${miss.join(', ')}`); continue; }
    if (says(names, mode) !== want) problems.push(`[버스트 3 단독 시험] ${label} — 기대와 다르다(기대 ${want})`);
  }

  // 관문(2026-09-21): 두 번째 3버스트를 넣을 수 있으면 단독 조합을 1위로 내지 않는다.
  // 같은 로스터를 관문 없이 돌리면 단독이 1위여야 한다 — 아니면 이 시험은 아무것도 재지 않는다(빈 시험 방지).
  const roster = T(['Anis: Star', 'Rouge', 'Prika', 'Helm: Aquamarine', 'Snow White: Heavy Arms', 'Quency: Escape Queen']);
  if (roster.some((c) => !c)) problems.push('[버스트 3 단독 관문] 시험용 이름이 DB에 없다');
  else {
    const gated = engine.recommendTeams(roster, 'bossing', {}).teams?.[0];
    const raw = engine.recommendTeams(roster, 'bossing', { skipSoloB3Gate: true }).teams?.[0];
    if (!raw?.soloBurst3) problems.push('[버스트 3 단독 관문] 관문 없이도 단독이 1위가 아니다 — 시험 로스터가 더는 이 고장을 재현하지 못한다');
    if (!gated || gated.soloBurst3) problems.push('[버스트 3 단독 관문] 3버스트가 2명 있는 로스터인데 단독 조합이 1위로 나왔다');
    // 대안이 없으면(3버스트가 1명뿐) 빈 결과가 아니라 그 조합이 그대로 나와야 한다.
    const only = engine.recommendTeams(roster.filter((c) => c.title !== 'Quency: Escape Queen'), 'bossing', {}).teams?.[0];
    if (!only) problems.push('[버스트 3 단독 관문] 3버스트가 1명뿐인 로스터에서 추천이 비었다');
  }
}

// --- PvP 버스트 속도 관문 (2026-09-29) — lib/pvpBurst.js · recommendTeams ---
// ① 1위가 4RL보다 느리면 4RL 이내로 **확인된** 후보로 바꾼다. 이 로스터는 관문 없이는 느린 팀(99)이 1위이고,
//    첫 설계(정렬 비교에 "느림이면 뒤로")에서는 값이 없는 퀸이 든 팀으로 빠져나갔다 — 그 고장까지 잡는다.
// ② 애장품은 가진 것만 반영한다(유저 2026-09-29: 없는데 있는 것처럼 짜면 초보가 곤란하다).
// ③ 값이 없는 멤버가 있으면 모름(null) — 문장도 안 붙는다.
{
  const T = (names) => names.map((n) => byTitle.get(n));
  const roster = T(['Soda: Twinkling Bunny', 'Dolla', 'Sakura: Bloom in Summer', 'Chime', 'Rem', 'Ada Wong', 'Helm: Aquamarine', 'Grave',
    'Nayuta', 'Flora', 'Anchor: Innocent Maid', 'Signal', 'Yuni', 'Queen (Makoto Niijima)', 'Rapunzel: Pure Grace']);
  if (roster.some((c) => !c)) problems.push('[PvP 버스트 관문] 시험용 이름이 DB에 없다');
  else {
    const raw = engine.recommendTeams(roster, 'pvp', { skipPvpBurstGate: true }).teams?.[0];
    const gated = engine.recommendTeams(roster, 'pvp', {}).teams?.[0];
    if (raw?.pvpBurst?.tier !== 'slower') problems.push(`[PvP 버스트 관문] 관문 없이도 1위가 느린 팀이 아니다(${raw?.pvpBurst?.tier}) — 시험 로스터가 더는 이 고장을 재현하지 못한다`);
    if (!gated?.pvpBurst?.tier) problems.push('[PvP 버스트 관문] 느린 1위를 값을 모르는 팀으로 바꿨다 — 대체 후보는 4RL 이내로 확인된 팀이어야 한다');
    else if (gated.pvpBurst.tier === 'slower') problems.push('[PvP 버스트 관문] 4RL 이내 후보가 있는데 4RL보다 느린 팀이 1위로 나왔다');
  }
  const helm = byTitle.get('Helm');
  const nayutaTeam = T(['Nayuta', 'Helm', 'Laplace', 'Red Hood', 'Emilia']);
  const plain = engine.scoreTeam(nayutaTeam, 'pvp', {}).pvpBurst?.tier;
  const withT = engine.scoreTeam(nayutaTeam, 'pvp', { treasureIds: new Set([helm?.id]) }).pvpBurst?.tier;
  if (plain !== '4RL' || withT !== '3RL') problems.push(`[PvP 버스트 애장품] 헬름 애장품 미보유 4RL · 보유 3RL이어야 한다 — 실제 ${plain} · ${withT}`);
  const unk = engine.scoreTeam(T(['Anis: Star', 'Blanc', 'Privaty', 'Biscuit', 'Maiden: Ice Rose']), 'pvp', {});
  if (unk.pvpBurst?.tier !== null || (unk.reasons || []).some((r) => String(r).startsWith('[버스트 속도]'))) {
    problems.push('[PvP 버스트 모름] 값이 없는 멤버(아니스 : 스타)가 있는데 속도를 냈거나 문장을 붙였다');
  }
  if (engine.scoreTeam(nayutaTeam, 'bossing', {}).pvpBurst !== null) problems.push('[PvP 버스트] PvP가 아닌 모드에서 속도를 계산했다');
}

// --- 아키타입 속성 관문 (2026-09-30) — 보스 약점이 정해지면 다른 속성 약점용 조합은 완전일치 후보가 아니다 ---
// 빈 자리(flexSlots) 복원 뒤 이 로스터(50명)는 수냉 보스에 전격 약점용 조합이 잡혔다. 다섯 속성 모두에서
// 고른 조합의 element가 비었거나('All') 보스와 같아야 한다. 관문을 끄면(역테스트) 여기서 걸린다.
{
  const names = ['Queen (Makoto Niijima)', 'Marciana', 'Arcana: Fortune Mate', 'Phantom', 'Cocoa', 'E.H.', 'Ein', 'EVE', 'Red Hood', 'Leona',
    'Elegg: Boom and Shock', 'Ludmilla: Winter Owner', 'Delta: Ninja Thief', 'Grave', 'Dolla', 'Modernia', 'Mori', 'Ludmilla', 'Mari Makinami Illustrious',
    'Nero', 'Frima', 'Cinderella: Crystal Wave', 'Vesti: Tactical Upgrade', 'Privaty: Unkind Maid', 'Snow White', 'Asuka Shikinami Langley', 'Rapunzel',
    'Maxwell: Ordinary Mechanic', 'D: Killer Wife', 'Trina', 'Exia', 'Emilia', 'Crust', 'Mana', 'Helm: Aquamarine', 'Anis: Star', 'Nayuta', 'Scarlet',
    'Noah', 'Sin', 'Poli', 'Sakura', 'Yuni', 'Jackal', 'Cinderella', 'Privaty', 'Admi', 'Prika', 'Scarlet: Black Shadow', 'Raven'];
  const roster = names.map((n) => byTitle.get(n));
  if (roster.some((c) => !c)) problems.push('[아키타입 속성 관문] 시험용 이름이 DB에 없다');
  else {
    const archByName = new Map(j('synergyNotes.json').archetypes.map((a) => [a.name, a]));
    let hits = 0;
    for (const boss of engine.BOSS_ELEMENTS) {
      const m = engine.findExactTeamMatch(roster, 'bossing', { bossElement: boss });
      const a = m && archByName.get(m.archetypeName);
      if (!a) continue;
      hits += 1;
      if (a.element && engine.WEAKNESS_TO_BOSS_ELEMENT[a.element] !== boss) {
        problems.push(`[아키타입 속성 관문] ${boss} 보스에 ${a.element} 약점용 조합 "${a.name}"을 완전일치로 냈다`);
      }
    }
    if (!hits) problems.push('[아키타입 속성 관문] 다섯 속성 어디서도 아키타입이 안 잡혔다 — 시험 로스터가 더는 아무것도 재지 않는다');
  }
}

// --- 빈 자리 아키타입 vs 폴백 (2026-09-30) — pickSiteTeam · fallbackBeatsFlexArchetype ---
// 이 로스터(얇은 표본 s2 T13)는 빈 자리를 채운 아키타입이 크라운(SSS)을 두고 앵커를 넣었다. 폴백과 겨루면 폴백(크라운 포함)이 이겨야 하고,
// 옛 경로(noFlexCompete)에선 아키타입이 나와야 한다(시험이 여전히 그 고장을 재현하는지). 라우트도 같은 함수를 부르는지 소스로 본다.
{
  const roster = ['Anchor: Innocent Maid', 'Brid', 'Chisato Nishikigi', 'Crown', 'Elegg: Boom and Shock', 'Exia', 'Helm', 'Kilo',
    'Mast: Romantic Maid', 'Tove', 'Trina', 'Yuni'].map((n) => byTitle.get(n));
  if (roster.some((c) => !c)) problems.push('[빈 자리 아키타입 vs 폴백] 시험용 이름이 DB에 없다');
  else {
    const now = engine.pickSiteTeam(roster, 'campaign', {});
    const old = engine.pickSiteTeam(roster, 'campaign', { noFlexCompete: true });
    if (old.path !== 'arch') problems.push(`[빈 자리 아키타입 vs 폴백] 옛 경로에서 아키타입이 안 나온다(${old.path}) — 시험 로스터가 더는 이 경우를 재현하지 못한다`);
    if (now.path !== 'fallback' || !now.flexLoser) problems.push(`[빈 자리 아키타입 vs 폴백] 빈 자리 아키타입이 더 센 폴백을 이겼다(${now.path})`);
  }
  const routeSrc = fs.readFileSync(path.join(ROOT, 'app', 'api', 'ai-recommend', 'route.js'), 'utf8');
  if (!/fallbackBeatsFlexArchetype\(/.test(routeSrc)) problems.push('[빈 자리 아키타입 vs 폴백] 라우트가 fallbackBeatsFlexArchetype를 안 부른다 — 사이트와 검사의 경로가 갈렸다');
}

// --- 낭비 인원 점수 = 티어 × 버스트 없이 남는 딜 비율 (2026-10-01, data/offBurstShare.json) ---
// 블라인드 판정 표본(씨앗 11 B13)의 캠페인 로스터: 0점 처리일 때는 세 번째 B3 대신 아르카나(D B2)를 넣었다.
// 지금은 아르카나가 빠져야 하고, 옛 0점(__NIKKE_OFF_BURST_OFF)으로 돌리면 아르카나가 다시 들어와야 한다(시험이 그 고장을 재현하는지).
{
  const roster = ['Arcana', 'Brid: Silent Track', 'D', 'Guillotine: Winter Slayer', 'Jill Valentine', 'Ludmilla', 'Quency: Escape Queen',
    'Raven', 'Rupee', 'Sakura', 'Scarlet: Black Shadow', 'Trony'].map((n) => byTitle.get(n));
  if (roster.some((c) => !c)) problems.push('[낭비 인원 점수] 시험용 이름이 DB에 없다');
  else {
    const has = (r) => (r.team?.members || []).some((m) => m.title === 'Arcana');
    const now = engine.pickSiteTeam(roster, 'campaign', {});
    globalThis.__NIKKE_OFF_BURST_OFF = true;
    const old = engine.pickSiteTeam(roster, 'campaign', {});
    globalThis.__NIKKE_OFF_BURST_OFF = false;
    if (!has(old)) problems.push('[낭비 인원 점수] 옛 0점에서도 아르카나가 안 나온다 — 시험 로스터가 더는 이 고장을 재현하지 못한다');
    if (has(now)) problems.push('[낭비 인원 점수] 세 번째 B3 대신 아르카나(D B2)를 넣었다 — 낭비 인원을 0점으로 세고 있다');
  }
}

// --- 보스전 실사용 등급 = 그 약점 속성 시즌 상위 50인 사용률 (2026-10-01, metaStats.soloRaidSeasonUsage) ---
// 블라인드 판정 표본(씨앗 11 B04, 전격 보스): 전체 레이드 채용 A(67%)인 토브가 들어갔다 — 전격 시즌 상위 50인 사용률은 0.3%.
// 시즌 등급으로는 토브가 빠져야 하고, 옛 전체 등급(__NIKKE_SEASON_USAGE_OFF)으로 돌리면 다시 들어와야 한다.
{
  const roster = ['Aria', 'Asuka: WILLE', 'Crust', 'Delta: Ninja Thief', 'Emilia', 'Epinel', 'Folkwang', 'Ludmilla', 'Maiden: Ice Rose', 'Mary',
    'Mast: Romantic Maid', 'Maxwell: Ordinary Mechanic', 'Mint', 'Moran', 'Naga', 'Power', 'Rem', 'Rosanna', 'Rupee: Winter Shopper', 'Snow Crane',
    'Snow White: Innocent Days', 'Tove', 'Trony', 'Velvet', 'Volume'].map((n) => byTitle.get(n));
  if (roster.some((c) => !c)) problems.push('[시즌 실사용 등급] 시험용 이름이 DB에 없다');
  else {
    const hasTove = (r) => (r.team?.members || []).some((m) => m.title === 'Tove');
    // 토브는 애장품 캐릭터라 애장품 실사용 게이트(아래 절)도 토브를 뺀다 — 시즌 등급 효과만 보려고 그 게이트는 양쪽 다 끈다.
    globalThis.__NIKKE_TREASURE_USAGE_GATE_OFF = true;
    const now = engine.pickSiteTeam(roster, 'bossing', { bossElement: 'Electronic' });
    globalThis.__NIKKE_SEASON_USAGE_OFF = true;
    const old = engine.pickSiteTeam(roster, 'bossing', { bossElement: 'Electronic' });
    globalThis.__NIKKE_SEASON_USAGE_OFF = false;
    globalThis.__NIKKE_TREASURE_USAGE_GATE_OFF = false;
    if (!hasTove(old)) problems.push('[시즌 실사용 등급] 옛 전체 등급에서도 토브가 안 나온다 — 시험 로스터가 더는 이 경우를 재현하지 못한다');
    if (hasTove(now)) problems.push('[시즌 실사용 등급] 전격 시즌 상위 50인 0.3%인 토브가 전격 보스 추천에 들어갔다 — 시즌 등급을 안 쓰고 있다');
  }
}

// --- 애장품이 없으면 그 캐릭터의 실사용 수치를 안 쓴다 (2026-10-01 유저: "목단은 애장품이 있을 때만 랭크가 높아져") ---
// 블라인드 판정 표본(씨앗 15 B03, 수냉 보스): 프리바티(보스전 기본 B · 애장품 SS)가 수냉 시즌 상위 50인 100%로 S 가산을 받아
// 네온:VE(SS) 자리를 차지했다. 애장품이 없으면 빠져야 하고, 스위치를 끄면 다시 들어와야 하며, 애장품을 가지면 쓰여야 한다.
{
  const roster = ['Anchor: Innocent Maid', 'Arcana', 'Arcana: Fortune Mate', 'Aria', 'Brid: Silent Track', 'Epinel', 'Eunhwa: Tactical Upgrade',
    'Little Mermaid', 'Naga', 'Neon: Vision Eye', 'Nihilister', 'Noise', 'Privaty', 'Rem', 'Rouge', 'Scarlet: Black Shadow', 'Soline',
    'Soline: Frost Ticket'].map((n) => byTitle.get(n));
  if (roster.some((c) => !c)) problems.push('[애장품 실사용] 시험용 이름이 DB에 없다');
  else {
    const hasPrivaty = (r) => (r.team?.members || []).some((m) => m.title === 'Privaty');
    const opt = { bossElement: 'Water' };
    const now = engine.pickSiteTeam(roster, 'bossing', opt);
    const owned = engine.pickSiteTeam(roster, 'bossing', { ...opt, treasureIds: new Set([byTitle.get('Privaty').id]) });
    globalThis.__NIKKE_TREASURE_USAGE_GATE_OFF = true;
    const old = engine.pickSiteTeam(roster, 'bossing', opt);
    globalThis.__NIKKE_TREASURE_USAGE_GATE_OFF = false;
    if (!hasPrivaty(old)) problems.push('[애장품 실사용] 스위치를 꺼도 프리바티가 안 나온다 — 시험 로스터가 더는 이 경우를 재현하지 못한다');
    if (hasPrivaty(now)) problems.push('[애장품 실사용] 애장품 없는 프리바티(보스전 B)가 애장품 보유자 사용률로 추천에 들어갔다');
    if (!hasPrivaty(owned)) problems.push('[애장품 실사용] 애장품을 가진 프리바티(보스전 SS)가 빠졌다 — 게이트가 보유자까지 막고 있다');
    // 위 줄은 애장품 티어(SS)만으로도 통과해서 "보유자의 실사용 점수"를 못 본다(역테스트로 확인) — 점수로 직접 잰다.
    const team = ['Privaty', 'Neon: Vision Eye', 'Anchor: Innocent Maid', 'Little Mermaid', 'Scarlet: Black Shadow'].map((n) => byTitle.get(n));
    const realOf = (ids) => engine.scoreTeam(team, 'bossing', { ...opt, treasureIds: ids }).realTierTotal;
    if (!(realOf(new Set([byTitle.get('Privaty').id])) > realOf(new Set()))) {
      problems.push('[애장품 실사용] 애장품을 가진 프리바티의 실사용 점수가 안 붙는다 — 게이트가 보유자까지 막고 있다');
    }
  }
}

// --- 실사용 완성 조합은 애장품 보유자의 기록 (2026-10-01 유저: "완성된 조합을 보통 쓰는 사람들은 애장품이 거의 있다") ---
// 레이드 시즌 41(수냉) 등록 조합에 목단·헬름이 있다. 애장품 없이 그 5명만 가졌으면 실사용 경로가 그 기록을 내면 안 되고,
// 두 애장품을 다 가졌으면 내야 한다. 스위치(REAL_TEAM_TREASURE_OFF)를 켜면 옛 동작대로 미보유에게도 낸다.
{
  const names = ['Moran', 'Nayuta', 'Ludmilla: Winter Owner', 'Helm', 'Elegg: Boom and Shock'];
  const team = names.map((n) => byTitle.get(n));
  if (team.some((c) => !c)) problems.push('[실사용 애장품] 시험용 이름이 DB에 없다');
  else {
    const opt = { bossElement: 'Water' };
    const none = engine.findRealUsageTeamMatch(team, 'bossing', opt);
    const owned = engine.findRealUsageTeamMatch(team, 'bossing', { ...opt, treasureIds: new Set(['Moran', 'Helm'].map((n) => byTitle.get(n).id)) });
    const oneOnly = engine.findRealUsageTeamMatch(team, 'bossing', { ...opt, treasureIds: new Set([byTitle.get('Moran').id]) });
    globalThis.__NIKKE_REAL_TEAM_TREASURE_OFF = true;
    const old = engine.findRealUsageTeamMatch(team, 'bossing', opt);
    globalThis.__NIKKE_REAL_TEAM_TREASURE_OFF = false;
    if (!old) problems.push('[실사용 애장품] 스위치를 꺼도 시즌 41 목단·헬름 조합이 안 나온다 — 시험이 더는 이 경우를 재현하지 못한다');
    if (none) problems.push('[실사용 애장품] 애장품 없는 목단·헬름으로 랭커 완성 조합을 추천했다');
    if (oneOnly) problems.push('[실사용 애장품] 헬름 애장품이 없는데 그 조합을 추천했다 — 한 명만 보유해도 통과한다');
    if (!owned) problems.push('[실사용 애장품] 두 애장품을 다 가졌는데 그 조합이 안 나온다 — 관문이 보유자까지 막는다');
  }
}

// --- 같은 쿨타임 3버스트가 넘치면 토템이 쉰다 (2026-10-01 유저: "애장품 헬름은 거의 토템으로만 쓰여서 3버스트가 3명인 경우가 많다") ---
// 캠페인 · 애장품 헬름 + 앨리스 + 맥스웰(셋 다 40초 B3, 둘만 버스트). 옛 순서는 헬름을 버스트시키고 공격형 하나를 낭비로 깎았다.
// 토템인 헬름이 쉬면 낭비 0이어야 하고, 스위치(TOTEM_REST_OFF)를 켜면 옛 동작(낭비 1)이 재현돼야 한다.
{
  const team = ['Liter', 'Crown', 'Helm', 'Alice', 'Maxwell'].map((n) => byTitle.get(n));
  if (team.some((c) => !c)) problems.push('[토템 휴식] 시험용 이름이 DB에 없다');
  else {
    const opt = { treasureIds: new Set([byTitle.get('Helm').id]) };
    const now = engine.scoreTeam(team, 'campaign', opt);
    globalThis.__NIKKE_TOTEM_REST_OFF = true;
    const old = engine.scoreTeam(team, 'campaign', opt);
    globalThis.__NIKKE_TOTEM_REST_OFF = false;
    if (!(old.wastedCount > 0)) problems.push('[토템 휴식] 스위치를 켜도 낭비가 안 나온다 — 시험이 더는 이 경우를 재현하지 못한다');
    if (now.wastedCount > 0) problems.push(`[토템 휴식] 애장품 헬름이 버스트하고 공격형이 낭비로 깎였다(낭비 ${now.wastedCount}) — 토템이 먼저 쉬어야 한다`);
  }
}

// --- 캠페인·타워 풀버스트 주기 관문 (2026-10-01) ---
// 근거: 등록 캠페인 20건 전부·타워 50건 중 43건이 20초 주기(위 표의 "20초 순환 아님"). 엔진 1위는 44~48%가 40초 이상이었다.
// ① 등록 캠페인 조합에는 slowCycle이 하나도 안 붙어야 한다(근거와 판정식이 같은지).
// ② 블라인드 표본 씨앗 14 B15: 옛 순위는 라푼젤(1버스트 60초)로 60초 주기 팀을 냈다 — 지금은 20초여야 하고, 스위치를 켜면 재현돼야 한다.
{
  const campSlow = (ms.campaignCompositions?.list || []).filter((t) => engine.scoreTeam(t.members.map((n) => byTitle.get(n)), 'campaign', {}).slowCycle);
  if (campSlow.length) problems.push(`[주기 관문] 등록 캠페인 조합 ${campSlow.length}건이 느린 주기로 판정됐다 — 근거(0/20)와 판정식이 어긋난다: ${campSlow.map((t) => t.members.join('/')).join(' · ')}`);
  const roster = ['Admi', 'Alice', 'Ark Ranger Black', 'Chisato Nishikigi', 'Makima', 'Mari Makinami Illustrious', 'Mary', 'Mast: Romantic Maid', 'Maxwell',
    'Miranda', 'Rapunzel', 'Rei', 'Rumani', 'Scarlet', 'Signal', 'Sin', 'Snow White', 'Snow White: Innocent Days'].map((n) => byTitle.get(n));
  if (roster.some((c) => !c)) problems.push('[주기 관문] 시험용 이름이 DB에 없다');
  else {
    const slowOf = (r) => engine.scoreTeam((r.team?.members || []).map((m) => byTitle.get(m.title)), 'campaign', {}).slowCycle;
    const now = engine.pickSiteTeam(roster, 'campaign', {});
    globalThis.__NIKKE_CYCLE_GATE_OFF = true;
    const old = engine.pickSiteTeam(roster, 'campaign', {});
    globalThis.__NIKKE_CYCLE_GATE_OFF = false;
    if (!slowOf(old)) problems.push('[주기 관문] 스위치를 켜도 느린 팀이 안 나온다 — 시험이 더는 이 경우를 재현하지 못한다');
    if (slowOf(now)) problems.push('[주기 관문] 20초 주기 대안이 있는 로스터에서 40초 이상 주기 팀을 추천했다');
  }
  // ③ 쿨감(data/burstCdr.json, 유저 10-01 "40초라도 쿨감으로 사실상 20초"). 라피: 레드 후드를 1버스트로 쓰면 본인 20초 + 전 아군 7.48초 →
  //    40초 멤버뿐인 팀도 20초에 돈다 — 느림이 아니어야 하고, 쿨감을 끄면(CYCLE_CDR_OFF) 느림이어야 한다.
  // ④ 티아의 쿨감(엄폐물 회복, 양 모름)은 **본인 단계만** 줄인다 — 혼자인 40초 2버스트(마스트)는 여전히 느림이어야 한다(처음엔 이게 빠져나갔다).
  const S = (names) => engine.scoreTeam(names.map((n) => byTitle.get(n)), 'campaign', {}).slowCycle;
  const rrh = ['Helm: Aquamarine', 'Rapi: Red Hood', 'Scarlet', 'Alice', 'Scarlet: Black Shadow'];
  if (S(rrh)) problems.push('[주기 관문·쿨감] 라피RH 1버스트(본인 20초+전 아군 7.48초) 팀을 느리다고 판정했다 — 쿨감이 안 들어간다');
  globalThis.__NIKKE_CYCLE_CDR_OFF = true;
  const rrhOff = S(rrh);
  globalThis.__NIKKE_CYCLE_CDR_OFF = false;
  if (!rrhOff) problems.push('[주기 관문·쿨감] 쿨감을 꺼도 라피RH 팀이 빠르다 — 시험이 더는 쿨감 효과를 재지 못한다');
  if (!S(['Tia', 'Emma: Tactical Upgrade', 'Mast: Romantic Maid', 'Alice', 'Maxwell'])) {
    problems.push('[주기 관문·쿨감] 티아(본인만 쿨감)가 있다고 혼자인 40초 마스트(2버스트) 팀을 느림에서 뺐다');
  }
}

// --- D3(버프가 비는 멤버 0점)는 지원형 시전자만 · 받는 쪽은 공격형 또는 3버스트 (2026-10-01, lib/buffTargets.js) ---
// 레이드 등록 팀에서 메이든 : 아이스 로즈가 든 11팀 전부 다른 전격 공격형 없이 아니스:SS·목단과 쓴다. 그 구성을 0점으로 만들면 안 된다.
{
  const team = ['Anis: Sparkling Summer', 'Ade: Agent Bunny', 'Moran', 'Maiden: Ice Rose', 'Privaty'].map((n) => byTitle.get(n));
  if (team.some((c) => !c)) problems.push('[D3 범위] 시험용 이름이 DB에 없다');
  else {
    const now = engine.scoreTeam(team, 'bossing', { bossElement: 'Electronic' });
    globalThis.__NIKKE_D3_ALL_CLASSES = true; globalThis.__NIKKE_RECEIVER_ATTACKER_ONLY = true;
    const old = engine.scoreTeam(team, 'bossing', { bossElement: 'Electronic' });
    globalThis.__NIKKE_D3_ALL_CLASSES = false; globalThis.__NIKKE_RECEIVER_ATTACKER_ONLY = false;
    if (!(old.tierTotal < now.tierTotal)) problems.push('[D3 범위] 옛 규칙에서도 이 등록 팀 점수가 안 깎인다 — 시험이 더는 그 고장을 재현하지 못한다');
    if (now.tierTotal < old.tierTotal) problems.push('[D3 범위] 등록 팀(아니스SS·목단·메이든IR)에서 누군가가 버프 대상 없음으로 0점이 됐다');
  }
}

// --- 쿨타임이 같으면 버스트에 기대는 값이 큰 쪽이 버스트한다 (2026-10-01) ---
// 에이다(SSS·버스트 밖 비율 0.23)·네온:VE(S·0.38)·앨리스(S·0.88)가 같은 B3·같은 쿨이면 쉬는 자리(표시 순서 마지막 B3)는 앨리스여야 한다.
// 옛 순서(티어 → id)면 네온이 쉬었다 — 팀 값이 4점 가까이 깎였다(블라인드 판정 씨앗 11 B06).
{
  const team = ['Dorothy', 'Prika', 'Ada Wong', 'Neon: Vision Eye', 'Alice'].map((n) => byTitle.get(n));
  if (team.some((c) => !c)) problems.push('[쉬는 B3 선택] 시험용 이름이 DB에 없다');
  else {
    const last = (o) => o.filter((m) => String(m.burst) === '3').slice(-1)[0]?.title;
    // 에이다는 토템이라 "토템이 먼저 쉰다"(아래 절)가 앞선다 — 여기서는 비율 정렬만 보려고 그 규칙을 양쪽 다 끈다.
    globalThis.__NIKKE_TOTEM_REST_OFF = true;
    const now = last(engine.orderMembersForDisplay(team, 'tribe_tower', new Set()));
    globalThis.__NIKKE_OFF_BURST_OFF = true;
    const old = last(engine.orderMembersForDisplay(team, 'tribe_tower', new Set()));
    globalThis.__NIKKE_OFF_BURST_OFF = false;
    globalThis.__NIKKE_TOTEM_REST_OFF = false;
    if (old === 'Alice') problems.push('[쉬는 B3 선택] 옛 순서에서도 앨리스가 쉰다 — 시험이 더는 그 경우를 재현하지 못한다');
    if (now !== 'Alice') problems.push(`[쉬는 B3 선택] 버스트에 덜 기대는 앨리스가 아니라 ${now}가 쉰다`);
  }
}

const line = '─'.repeat(88);
console.log(line);
console.log(`등록된 실사용 조합으로 우리 규칙 검증 — ${teams.length}건`);
console.log(line);
console.log('출처          조합수   체인 불성립   실사용 경로 미도달   (참고) 20초 순환 아님');
for (const [src, s] of stats) {
  console.log(`${src.padEnd(12)} ${String(s.n).padStart(5)}   ${String(s.invalid).padStart(7)}건   ` +
    `${String(s.unreachable).padStart(13)}건        ` +
    `${String(s.cyc.slow).padStart(4)}건 (${Math.round(s.cyc.slow / s.n * 100)}%)`);
}
console.log(line);
console.log('※ 오른쪽 "20초 순환 아님"은 참고 지표다 — 판정하지 않는다.');
console.log('  PvP와 솔로레이드는 20초 주기를 전제하지 않는 판이라 여기 걸려도 정상이다.');
console.log(line);

if (problems.length) {
  console.log(`문제 ${problems.length}건 — 우리 데이터가 틀렸거나, 우리 규칙이 틀렸다\n`);
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log('');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
console.log('문제 0건 — 실제로 쓰인 조합이 전부 우리 규칙에서도 성립한다\n');
fs.rmSync(tmp, { recursive: true, force: true });
