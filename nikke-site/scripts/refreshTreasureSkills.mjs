#!/usr/bin/env node
/**
 * 애장품(Treasure) 스킬 원문을 prydwen "<id>-treasure" 캐릭터 페이지에서 그대로 옮긴다 → data/treasureSkills.json (A등급)
 *
 *   node scripts/refreshTreasureSkills.mjs           # treasureEffects.json에 있는 캐릭터 전부
 *   node scripts/refreshTreasureSkills.mjs moran     # 하나만
 *
 * ■ 왜 필요한가 (2026-10-01)
 *   treasureEffects.json의 설명(2026-08-07)을 원문 없이 손으로 요약했더니 틀렸다 — 목단 1스킬 "Fervor: 본인 버스트 ▼20초 상시"를 빠뜨렸고,
 *   츠바이는 애장품이 크리티컬 확률을 올려 주는데 "크리티컬이 부족해진다"고 적었다(유저 지적: "애장품은 기존 스킬에 효과가 하나 더 붙거나
 *   스킬이 강화되는 방식"). 원문을 데이터로 두면 checkData가 ① 설명 속 숫자가 원문에 있는지 ② 애장품 쿨감이 burstCdr.json에 있는지 잰다.
 *
 * ■ 페이지만 읽는다(prydwen도 우리 다른 수집기처럼 화면만 긁는다). ⚠️ Node 내장 fetch는 prydwen에서 항상 403 — TLS 지문 차이라
 *   curl + 크롬 UA를 쓴다(refreshSkillsFromPrydwen.mjs와 같은 이유, 2026-10-01 이 스크립트도 처음에 fetch로 짜서 17건 전부 403).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'treasureSkills.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const ids = process.argv[2]
  ? process.argv.slice(2)
  : JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'treasureEffects.json'), 'utf8')).characters.map((c) => c.characterId);

const decode = (s) => s
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#0?39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ');

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { characters: [] };
const byId = new Map(prev.characters.map((c) => [c.characterId, c]));
let failed = 0;
for (const id of ids) {
  const url = `https://www.prydwen.gg/nikke/characters/${id}-treasure`;
  const raw = execFileSync('curl', ['-sS', '--compressed', '-A', UA, '-H', 'Accept-Language: en', '-w', '\n__HTTP_CODE__%{http_code}', url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const code = raw.match(/\n__HTTP_CODE__(\d{3})$/)?.[1];
  if (code !== '200') { console.error(`✗ ${id}: HTTP ${code}`); failed++; continue; }
  const html = raw.slice(0, raw.lastIndexOf('\n__HTTP_CODE__'));
  if (html.includes('Character Not Found')) { console.error(`✗ ${id}: 주소 없음(soft 404)`); failed++; continue; }
  const t = decode(html);
  const a = t.indexOf('Skill 1 ');
  const b = t.indexOf('Specialties', a);
  if (a < 0 || b < 0) { console.error(`✗ ${id}: 스킬 구역을 못 찾음 — 페이지 구조가 바뀌었는지 볼 것`); failed++; continue; }
  const seg = t.slice(a, b);
  // "Skill 1 <이름> Passive|Active Cooldown: <cd> Unlocks at: [Phase ]N ■ ..." — 원문 안에 "Burst Skill"이 나와도 끊기지 않게
  // 칸 머리말(이름 + Cooldown + Unlocks at)이 붙은 곳에서만 자른다. ⚠️ 이름에 '.'·'■'를 허용하면 "Fills Burst Gauge by 14.31%. Skill 2 …"가
  // 통째로 '이름'이 되어 앞 칸 끝이 잘렸다(헬름 게이지 14.31%·목단 7.48초가 원문에서 빠짐 — checkData TREASURE_NUM_UNSOURCED가 잡았다).
  const head = /(Skill 1|Skill 2|Burst) ([^■.]{1,60}?) (Passive|Active) Cooldown: (\S+(?: s)?) Unlocks at: (?:Phase )?(\d)/g;
  const marks = [...seg.matchAll(head)];
  if (marks.length !== 3) { console.error(`✗ ${id}: 스킬 칸 ${marks.length}개(3이어야 한다)`); failed++; continue; }
  const skills = marks.map((m, i) => ({
    slot: ['Skill 1', 'Skill 2', 'Burst'][i],   // 페이지 표기가 가끔 틀린다(토브 버스트가 "Skill 1") — 순서로 정한다
    name: m[2].trim(),
    type: m[3],
    cooldown: m[4] === '-' ? null : Number(m[4].replace(/ s$/, '')),
    phase: Number(m[5]),
    text: seg.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).replace(/^\s*■\s*/, '').replace(/\s*■\s*/g, ' ■ ').trim(),
  }));
  byId.set(id, { characterId: id, source: url, skills });
  console.log(`✓ ${id}: ${skills.map((s) => `${s.slot}(${s.phase}단계${s.cooldown ? ' ' + s.cooldown + '초' : ''})`).join(' · ')}`);
}
const out = {
  _doc: '애장품 스킬 원문(prydwen "<id>-treasure" 페이지, A등급). scripts/refreshTreasureSkills.mjs가 만든다 — 손으로 고치지 말 것. phase = 그 칸이 바뀌는 애장품 단계. treasureEffects.json의 설명은 이 원문과 characterDatabase 기본 스킬의 차이로 쓴다(checkData TREASURE_NUM_UNSOURCED).',
  fetchedOn: new Date().toISOString().slice(0, 10),
  characters: [...byId.values()].sort((x, y) => x.characterId.localeCompare(y.characterId)),
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`→ ${path.relative(ROOT, OUT)} (${out.characters.length}명)${failed ? ` · 실패 ${failed}` : ''}`);
process.exit(failed ? 1 : 0);
