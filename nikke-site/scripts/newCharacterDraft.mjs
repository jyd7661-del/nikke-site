#!/usr/bin/env node
/**
 * **새 캐릭터 초안** — docs/new-character.md 1~3·8단계의 조사를 한 번에 한다. 데이터 파일은 **안 고친다.** (2026-09-27)
 *
 *   node scripts/newCharacterDraft.mjs --slug=guilty-mighty-bunny [--control=drake]
 *
 * 출력: 필드마다 값과 출처, 그리고 "확인 필요" 목록. 초안 JSON은 characterDatabase.json 항목 모양이다(skills는 빈 배열 —
 * 스킬은 refreshSkills* 3종으로 채운다). 2026-09-24 길티 : 마이티 바니를 넣을 때 손으로 한 조사를 굳혔다.
 *
 * ■ 지킨 함정(docs/new-character.md)
 *   · prydwen 값은 **"slug"를 품은 객체를 중괄호 짝으로 잘라** 그 안에서 읽는다(페이지에 남의 카드가 박혀 있다).
 *     대조군(--control, 기본 drake)을 같은 방식으로 읽어 우리 DB와 맞는지 먼저 확인한다 — 틀리면 추출기가 고장이다
 *   · 태그는 티어표에서 이름 **뒤**의 tag-container. 기존 캐릭터 전원으로 **역검증**하고 불일치가 있으면 태그를 믿지 않는다
 *   · 이미지 경로는 팬덤 위키 imageinfo API가 준 URL 그대로(해시 경로를 추측하지 않는다)
 *   · name_kr은 나무위키 **문서명**(괄호 앞 공백 없음). 후보 몇 개를 시험해 200인 것만 쓴다
 *   · name_ja는 game8 티어표 링크 텍스트. game8은 간헐 503이라 재시도한다
 *   · 출시일은 prydwen에 없다 — game8 가챠 기간·나무위키 출시일을 사람이 대조한다(여기선 나무위키 값만 뽑아 보여 준다)
 * ■ robots: prydwen·game8(Claude-User 허용)·나무위키(공식 스킬·프로필 칸만)·팬덤 위키. nikke.gg는 쓰지 않는다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const SLUG = arg('slug', null);
const CONTROL = arg('control', 'drake');
if (!SLUG) { console.error('사용법: --slug=<prydwen slug> [--control=<기존 캐릭터 id>]'); process.exit(1); }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const curl = (url, extra = []) => { try { return execFileSync('curl', ['-sS', '--compressed', '-A', UA, '-L', '--max-time', '40', ...extra, url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch { return ''; } };
const code = (url) => { try { return execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-A', UA, '-L', '--max-time', '30', url], { encoding: 'utf8' }); } catch { return '000'; } };
const sleep = (ms) => execFileSync('sleep', [String(ms / 1000)]);
const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const todo = [];

// ── prydwen: slug 객체 단위로 읽기 ──
const CACHE = path.join(os.tmpdir(), 'prydwen-cache');
fs.mkdirSync(CACHE, { recursive: true });
function pryPage(slug) {
  const f = path.join(CACHE, slug + '.html');
  if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 86400000) return fs.readFileSync(f, 'utf8');
  const h = curl('https://www.prydwen.gg/nikke/characters/' + slug);
  if (h.includes('rating_story')) fs.writeFileSync(f, h);
  return h;
}
function pryObj(slug) {
  const s = pryPage(slug).replace(/\\"/g, '"');
  const needle = `"slug":"${slug}"`;
  for (let i = s.indexOf(needle); i >= 0; i = s.indexOf(needle, i + 1)) {
    let d = 0, st = -1;
    for (let k = i; k >= 0; k--) { if (s[k] === '}') d++; else if (s[k] === '{') { if (d === 0) { st = k; break; } d--; } }
    let e = st, dd = 0;
    for (; e < s.length; e++) { if (s[e] === '{') dd++; else if (s[e] === '}') { dd--; if (dd === 0) break; } }
    const o = s.slice(st, e + 1);
    if (o.includes('rating_story')) {
      const g = (k) => { const m = o.match(new RegExp(`"${k}"\\s*:\\s*("([^"]*)"|null)`)); return m ? (m[2] ?? null) : null; };
      return { name: g('name'), story: g('rating_story'), boss: g('rating_boss'), pvp: g('rating_pvp'), burst: g('burst_type'), weapon: g('weapon'), element: g('element'), cls: g('class'), manufacturer: g('manufacturer'), rarity: g('rarity') };
    }
  }
  return null;
}
const lower = (v) => (v ? String(v).toLowerCase() : v);
const BURST = { I: '1', II: '2', III: '3' };
const ctl = pryObj(CONTROL); const ours = cdb.find((c) => c.id === CONTROL);
const ctlOk = ctl && ours && ctl.story === ours.tiers.story && ctl.boss === ours.tiers.bossing && ctl.pvp === ours.tiers.pvp && BURST[ctl.burst] === String(ours.burst);
console.log(`■ 대조군 ${CONTROL}: ${ctlOk ? '✅ 우리 DB와 일치 — 추출기 정상' : '❌ 불일치 — 추출기를 믿지 말 것'}`);
if (!ctlOk) process.exit(1);
const p = pryObj(SLUG);
if (!p) { console.error(`❌ prydwen에서 ${SLUG}의 캐릭터 객체를 못 찾았다`); process.exit(1); }
const rated = p.story && p.boss && p.pvp;
if (!rated) todo.push('prydwen 티어가 아직 없다 — **추가하지 않는다**(docs/new-character.md 0장). 값을 지어내지 말 것');

// ── 태그: 티어표, 이름 뒤 tag-container, 역검증 ──
const tl = curl('https://www.prydwen.gg/nikke/tier-list');
const tags = new Map();
for (const m of tl.matchAll(/emp-name">([^<]*)<\/span>([\s\S]*?)(?=emp-name">|$)/g)) {
  const name = m[1].replace(/&amp;/g, '&'); if (tags.has(name)) continue;
  const c = m[2].match(/<div class="tag-container[^"]*">([\s\S]*?)<\/div>/);
  tags.set(name, c ? [...new Set([...c[1].matchAll(/class="new-tag ([a-z-]+)/g)].map((x) => x[1]))].sort() : []);
}
let agree = 0, disagree = 0;
for (const c of cdb) { if (!tags.has(c.title)) continue; const a = [...(c.prydwenTags || [])].sort().join(','); if (a === tags.get(c.title).join(',')) agree++; else disagree++; }
const myTags = tags.get(p.name);
console.log(`■ 태그 추출 역검증: 일치 ${agree} · 불일치 ${disagree}${disagree ? ' ⚠️ 태그를 믿지 말 것' : ''}`);
if (disagree) todo.push('태그 추출기 역검증 불일치 — prydwenTags를 손으로 확인');
if (!myTags) todo.push('티어표에서 이 캐릭터 카드를 못 찾았다 — prydwenTags 확인 필요');

// ── 이미지: 팬덤 위키 imageinfo ──
const fileName = `${p.name.replace(/:\s*/g, ' ').replace(/\s+/g, '_')}_MI.png`;
const ii = curl('https://nikke-goddess-of-victory-international.fandom.com/api.php', ['-G', '--data-urlencode', 'action=query', '--data-urlencode', `titles=File:${fileName}`, '--data-urlencode', 'prop=imageinfo', '--data-urlencode', 'iiprop=url', '--data-urlencode', 'format=json']);
const imgUrl = (ii.match(/"url":"([^"]+)"/) || [])[1];
const img = imgUrl ? (imgUrl.match(/\/images\/(.+?)\/revision/) || [])[1] : null;
if (!img) todo.push(`초상화 ${fileName}가 팬덤 위키에 아직 없다 — img를 비워 둔다(8단계)`);

// ── 나무위키 문서명 · 출시일 · 스쿼드(프로필 칸만) ──
const krGuess = arg('kr', null);
const krCands = krGuess ? [krGuess] : [];
if (!krGuess) todo.push('한국어 이름 후보를 --kr="길티 : 마이티 바니"처럼 넘기면 나무위키 문서명을 확인한다');
let nameKr = null, releaseKr = null, squadKr = null;
for (const t of krCands) {
  const html = curl('https://namu.wiki/w/' + encodeURIComponent(t));
  if (!html || !/<title>/.test(html) || /문서가 없습니다|404/.test((html.match(/<title>([^<]*)/) || [])[1] || '')) continue;
  const txt = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, '\n').split('\n').map((x) => x.trim()).filter(Boolean);
  const at = (label) => { const i = txt.indexOf(label); return i >= 0 ? txt[i + 1] : null; };
  if (code('https://namu.wiki/w/' + encodeURIComponent(t)) === '200') { nameKr = t; releaseKr = at('출시일'); squadKr = at('스쿼드'); break; }
}
if (krCands.length && !nameKr) todo.push('나무위키 문서명을 못 찾았다 — 괄호 앞 공백·콜론 표기를 바꿔 시험');

// ── game8 표기 (티어표 링크) ──
let nameJa = null, game8Url = null;
for (let tries = 0; tries < 4 && !nameJa; tries++) {
  const g = curl('https://game8.jp/nikke/492712');
  if (g.length < 1000) { sleep(20000); continue; }
  const parts = p.name.split(':').map((x) => x.trim());
  const ms = [...g.matchAll(/href="(?:https:\/\/game8\.jp)?\/nikke\/(\d+)"[^>]*>([^<]{2,40})</g)];
  // 영문 이름으로 직접 못 찾으므로, 우리 DB에 없는 game8 이름 중 기존 본체의 일본어 이름으로 시작하는 것을 후보로 보여 준다
  const base = cdb.find((c) => c.title === parts[0]);
  const known = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'game8PageMap.json'), 'utf8'))));
  const cands = [...new Map(ms.map((m) => [m[2].trim(), m[1]])).entries()].filter(([n]) => !known.has(n) && base?.name_ja && n.startsWith(base.name_ja + '：'));
  if (cands.length === 1) { [nameJa, game8Url] = [cands[0][0], `https://game8.jp/nikke/${cands[0][1]}`]; }
  else if (cands.length > 1) todo.push(`game8 후보가 여러 개 — ${cands.map(([n, id]) => `${n}(${id})`).join(', ')}`);
  break;
}
if (!nameJa) todo.push('game8 일본어 표기를 자동으로 못 찾았다 — 티어표(game8.jp/nikke/492712)에서 링크를 찾아 game8PageMap에 넣을 것');
todo.push('출시일은 game8 가챠 페이지(game8.jp/nikke/492016) 開催期間으로 나무위키 값과 대조할 것');
todo.push('squad 영문은 game8 部隊 → data/squadNames.json 역조회로만(번역 금지)');

