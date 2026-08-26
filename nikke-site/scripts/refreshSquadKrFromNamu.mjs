/**
 * 부대(스쿼드) 이름의 한국어 표기를 나무위키에서 옮겨 온다. (2026-08-25)
 *
 * ■ 왜 필요한가
 *   `characterDatabase.json`의 `squad`는 영문뿐이라, 한국어·일본어 도감 페이지의
 *   "소속 부대" 칸에 `White Knight`가 그대로 나간다. 유저가 지적한 다국어 누출의
 *   마지막 남은 부류다(docs/i18n.md "데이터 다국어" 절).
 *
 *   ⚠️ **지어내지 않는다.** 부대 이름은 게임 안에 공식 한국어 표기가 있으므로
 *      1차 출처에서 옮겨야 A등급이다. 음차로 채우면 B등급이고, 실제로 틀린 것들이 있다
 *      (`Matis`는 '마티스'가 아니라 '마티스'인지 아닌지 우리가 알 수 없다).
 *
 * ■ 이 스크립트의 안전장치 — **부대 하나에 캐릭터가 여럿이라는 사실**
 *   62개 부대에 196명이 나뉘어 있다. 즉 같은 부대의 멤버들에게서 각각 긁은 한국어
 *   이름은 **전부 같아야 한다.** 다르면 문서를 잘못 읽은 것이다.
 *   이 관계가 이 수집의 교차검증이고, 그래서 표본 확인이 아니라 전수를 긁는다.
 *   (docs/data.md의 "화면에 서로를 검증하는 두 열이 있으면 그 관계를 검사로 만든다")
 *
 * ■ 추출 위치
 *   인포박스의 `<strong>스쿼드</strong>` 라벨 셀 다음 `<td>`. 값 뒤에 각주 `[1]`이
 *   붙는 경우가 있어(라피: "전 소속은 09-10F → 스컬 헤드 → …") 각주를 걷어낸다.
 *
 * 사용법:
 *   node scripts/refreshSquadKrFromNamu.mjs            # 긁어서 보고만 한다
 *   node scripts/refreshSquadKrFromNamu.mjs --write    # data/squadNames.json 에 반영
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DB = path.join(ROOT, 'data/characterDatabase.json');
const OUT = path.join(ROOT, 'data/squadNames.json');
const CACHE = path.join(os.tmpdir(), 'namu-cache'); // refreshSkillsKrFromNamu와 같은 캐시를 쓴다
const WRITE = process.argv.includes('--write');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const SLEEP_MS = 700;

// refreshSkillsKrFromNamu.mjs와 같은 표. 거기서 실측으로 확인된 값이다.
const TITLE_OVERRIDE = {
  soline: '솔린',
  'snow-white-innocent-days': '스노우 화이트 : 이노센트 데이즈',
  'quency-escape-queen': '퀀시 : 이스케이프 퀸',
  'guillotine-winter-slayer': '길로틴 : 윈터 슬레이어',
};

fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function fetchNamu(title) {
  const key = path.join(CACHE, `${encodeURIComponent(title).slice(0, 120)}.html`);
  if (fs.existsSync(key)) return { html: fs.readFileSync(key, 'utf8'), cached: true };
  let html;
  try {
    // ⚠️ node fetch는 나무위키에서 403이 난다(TLS 지문 차이). curl로 우회한다.
    html = execFileSync('curl', ['-sS', '--compressed', '-A', UA, '-L', '--max-time', '30',
      `https://namu.wiki/w/${encodeURIComponent(title)}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch { return { html: null, cached: false }; }
  if (!html || html.includes('해당 문서를 찾을 수 없습니다')) return { html: null, cached: false };
  fs.writeFileSync(key, html);
  return { html, cached: false };
}

const decode = (s) => s
  .replace(/&#91;/g, '[').replace(/&#93;/g, ']')
  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

/**
 * 인포박스 '스쿼드' 칸의 값. 못 찾으면 null.
 *
 * ⚠️ 클래스 이름(`ZLfitUXm` 등)은 나무위키 빌드마다 바뀌는 해시라 기대면 안 된다.
 *    라벨 -> 다음 <td> 라는 **구조**로 찾는다.
 */
