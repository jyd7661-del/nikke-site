#!/usr/bin/env node
/**
 * **AI 조합 구성의 구조화 출력 스키마가 API가 받는 모양인가** — 2026-09-21.
 *
 *   node scripts/testAiTeamSchema.mjs
 *
 * ■ 이 검사가 막으려는 고장 (실제로 일어났다)
 *   2026-09-15에 AI 조합 구성 코드를 넣고 `AI_TEAMS_MODE=off`로 배포했다. 2026-09-21에 shadow로
 *   켜 보니 **모든 호출이 400**이었다:
 *     output_config.format.schema: For 'array' type, 'minItems' values other than 0 or 1 are not supported
 *   `members: { minItems: 5, maxItems: 5 }`가 원인이었다. 구조화 출력은 배열 minItems를 0·1만 받는다.
 *
 *   무서운 부분은 증상이 없다는 것이다 — 라우트는 실패하면 조용히 엔진 답으로 넘어간다.
 *   화면도 멀쩡하고, 비용도 안 나가고, shadow 표도 안 쌓인다. **켜 보기 전에는 아무도 모른다.**
 *   그래서 API를 안 부르고도 알 수 있는 것(스키마 모양)만이라도 여기서 못 박는다.
 *
 * ■ 무엇을 보는가 (돈 안 드는 정적 검사)
 *   1. 배열에 minItems > 1 / maxItems 가 없다
 *   2. "정확히 5명"을 강제하는 쪽은 검산기다 — verifyAiTeam이 4명·6명을 잡는가(역테스트)
 *   3. 스키마가 요구하는 필드(members·reasoning)를 프롬프트도 요구하는가
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// lib은 '@/data/…' 별칭을 쓴다. 순수 node로 부르려면 바꿔치기한다(testTraffic.mjs와 같은 방식).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-aischema-'));
const fix = (src) => src
  .replace(/from '(?:@\/|\.\.\/)data\/([\w.]+)\.json';/g, (_, n) =>
    `from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'data', `${n}.json`)).href)} with { type: 'json' };`)
  .replace(/from '(?:@\/lib|\.)\/(\w+)(?:\.js)?';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(path.join(tmp, `${n}.mjs`)).href)};`);
for (const f of ['aiTeamPrompt', 'aiTeamVerify']) {
  fs.writeFileSync(path.join(tmp, `${f}.mjs`), fix(fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8')));
}
const { OUTPUT_SCHEMA, systemPrompt } = await import(pathToFileURL(path.join(tmp, 'aiTeamPrompt.mjs')).href);
const { verifyAiTeam } = await import(pathToFileURL(path.join(tmp, 'aiTeamVerify.mjs')).href);

const fails = [];
const check = (name, cond, detail = '') => { if (!cond) fails.push(`${name}${detail ? ` — ${detail}` : ''}`); };

// 1. API가 거부하는 제약이 없는가 — 배열의 minItems는 0·1만, maxItems는 지원 안 함.
const offenders = [];
(function walk(node, at) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'array') {
    if (node.minItems !== undefined && node.minItems > 1) offenders.push(`${at}.minItems=${node.minItems}`);
    if (node.maxItems !== undefined) offenders.push(`${at}.maxItems=${node.maxItems}`);
  }
  for (const [k, v] of Object.entries(node)) walk(v, `${at}.${k}`);
})(OUTPUT_SCHEMA, 'schema');
check('구조화 출력이 받는 배열 제약만 쓴다', offenders.length === 0,
  `${offenders.join(', ')} — 구조화 출력은 배열 minItems를 0·1만 받고 maxItems는 안 받는다. 인원 수는 검산기가 본다`);

// 2. 그러면 "정확히 5명"은 누가 지키나 — 검산기가 지켜야 한다(역테스트).
const roster = ['A', 'B', 'C', 'D', 'E', 'F'].map((t, i) => ({
  id: `x${i}`, title: t, name_kr: t, class: 'attacker', element: 'fire', weapon: 'ar',
  burst: String((i % 3) + 1), skills: [],
}));
const five = ['A', 'B', 'C', 'D', 'E'];
const flawsOf = (members) => verifyAiTeam(members, roster, {}).flaws.join(' | ');
check('검산기가 4명을 잡는다', /Exactly 5/i.test(flawsOf(five.slice(0, 4))), flawsOf(five.slice(0, 4)));
check('검산기가 6명을 잡는다', /Exactly 5/i.test(flawsOf([...five, 'F'])), flawsOf([...five, 'F']));
check('검산기가 중복을 잡는다', verifyAiTeam(['A', 'A', 'B', 'C', 'D'], roster, {}).flaws.length > 0);
check('검산기가 로스터 밖 이름을 잡는다', verifyAiTeam(['A', 'B', 'C', 'D', 'ZZZ'], roster, {}).flaws.length > 0);
check('멀쩡한 5명은 통과한다', verifyAiTeam(five, roster, {}).ok, flawsOf(five));

// 3. 스키마가 요구하는 필드를 **라우트가 실제로 읽는가.** 한쪽만 바뀌면 파싱이 조용히 빈다
//    (필드 이름은 프롬프트 문장이 아니라 스키마로 모델에 전달된다 — 프롬프트 본문에는 없다).
const routeSrc = fs.readFileSync(path.join(ROOT, 'app', 'api', 'ai-recommend', 'route.js'), 'utf8');
for (const field of OUTPUT_SCHEMA.required) {
  check(`라우트가 out?.${field}를 읽는다`, routeSrc.includes(`out?.${field}`));
}
// 프롬프트가 인원 수를 말해 주는가 — 스키마에서 minItems를 뺐으니 이 문장이 유일한 사전 안내다.
const sys = systemPrompt(roster, { variant: 'tier' });
check('프롬프트가 "exactly 5"를 말한다', /exactly 5/i.test(sys));

// 4. 모델이 안 받는 파라미터를 보내지 않는가 (2026-09-21 shadow 실측).
//    스키마를 고치자 다음 400이 나왔다: "`temperature` is deprecated for this model."
//    결정성은 temperature가 아니라 ai_team_cache가 만든다. 다시 넣으면 또 전부 400이 되는데
//    화면에는 증상이 없다(조용히 엔진 답으로 넘어간다) — 그래서 소스에서 못 박는다.
const teamCall = routeSrc.slice(routeSrc.indexOf('const msg = await client.messages.create('), routeSrc.indexOf('output_config'));
check('AI 조합 호출에 temperature가 없다', !/temperature\s*:/.test(teamCall), teamCall.match(/temperature[^,]*/)?.[0] || '');

const line = '─'.repeat(78);
console.log(line);
console.log('AI 조합 구성 — 구조화 출력 스키마 검사');
console.log(line);
if (fails.length) {
  console.log(`❌ 실패 ${fails.length}건`);
  fails.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
  process.exitCode = 1;
} else {
  console.log(`문제 0건 — 스키마에 API가 거부하는 제약 없음 · 인원 수는 검산기가 강제(4·6·중복·미보유 전부 잡힘)`);
}
console.log(line);
fs.rmSync(tmp, { recursive: true, force: true });
