#!/usr/bin/env node
/**
 * characterDatabase.json 의 스킬(name/type/cd/desc)을 prydwen.gg 에서 다시 받아온다.
 *
 * 왜 만들었나 (2026-08-13):
 * 도감 196페이지가 "출처: prydwen.gg 티어리스트"라고 적어놓고 **낡은 수치**를 보여주고 있었다.
 *
 *   노이즈 Chorus  우리 5.86%  /  prydwen 현재 10.66%  /  나무위키(10레벨) 10.66%
 *   크라운 One for All ATK▲  우리 40.32%  /  prydwen 64.51%  /  나무위키 64.51%
 *
 * 원인은 **스킬 레벨 기준**이다. 니케 스킬 수치는 레벨 1→10으로 선형 증가하는데
 * (5.86 / 6.4 / 6.93 / 7.46 / 8.0 / 8.53 / 9.06 / 9.59 … 10레벨 10.66),
 * 우리 데이터는 레벨 1 기준이고 prydwen 현재 표시는 레벨 10 기준이다.
 * 표본 8명 전부 불일치했다(15개 값 중 0개 발견).
 *
 * 에러 없이 조용히 틀린 값을 보여주던 유형이라 가장 위험하다(CLAUDE.md 원칙 3).
 * 여기서 가져오는 값은 1차 출처를 그대로 옮기는 A등급이므로 자동 반영 대상이다.
 *
 * 사용법:
 *   node scripts/refreshSkillsFromPrydwen.mjs            # 미리보기(파일 안 건드림)
 *   node scripts/refreshSkillsFromPrydwen.mjs --write    # 실제 반영
 *   node scripts/refreshSkillsFromPrydwen.mjs --only noise,crown
 *
 * 주의:
 * - prydwen은 연속 요청에 403을 낸다. 간격과 재시도가 필요하다(아래 SLEEP/RETRY).
 * - 받은 HTML은 캐시에 저장해 재실행 시 다시 받지 않는다. 캐시는 저장소 밖(OS 임시 폴더)에 둔다.
 * - **한 명이라도 실패하면 그 캐릭터는 건드리지 않는다.** 실패를 빈 값으로 덮으면
 *   그게 바로 "조용한 누락"이 된다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(ROOT, 'data', 'characterDatabase.json');
const FRESH_PATH = path.join(ROOT, 'data', 'dataFreshness.json');
const CACHE_DIR = path.join(os.tmpdir(), 'prydwen-cache');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const SLEEP_MS = 2500; // 403을 피하기 위한 요청 간격
const RETRY = 4;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const onlyArg = args.find((a) => a.startsWith('--only'));
const ONLY = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 우리 id ≠ prydwen 슬러그인 10명. 2026-08-13 실측으로 채웠다.
// prydwen은 없는 캐릭터에도 **HTTP 200으로 "Character Not Found" 페이지**를 주기 때문에
// 404로 걸러지지 않는다. 그래서 이 표가 없으면 그냥 "파싱 실패"로 조용히 빠진다.
// 대부분 알트가 「수식어-이름」 순서로 뒤집혀 있다(anis-sparkling-summer ↔ sparkling-summer-anis).
const SLUG_OVERRIDE = {
  'anne-miracle-fairy': 'miracle-fairy-anne',
  'rupee-winter-shopper': 'winter-shopper-rupee',
  'mary-bay-goddess': 'bay-goddess-mary',
  'neon-blue-ocean': 'blue-ocean-neon',
  'anis-sparkling-summer': 'sparkling-summer-anis',
  'helm-aquamarine': 'aqua-marine-helm',
  'eh': 'e-h',
  'snow-white-innocent-days': 'innocent-dayss-snow-white', // prydwen 쪽 슬러그 오타('dayss')가 그대로 주소다
  'asuka-wille': 'asuka-shikinami-langley-wille',
  'little-mermaid': 'siren', // prydwen은 리틀 머메이드를 Siren으로 부른다 (docs/open-items.md 별칭 항목)
};

// 출처가 망가진 경우 우리 값을 지킨다.
//
// prydwen이 스킬 이름의 그리스 문자를 라틴 글자로 뭉갠 사례가 있다:
//   마나  Metal γ → Metal y,  Metal σ → Metal o
// 그리고 뒤에 의미 없는 숫자가 붙은 사례도 있다:
//   미하라  Highway to Hell → Highway to Hell 1
// 이건 "1차 출처를 그대로 옮긴다"가 아니라 **출처의 사고를 우리가 받아 적는 것**이라
// 데이터가 나빠진다. 기계적으로 판별 가능한 두 경우만 막고, 나머지 이름 변경은 그대로 받는다
// (prydwen이 우리 오타를 고쳐준 것도 많다: Zaitochi→Zatoichi, Disscusion→Discussion, Milage→Mileage).
// 반환값: null | 'mojibake' | 'trailing-number'
//
// **두 유형을 구분해야 한다.** 설명 본문까지 되돌려도 되는 것은 'mojibake' 뿐이다.
// 'trailing-number'는 설명 안에서 그 숫자가 진짜 의미를 갖는다 —
// 미하라 설명은 "Highway to Hell 1: ATK ▲ …", "… during Highway to Hell 1", "Highway to Hell 2: …"
// 처럼 **중첩 단계 이름**으로 쓴다. 여기서 숫자를 지우면 설명이 망가진다(실제로 한 번 그렇게 했다).
function looksCorrupted(oursName, theirsName) {
  if (!oursName || !theirsName || oursName === theirsName) return null;
  // (1) 우리에게 있던 비ASCII 글자가 사라지고 나머지가 같은 모양이면 문자 뭉갬으로 본다
  //     마나 Metal γ → Metal y,  디젤: 윈터 스위츠 La La La ♫ → La La La
  if (/[^\x00-\x7F]/.test(oursName)) {
    const strip = (s) => s.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    if (strip(oursName).length - strip(theirsName).length <= 0 && !/[^\x00-\x7F]/.test(theirsName)) return 'mojibake';
  }
  // (2) 우리 이름 뒤에 " 숫자"만 덧붙은 경우 — 이름만 지키고 설명은 건드리지 않는다
  if (new RegExp(`^${oursName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`).test(theirsName)) return 'trailing-number';
  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// prydwen의 description은 <p>/<b>/<strong>이 섞인 HTML이다. 기존 데이터와 같은 모양으로 되돌린다.
//
// ⚠️ **엔티티를 먼저 풀고 태그를 지운다.** 순서를 반대로 했다가 나유타 버스트 설명에
//    `Bonus Effect<strong> Unlimited ammunition…` 처럼 태그가 그대로 남았다.
//    원문에 `&lt;strong&gt;`가 있으면 태그 제거가 먼저 돌 때는 안 걸리고, 그 뒤에 디코드하면
//    태그로 되살아난다. 그래서 디코드 → 태그 제거 → 한 번 더 디코드 순으로 돈다.
function toPlain(descHtml) {
  let s = decodeEntities(String(descHtml));
  s = s.replace(/<\/p>/gi, ' ').replace(/<[^>]+>/g, '');
  s = decodeEntities(s).replace(/<[^>]+>/g, ''); // 디코드로 되살아난 태그까지 정리
  return s.replace(/■/g, ' ').replace(/\s+/g, ' ').trim();
}

// 화면에 렌더된 스킬 블록에서 slot → 설명 을 뽑는다.
//
// 왜 필요한가: 페이지에 박힌 skills JSON의 description이 **"$56" 같은 다른 행 참조**로
// 들어오는 경우가 있다(Next.js RSC 플라이트 형식). 그대로 받으면 설명 자리에 "$56"이
// 저장되고, 에러도 없이 화면에 그대로 나간다 — 실제로 6명 8건이 그렇게 나갔다(2026-08-13,
// 신데렐라: 크리스탈 웨이브를 유저가 발견). 렌더된 HTML에는 항상 실제 문장이 들어 있다.
function renderedDescs(html) {
  const map = new Map();
  for (const chunk of html.split('<div class="skill-header">').slice(1)) {
    const slot = (chunk.match(/^<div class="skill-icon[^"]*">([^<]*)</) || [])[1];
    const desc = (chunk.match(/class="skill-description[^"]*">([\s\S]*?)<\/div>/) || [])[1];
    if (slot && desc != null) map.set(slot.trim(), toPlain(desc));
  }
  return map;
}

async function getHtml(id) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, `${id}.html`);
  if (fs.existsSync(cached)) return { html: fs.readFileSync(cached, 'utf8'), fromCache: true };

  // ⚠️ Node 내장 fetch(undici)는 prydwen에서 **항상 403**이 난다. 같은 URL·같은 User-Agent로
  //    curl은 200이 떨어진다(실측 2026-08-13). 요청 빈도 문제가 아니라 TLS/HTTP 지문 차이다.
  //    그래서 여기서는 curl을 쓴다. fetch로 바꾸지 말 것.
  const url = `https://www.prydwen.gg/nikke/characters/${SLUG_OVERRIDE[id] || id}`;
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= RETRY; attempt++) {
    try {
      const out = execFileSync(
        'curl',
        ['-sS', '--compressed', '-A', UA, '-w', '\n__HTTP_CODE__%{http_code}', url],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
      );
      const m = out.match(/\n__HTTP_CODE__(\d{3})$/);
      const code = m ? m[1] : '000';
      const html = m ? out.slice(0, m.index) : out;
      if (code === '200') {
        // ⚠️ prydwen은 없는 주소에도 200을 준다. 이걸 캐시에 넣으면 다시 돌려도 계속 실패한다.
        if (html.includes('Character Not Found')) {
          lastErr = '주소 없음(soft 404) — SLUG_OVERRIDE 확인 필요';
          break;
        }
        fs.writeFileSync(cached, html);
        return { html, fromCache: false };
      }
      lastErr = `HTTP ${code}`;
      if (code === '404') break; // 없는 페이지는 재시도 무의미
    } catch (e) {
      lastErr = e.message;
    }
    await sleep(SLEEP_MS * attempt * 2); // 지수적 백오프
  }
  throw new Error(lastErr);
}

// 페이지에 박혀 있는 JSON 조각에서 skills 배열을 꺼낸다.
// 화면 HTML(class="skill-description")보다 이쪽이 구조가 안정적이다.
function parseSkills(html) {
  const key = '\\"skills\\":';
  const start = html.indexOf(key);
  if (start === -1) return null;
  const tail = html.slice(start + key.length);

  // 배열의 끝을 찾는다. 대괄호는 설명 문장 안에도 나올 수 있으므로 **문자열 안은 세지 않는다.**
  // 이 단계의 문자열 구분자는 \" 두 글자다.
  let i = 0, depth = 0, inStr = false, end = -1;
  while (i < tail.length) {
    if (tail.startsWith('\\\\', i)) { i += 2; continue; } // 이스케이프된 백슬래시
    if (tail.startsWith('\\"', i)) { inStr = !inStr; i += 2; continue; }
    if (!inStr) {
      if (tail[i] === '[') depth++;
      else if (tail[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    i++;
  }
  if (end === -1) return null;

  // ⚠️ 이스케이프를 손으로 풀지 말 것. 예전에 \" → " 를 먼저 바꾸고 \\n 을 나중에 바꿨다가
  //    `...10 sec.</b>\\n</p>` 의 백슬래시가 하나 남아 노이즈만 파싱에 실패했다.
  //    이 조각은 "JSON 문자열 안에 든 JSON"이므로 **두 번 파싱**하면 전부 정확히 풀린다.
  let arr;
  try { arr = JSON.parse(JSON.parse('"' + tail.slice(0, end) + '"')); } catch { return null; }

  const wanted = arr.filter((s) => /^(Skill 1|Skill 2|Burst)$/.test(s.slot || ''));
  if (wanted.length !== 3) return null;

  const rendered = renderedDescs(html);
  const parsed = wanted.map((s) => {
    const raw = String(s.description || '');
    // "$56" 처럼 통째로 참조인 경우 렌더된 본문으로 대체한다
    const desc = /^\$[\w-]+$/.test(raw.trim())
      ? (rendered.get(String(s.slot).trim()) || '')
      : toPlain(raw);
    return {
      name: decodeEntities(String(s.name || '')).trim(),
      type: String(s.type || '').trim(),
      cd: s.cooldown ? String(s.cooldown).trim() : 'N/A',
      desc,
    };
  });

  // 설명이 비었거나 아직도 참조/태그가 남아 있으면 **저장하지 않는다.**
  // 빈 값이나 "$56"을 그대로 넣으면 에러 없이 화면에 나가버린다(원칙 §3).
  const broken = parsed.some(
    (s) => !s.name || !s.desc || /^\$[\w-]+$/.test(s.desc) || /<[a-z/]/i.test(s.desc)
  );
  if (broken) return null;
  return parsed;
}

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const chars = Array.isArray(db) ? db : db.characters;
const targets = ONLY ? chars.filter((c) => ONLY.includes(c.id)) : chars;

console.log(`대상 ${targets.length}명 · ${WRITE ? '실제 반영(--write)' : '미리보기'} · 캐시 ${CACHE_DIR}`);
console.log('─'.repeat(72));

const changed = [];
const same = [];
const failed = [];
const kept = []; // 출처가 망가져 우리 이름을 지킨 것
let fetched = 0;

for (const c of targets) {
  let skills = null;
  let err = null;
  try {
    const { html, fromCache } = await getHtml(c.id);
    if (!fromCache) { fetched++; await sleep(SLEEP_MS); }
    skills = parseSkills(html);
    if (!skills) err = '스킬 JSON 파싱 실패';
  } catch (e) {
    err = e.message;
  }

  if (err) { failed.push({ id: c.id, name: c.name_kr, err }); continue; }

  // 출처가 망가진 이름은 우리 값을 남긴다 (수치는 그대로 새 값을 쓴다).
  //
  // ⚠️ 이름만 되돌리면 **설명 본문이 어긋난다.** 스킬 설명은 그 버프를 이름으로 다시 부르는데
  //    (마나: "Metal γ: ATK ▲ …", "Metal γ 상태일 때 …"), prydwen이 뭉갠 "Metal y"가 본문에
  //    그대로 남아 화면에서 제목과 본문이 서로 다른 이름을 쓰게 된다. 실제로 라이브에서 그렇게
  //    나갔다(2026-08-13). 그래서 같은 치환을 **그 캐릭터의 모든 설명에도** 적용한다.
  (c.skills || []).forEach((oursSkill, i) => {
    if (!skills[i]) return;
    const kind = looksCorrupted(oursSkill.name, skills[i].name);
    if (!kind) return;
    const theirs = skills[i].name;
    kept.push({ id: c.id, name: c.name_kr, field: `이름(${kind})`, ours: oursSkill.name, theirs });
    skills[i].name = oursSkill.name;
    if (kind !== 'mojibake') return; // 숫자가 붙은 경우는 설명을 건드리지 않는다
    let n = 0;
    for (const s of skills) {
      if (!s.desc.includes(theirs)) continue;
      n += s.desc.split(theirs).length - 1;
      s.desc = s.desc.split(theirs).join(oursSkill.name);
    }
    if (n) kept.push({ id: c.id, name: c.name_kr, field: `설명 본문 ${n}곳`, ours: oursSkill.name, theirs });
  });

  // 버스트 쿨타임이 비어 온 경우도 우리 값을 남긴다.
  //
  // 버스트 스킬에는 반드시 쿨타임이 있다. prydwen이 가끔 숫자를 빠뜨린 채로 내보내는데
  // (라푼젤: 퓨어 그레이스는 `Cooldown: <span>s</span>` 로 단위만 남아 있었다),
  // 그대로 받으면 cd='N/A'가 되어 **엔진의 findWastedBurstMembers가 그 버스트 단계 판정을
  // 통째로 건너뛴다.** checkData의 SHAPE_BURST_CD가 이걸 ERROR로 잡는다.
  // 나무위키 교차 확인 결과 실제 값은 20초였고 우리 기존 값이 맞았다(2026-08-13).
  {
    const oursBurst = (c.skills || [])[2];
    if (skills[2] && skills[2].cd === 'N/A' && oursBurst && /^\d+(\.\d+)?$/.test(String(oursBurst.cd || ''))) {
      kept.push({ id: c.id, name: c.name_kr, field: '버스트 쿨타임', ours: oursBurst.cd, theirs: 'N/A(출처 누락)' });
      skills[2].cd = String(oursBurst.cd);
    }
  }

  const before = JSON.stringify(c.skills || []);
  const after = JSON.stringify(skills);
  if (before === after) { same.push(c.id); continue; }

  // 이름·개수가 통째로 달라지면 다른 캐릭터를 긁었을 수 있다. 사람이 봐야 한다.
  const nameDrift = (c.skills || []).some((s, i) => skills[i] && s.name !== skills[i].name);
  changed.push({ id: c.id, name: c.name_kr, nameDrift, before: c.skills, after: skills });
  if (WRITE) c.skills = skills;
}

for (const f of failed) console.log(`  ❌ ${f.id} (${f.name}) — ${f.err}`);
if (failed.length) console.log('─'.repeat(72));

console.log(`변경 ${changed.length} / 동일 ${same.length} / 실패 ${failed.length}  (새로 받은 페이지 ${fetched})`);

if (kept.length) {
  console.log(`\n🛡  출처가 망가져 **우리 이름을 그대로 둔 것** ${kept.length}건 (수치·설명은 새 값을 반영함):`);
  for (const k of kept) console.log(`   ${k.id} (${k.name}) ${k.field}  유지: "${k.ours}"   ← prydwen: "${k.theirs}"`);
}

const drift = changed.filter((c) => c.nameDrift);
if (drift.length) {
  console.log(`\n⚠️  스킬 '이름'까지 바뀐 캐릭터 ${drift.length}명 — 수치만 바뀐 게 아니라 사람이 확인할 것:`);
  for (const d of drift.slice(0, 20)) {
    console.log(`   ${d.id} (${d.name})`);
    d.before.forEach((s, i) => console.log(`      [${i}] ${s.name}  →  ${d.after[i] ? d.after[i].name : '(없음)'}`));
  }
}

if (changed.length) {
  const sample = changed[0];
  console.log(`\n예시 — ${sample.id} (${sample.name})`);
  sample.before.forEach((s, i) => {
    const a = sample.after[i];
    if (!a) return;
    console.log(`   [${i}] ${s.name} · cd ${s.cd} → ${a.cd}`);
    console.log(`        before: ${s.desc.slice(0, 100)}`);
    console.log(`        after : ${a.desc.slice(0, 100)}`);
  });
}

if (WRITE) {
  if (failed.length) {
    console.log(`\n※ 실패한 ${failed.length}명은 **건드리지 않았습니다.** 빈 값으로 덮지 않습니다.`);
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n');

  const fresh = JSON.parse(fs.readFileSync(FRESH_PATH, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  fresh.characterSkills = {
    asOf: today,
    source: 'prydwen.gg 캐릭터 페이지에 포함된 skills JSON (name/slot/type/cooldown/description)',
    skillLevelBasis:
      '레벨 10 기준. 2026-08-13 이전 데이터는 레벨 1 기준이어서 표시 수치가 실제와 달랐다 ' +
      '(노이즈 Chorus 5.86% → 10.66%). 다음에 갱신할 때도 prydwen 표시 레벨이 바뀌지 않았는지 확인할 것',
    refreshMethod: 'node scripts/refreshSkillsFromPrydwen.mjs --write',
    staleAfterDays: 60,
  };
  fs.writeFileSync(FRESH_PATH, JSON.stringify(fresh, null, 2) + '\n');
  console.log(`\n✅ ${DB_PATH} 반영 완료 · dataFreshness.characterSkills.asOf = ${today}`);
  console.log('   이제 `npm run verify` 를 돌릴 것.');
} else {
  console.log('\n미리보기였습니다. 반영하려면 --write 를 붙이세요.');
}

if (failed.length) process.exitCode = 1;