function extractSquad(html) {
  const label = html.search(/>\s*스쿼드\s*<\/strong>/);
  if (label < 0) return null;
  const tdStart = html.indexOf('<td', label);
  if (tdStart < 0) return null;
  const tdEnd = html.indexOf('</td>', tdStart);
  if (tdEnd < 0) return null;
  let v = html.slice(tdStart, tdEnd);
  // 스포일러 접기(`<details>`)를 먼저 통째로 걷어낸다 — 모리의 칸이 그렇다:
  //   `인큐베이터<details><summary>[UNBREAKABLE SPHERE 이후]</summary><div>올드 테일즈</div></details>`
  // 현재 부대는 접기 **바깥**이고 우리 DB(Incubator)와도 맞는다. 안 걷어내면
  // `인큐베이터 [UNBREAKABLE SPHERE 이후] 올드 테일즈`가 통째로 이름이 된다.
  // 전수 조사 결과 이 형태는 196명 중 1명뿐이다.
  v = v.replace(/<details\b[\s\S]*?<\/details>/g, ' ');
  // ⚠️ `<a>`를 통째로 지우면 안 된다. 지우려는 것은 각주(`<a href="#fn-1">[1]</a>`)뿐인데,
  //    **부대 이름 자체가 링크인 문서가 있다** — 민트·프리카의 `T.T.STAR`가 그렇다.
  //    처음에 전부 지웠더니 이름이 사라지고 괄호 설명 `(Twinkle Twin Star)`만 남았다.
  //    교차검증(같은 부대 멤버끼리 대조)은 **둘 다 같게 틀렸으므로 못 잡았다** —
  //    출력 표본을 눈으로 읽다가 발견했다. href가 각주인 것만 골라 지운다.
  v = v.replace(/<a\b[^>]*href=['"]#fn-[^>]*>[\s\S]*?<\/a>/g, ' ').replace(/<[^>]*>/g, ' ');
  v = decode(v).replace(/\[\d+\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v) return null;
  // 부대를 옮긴 캐릭터는 이력이 함께 적힌다 — 벨벳: `쉐이드 → 메이드 포 유`.
  // **현재 부대는 화살표 뒤**다. 실측으로 확인했고 우리 DB의 squad(Maid For You)와도 맞는다.
  if (v.includes('→')) v = v.split('→').pop().trim();
  // 나무위키가 약칭 뒤에 원어 풀네임을 괄호로 덧붙이는 경우가 있다 —
  // 민트·프리카: `T.T.STAR (Twinkle Twin Star)`. 인포박스에 넣을 것은 **이름**이지
  // 풀이가 아니므로 떼어낸다. 한글이 든 괄호는 이름의 일부일 수 있어 건드리지 않는다.
  v = v.replace(/\s*\(([^)가-힣]*)\)\s*$/, '').trim();
  return v || null;
}

// ---------------------------------------------------------------------------
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const targets = db.filter((c) => c.squad && c.name_kr);
const bySquad = new Map(); // 영문 부대 -> Map(한국어 값 -> [캐릭터 id])
const noPage = [];
const noField = [];
let fetched = 0;

console.log(`나무위키에서 스쿼드 표기 수집 — 대상 ${targets.length}명 / 부대 ${new Set(targets.map((c) => c.squad)).size}종\n`);

for (const c of targets) {
  const titles = TITLE_OVERRIDE[c.id] ? [TITLE_OVERRIDE[c.id]] : [`${c.name_kr}(승리의 여신: 니케)`, c.name_kr];
  let squadKr = null;
  let found = false;
  for (const t of titles) {
    const { html, cached } = fetchNamu(t);
    if (!cached && html) { fetched += 1; sleep(SLEEP_MS); }
    if (!html) continue;
    found = true;
    squadKr = extractSquad(html);
    if (squadKr) break;
  }
  if (!found) { noPage.push(c.id); continue; }
  if (!squadKr) { noField.push(c.id); continue; }

  if (!bySquad.has(c.squad)) bySquad.set(c.squad, new Map());
  const m = bySquad.get(c.squad);
  if (!m.has(squadKr)) m.set(squadKr, []);
  m.get(squadKr).push(c.id);
}

// ---------------------------------------------------------------------------
const line = '─'.repeat(72);
const agreed = [];
const conflict = [];
const spacingFixed = [];
for (const [en, m] of bySquad) {
  if (m.size === 1) {
    const [ko, ids] = [...m.entries()][0];
    agreed.push({ en, ko, members: ids.length });
    continue;
  }
  // 갈렸을 때 — **띄어쓰기만 다른 경우**는 나무위키 문서끼리의 표기 흔들림이다
  // (아르카나 `베스트 셀러` vs 팬텀 `베스트셀러`). 공백을 빼고도 다르면 진짜 충돌이라
  // 그대로 막는다. 이 구분이 없으면 서로 다른 부대를 조용히 하나로 합칠 수 있다.
  const collapsed = new Set([...m.keys()].map((k) => k.replace(/\s+/g, '')));
  if (collapsed.size === 1) {
    const ranked = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
    agreed.push({ en, ko: ranked[0][0], members: [...m.values()].reduce((n, v) => n + v.length, 0) });
    spacingFixed.push(`${en}: ${ranked.map(([k, v]) => `${k}(${v.length})`).join(' vs ')} -> '${ranked[0][0]}' 채택`);
    continue;
  }
  conflict.push({ en, options: [...m.entries()].map(([ko, ids]) => `${ko}(${ids.length}명: ${ids.slice(0, 3).join(',')})`) });
}
agreed.sort((a, b) => b.members - a.members);

console.log(line);
console.log(`새로 받은 페이지 ${fetched} / 일치 ${agreed.length}종 · 충돌 ${conflict.length}종`);
console.log(`문서 없음 ${noPage.length}명 · 스쿼드 칸 없음 ${noField.length}명`);
console.log(line);
if (conflict.length) {
  console.log('❌ 같은 부대인데 한국어 표기가 갈렸다 — 문서를 잘못 읽었을 수 있다:');
  conflict.forEach((c) => console.log(`   ${c.en}: ${c.options.join(' / ')}`));
  console.log(line);
}
if (spacingFixed.length) {
  console.log('띄어쓰기만 갈린 것 — 공백을 빼면 같은 이름이라 다수 표기를 채택했다:');
  spacingFixed.forEach((x) => console.log(`   ${x}`));
  console.log(line);
}
if (noField.length) {
  console.log(`스쿼드 칸을 못 찾은 캐릭터(${noField.length}): ${noField.slice(0, 15).join(', ')}${noField.length > 15 ? ' …' : ''}`);
}
if (noPage.length) {
  console.log(`문서를 못 찾은 캐릭터(${noPage.length}): ${noPage.slice(0, 15).join(', ')}${noPage.length > 15 ? ' …' : ''}`);
}
console.log(line);
console.log('일치한 표기 (상위 20):');
agreed.slice(0, 20).forEach((a) => console.log(`   ${a.en.padEnd(24)} -> ${a.ko}   (${a.members}명 일치)`));

// ⚠️ 멤버가 한 명뿐인 부대는 **교차검증이 성립하지 않는다.** 잘못 긁어도 비교할 상대가
//    없어 그냥 통과한다. 실제로 모리(Incubator)가 그 경우였고, 스포일러 접기 안의 문구까지
//    이름에 섞여 들어간 것을 출력을 눈으로 읽다가 발견했다. 그래서 매번 눈에 띄게 찍는다.
const single = agreed.filter((a) => a.members === 1);
if (single.length) {
  console.log(`${line}\n⚠️  멤버가 1명뿐이라 교차검증이 안 된 부대 ${single.length}종 — 값을 눈으로 확인할 것:`);
  single.forEach((a) => console.log(`   ${a.en.padEnd(24)} -> ${a.ko}`));
}

if (WRITE) {
  if (conflict.length) {
    console.log('\n❌ 충돌이 남아 반영하지 않았다. 갈린 부대의 문서를 직접 확인할 것.');
    process.exitCode = 1;
  } else {
    const squads = {};
    agreed.forEach((a) => { squads[a.en] = { ko: a.ko, confirmedBy: a.members }; });
    const out = {
      meta: {
        source: 'namu.wiki 캐릭터 문서 인포박스의 스쿼드 칸',
        method: '캐릭터 전수에서 긁어 영문 부대별로 묶고, 같은 부대의 멤버들이 모두 같은 한국어 표기를 낼 때만 채택한다(교차검증).',
        capturedOn: new Date().toISOString().slice(0, 10),
        note: 'ko만 있다. 일본어(ja)는 game8에서 따로 옮겨야 한다 — 지어내지 말 것.',
      },
      squads,
    };
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`\n✅ ${agreed.length}종을 data/squadNames.json에 저장했다.`);
  }
} else {
  console.log('\n반영하려면 --write 를 붙여 실행할 것.');
}