const draft = {
  id: SLUG, title: p.name, name_kr: nameKr, name_ja: nameJa,
  class: lower(p.cls), burst: BURST[p.burst] || p.burst, element: lower(p.element), weapon: lower(p.weapon),
  manufacturer: lower(p.manufacturer), rarity: String(p.rarity || '').toUpperCase(), squad: null,
  releaseDate: null, ...(img ? { img } : {}),
  tiers: rated ? { story: p.story, bossing: p.boss, pvp: p.pvp } : null,
  ...(myTags && myTags.length && !disagree ? { prydwenTags: myTags } : {}),
  skills: [],
};
console.log('\n■ 초안 (characterDatabase.json 항목 모양)');
console.log(JSON.stringify(draft, null, 2));
console.log('\n■ 출처');
console.log(`  prydwen: https://www.prydwen.gg/nikke/characters/${SLUG}`);
if (nameKr) console.log(`  나무위키: 문서명 "${nameKr}" · 출시일 ${releaseKr || '?'} · 스쿼드 ${squadKr || '?'}`);
if (game8Url) console.log(`  game8: ${nameJa} ${game8Url}`);
if (img) console.log(`  이미지: ${imgUrl}`);
console.log('\n■ 확인 필요');
todo.forEach((t) => console.log('  - ' + t));
console.log('\n다음: docs/new-character.md 4단계부터(characterDatabase·game8PageMap·characters.js → 스킬 3종 → 검사·빌드). /new-character 참고');
