/**
 * 부대(스쿼드) 이름의 일본어 표기를 game8에서 옮겨 온다. (2026-08-26)
 *
 * 한국어판(`refreshSquadKrFromNamu.mjs`)의 짝이다. 왜 지어내면 안 되는지,
 * 교차검증을 어떻게 거는지는 그 파일과 `docs/i18n.md`에 적어뒀다.
 * 한국어에서 실측으로 확인된 것 — **음차가 아니다.** White Knight는 '바이스리터'였다.
 * 일본어도 같을 것으로 보고 1차 출처에서 옮긴다.
 *
 * ■ 추출 위치
 *   캐릭터 페이지 상단 표의 `部隊` 열. 같은 행에 `所属企業`가 나란히 있다:
 *
 *     <th>評価ランク</th><th>所属企業</th><th>部隊</th>
 *     <td>…</td><td><a>エリシオン</a></td><td>カウンターズ</td>
 *
 * ■ 정체성 검사 — **같은 행의 所属企業를 우리 manufacturer와 대조한다**
 *   엉뚱한 문서를 긁으면 부대만 보고는 알 수 없다(특히 멤버가 1명뿐인 부대).
 *   그런데 우리가 읽는 바로 그 행에 제조사가 함께 있으므로 공짜로 확인이 된다.
 *   refreshSkillsJaFromGame8의 정체성 검사와 같은 발상이고, 그쪽은 별칭이 한 칸
 *   어긋난 것을 실제로 잡아냈다.
 *
 * ■ 교차검증
 *   62개 부대에 196명이 나뉘어 있으므로, 같은 부대 멤버들에게서 나온 일본어 이름은
 *   전부 같아야 한다. 다르면 --write를 막는다.
 *
 * 사용법:
 *   node scripts/refreshSquadJaFromGame8.mjs            # 긁어서 보고만 한다
 *   node scripts/refreshSquadJaFromGame8.mjs --write    # data/squadNames.json 의 ja 채우기
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DB = path.join(ROOT, 'data/characterDatabase.json');
const OUT = path.join(ROOT, 'data/squadNames.json');
const MAPFILE = path.join(ROOT, 'data/game8PageMap.json');
const ALIASFILE = path.join(ROOT, 'data/game8Alias.json');
const CACHE = path.join(os.tmpdir(), 'game8-cache');
const WRITE = process.argv.includes('--write');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const SLEEP_MS = 900;

fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function fetchPage(url) {
  const key = path.join(CACHE, `${url.replace(/[^0-9]/g, '')}.html`);
  if (fs.existsSync(key)) return { html: fs.readFileSync(key, 'utf8'), cached: true };
  let html;
  try {
    html = execFileSync('curl', ['-sS', '--compressed', '-A', UA, '-L', '--max-time', '30', url],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch { return { html: null, cached: false }; }
  if (!html || html.length < 5000) return { html: null, cached: false };
  fs.writeFileSync(key, html);
  return { html, cached: false };
}

const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// game8의 所属企業 표기 -> 우리 manufacturer. data/glossary.json의 ja와 같은 값이다.
const CORP_JA = { エリシオン: 'elysion', ミシリス: 'missilis', テトラ: 'tetra', ピルグリム: 'pilgrim', アブノーマル: 'abnormal' };

/**
 * 상단 표에서 { squad, corp } 를 뽑는다. 못 찾으면 null.
 * 헤더 <th>들 중 部隊 / 所属企業의 **열 위치**를 찾아 다음 행의 같은 열을 읽는다.
 * (열 순서가 바뀌어도 따라가고, 이미지·링크가 섞여 있어도 태그를 걷어내면 값만 남는다)
 */
function extractRow(html) {
  const at = html.indexOf('部隊</th>');
  if (at < 0) return null;
  // 이 헤더가 속한 <tr> 의 시작
  const trStart = html.lastIndexOf('<tr', at);
  const trEnd = html.indexOf('</tr>', at);
  if (trStart < 0 || trEnd < 0) return null;
  const heads = [...html.slice(trStart, trEnd).matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => strip(m[1]));
  const iSquad = heads.indexOf('部隊');
  const iCorp = heads.indexOf('所属企業');
  if (iSquad < 0) return null;

  const rowStart = html.indexOf('<tr', trEnd);
  const rowEnd = html.indexOf('</tr>', rowStart);
  if (rowStart < 0 || rowEnd < 0) return null;
  const cells = [...html.slice(rowStart, rowEnd).matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
  const squad = cells[iSquad] || null;
  const corp = iCorp >= 0 ? (cells[iCorp] || null) : null;
  return squad ? { squad, corp } : null;
}

// ---------------------------------------------------------------------------
const raw = JSON.parse(fs.readFileSync(DB, 'utf8'));
const cdb = Array.isArray(raw) ? raw : raw.characters;
const pageMap = JSON.parse(fs.readFileSync(MAPFILE, 'utf8'));
const alias = JSON.parse(fs.readFileSync(ALIASFILE, 'utf8')).aliases || JSON.parse(fs.readFileSync(ALIASFILE, 'utf8'));

const targets = cdb.filter((c) => c.squad && c.name_ja);
const bySquad = new Map();
const noMap = []; const noFetch = []; const noField = []; const wrongCorp = [];
let fetched = 0;

console.log(`game8에서 부대 일본어 표기 수집 — 대상 ${targets.length}명 / 부대 ${new Set(targets.map((c) => c.squad)).size}종`);
console.log(`(캐시에 없는 페이지는 ${SLEEP_MS}ms 간격으로 받는다 — 처음 실행은 몇 분 걸린다)\n`);

for (const c of targets) {
  const url = pageMap[c.name_ja] || pageMap[alias[c.name_ja]];
  if (!url) { noMap.push(`${c.id}(${c.name_ja})`); continue; }
  const { html, cached } = fetchPage(url);
  if (!cached && html) { fetched += 1; sleep(SLEEP_MS); }
  if (!html) { noFetch.push(c.id); continue; }
  const row = extractRow(html);
  if (!row) { noField.push(c.id); continue; }
  // 정체성 검사 — 같은 행의 제조사가 우리 값과 달라야 할 이유가 없다.
  if (row.corp && CORP_JA[row.corp] && CORP_JA[row.corp] !== c.manufacturer) {
    wrongCorp.push(`${c.id}: 우리 ${c.manufacturer} vs game8 ${row.corp}`);
    continue;
  }
  if (!bySquad.has(c.squad)) bySquad.set(c.squad, new Map());
  const m = bySquad.get(c.squad);
  if (!m.has(row.squad)) m.set(row.squad, []);
  m.get(row.squad).push(c.id);
}

// ---------------------------------------------------------------------------
const line = '─'.repeat(72);
const agreed = []; const conflict = []; const spacingFixed = []; const membershipDiff = [];
for (const [en, m] of bySquad) {
  if (m.size === 1) {
    const [ja, ids] = [...m.entries()][0];
    agreed.push({ en, ja, members: ids.length });
    continue;
  }
  // (1) 구두점만 다른 경우 — 표기 흔들림이다. 공백·중점·마침표를 빼고 같으면 다수를 채택한다.
  //     실측: M.M.R.의 `MMR`(에테르) vs `M.M.R.`(마나).
  const collapsed = new Set([...m.keys()].map((k) => k.replace(/[\s・.,]/g, '')));
  const ranked = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  if (collapsed.size === 1) {
    agreed.push({ en, ja: ranked[0][0], members: [...m.values()].reduce((n, v) => n + v.length, 0) });
    spacingFixed.push(`${en}: ${ranked.map(([k, v]) => `${k}(${v.length})`).join(' vs ')} -> '${ranked[0][0]}' 채택`);
    continue;
  }
  // (2) 값이 진짜로 다른 경우 — 이건 **부대 이름이 갈린 게 아니라 그 캐릭터의 소속이 갈린 것**이다.
  //     실측 2건:
  //       Maid For You: 6명이 メイド・フォー・ユー인데 프리바티:언카인드 메이드만 トライアングル
  //                     (= 우리 DB에서 기본 프리바티의 부대 Triangle)
  //       Best Seller : 3명이 ベストセラー인데 아르카나만 フォーチュンテラー
  //                     (우리 DB에 없는 부대다)
  //     부대의 일본어 이름은 다수로 확정하되, **소수 의견은 버리지 않고 따로 보고**한다.
  //     이건 스크래핑 버그가 아니라 출처끼리 소속을 다르게 적는 데이터 문제라 사람이 판단할 몫이다.
  const total = [...m.values()].reduce((n, v) => n + v.length, 0);
  if (ranked[0][1].length * 2 > total) {
    agreed.push({ en, ja: ranked[0][0], members: ranked[0][1].length });
    ranked.slice(1).forEach(([ja, ids]) => {
      membershipDiff.push(`${en}: game8은 ${ids.join(',')} 를 '${ja}' 소속으로 적는다 (나머지 ${ranked[0][1].length}명은 '${ranked[0][0]}')`);
    });
    continue;
  }
  // (3) 과반이 없으면 무엇이 맞는지 우리가 정할 수 없다. 막는다.
  conflict.push({ en, options: ranked.map(([ja, ids]) => `${ja}(${ids.length}명: ${ids.slice(0, 3).join(',')})`) });
}

// 서로 다른 영문 부대가 같은 일본어 이름을 갖는 경우 — game8이 구분하지 않는다는 뜻이다.
// 실측 2건이고 **성격이 다르다**:
//
//   7th / 2nd / 5th Airborne Squad -> 全部 `空挺部隊`
//     번호를 잃었을 뿐 "공수부대"라는 말 자체는 참이다. 일본어 독자에게는
//     영문 `7th Airborne Squad`보다 낫다. -> 채택한다.
//
//   WILLE -> `NERV`
//     `NERV`는 **우리 DB에 실제로 있는 다른 부대**다. 즉 이건 덜 구체적인 이름이 아니라
//     아예 다른 조직을 가리킨다(스즈하라 사쿠라는 WILLE 소속인데 game8이 뭉뚱그렸다).
//     화면에 그대로 내보내면 틀린 정보가 된다. -> **버리고 영문 폴백**시킨다.
//
// 그래서 규칙은 "공유됐는가"가 아니라 **"그 이름이 우리 DB의 다른 영문 부대 이름과 같은가"**다.
// 이 구분이 위 두 경우를 정확히 갈라낸다.
const OUR_SQUADS = new Set(cdb.map((c) => c.squad).filter(Boolean));
const collides = agreed.filter((a) => OUR_SQUADS.has(a.ja) && a.ja !== a.en);
const collideSet = new Set(collides.map((a) => a.en));
for (let i = agreed.length - 1; i >= 0; i -= 1) if (collideSet.has(agreed[i].en)) agreed.splice(i, 1);

const byJa = new Map();
agreed.forEach((a) => { if (!byJa.has(a.ja)) byJa.set(a.ja, []); byJa.get(a.ja).push(a.en); });
const sharedJa = [...byJa.entries()].filter(([, ens]) => ens.length > 1);
agreed.sort((a, b) => b.members - a.members);

console.log(line);
console.log(`새로 받은 페이지 ${fetched} / 일치 ${agreed.length}종 · 충돌 ${conflict.length}종`);
console.log(`매핑 없음 ${noMap.length}명 · 받기 실패 ${noFetch.length}명 · 部隊 칸 없음 ${noField.length}명 · 제조사 불일치 ${wrongCorp.length}명`);
console.log(line);
if (conflict.length) {
  console.log('❌ 같은 부대인데 일본어 표기가 갈렸다:');
  conflict.forEach((c) => console.log(`   ${c.en}: ${c.options.join(' / ')}`));
  console.log(line);
}
if (wrongCorp.length) {
  console.log('❌ 제조사가 우리 DB와 다르다 — 다른 캐릭터 문서를 긁었을 수 있다:');
  wrongCorp.slice(0, 10).forEach((x) => console.log(`   ${x}`));
  console.log(line);
}
if (membershipDiff.length) {
  console.log('🟡 부대 이름이 아니라 **캐릭터의 소속**이 우리 DB와 game8에서 갈린다 — 사람이 판단할 것:');
  membershipDiff.forEach((x) => console.log(`   ${x}`));
  console.log(line);
}
if (collides.length) {
  console.log('❌ 일본어 이름이 **우리 DB의 다른 부대 이름**과 같다 — 다른 조직을 가리키므로 채택하지 않았다:');
  collides.forEach((a) => console.log(`   ${a.en} -> '${a.ja}'  (영문으로 폴백시킨다)`));
  console.log(line);
}
if (sharedJa.length) {
  console.log('🟡 서로 다른 부대가 같은 일본어 이름을 쓴다 — 덜 구체적일 뿐 참이라 채택했다:');
  sharedJa.forEach(([ja, ens]) => console.log(`   '${ja}' <- ${ens.join(', ')}`));
  console.log(line);
}
if (spacingFixed.length) {
  console.log('구두점(공백·중점·마침표)만 갈린 것 — 다수 표기를 채택했다:');
  spacingFixed.forEach((x) => console.log(`   ${x}`));
  console.log(line);
}
[['매핑 없음', noMap], ['받기 실패', noFetch], ['部隊 칸 없음', noField]].forEach(([label, arr]) => {
  if (arr.length) console.log(`${label}(${arr.length}): ${arr.slice(0, 12).join(', ')}${arr.length > 12 ? ' …' : ''}`);
});

console.log(line);
console.log('일치한 표기 (상위 20):');
agreed.slice(0, 20).forEach((a) => console.log(`   ${a.en.padEnd(24)} -> ${a.ja}   (${a.members}명 일치)`));

// 멤버가 1명뿐이면 교차검증이 성립하지 않는다 — 한국어 수집에서 실제로 그 경우가 새어나갔다.
const single = agreed.filter((a) => a.members === 1);
if (single.length) {
  console.log(`${line}\n⚠️  멤버가 1명뿐이라 교차검증이 안 된 부대 ${single.length}종 — 값을 눈으로 확인할 것:`);
  single.forEach((a) => console.log(`   ${a.en.padEnd(24)} -> ${a.ja}`));
}

if (WRITE) {
  if (conflict.length || wrongCorp.length) {
    console.log('\n❌ 충돌 또는 제조사 불일치가 남아 반영하지 않았다.');
    process.exitCode = 1;
  } else {
    const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    let n = 0;
    agreed.forEach((a) => {
      if (!out.squads[a.en]) { out.squads[a.en] = { confirmedBy: 0 }; }
      out.squads[a.en].ja = a.ja;
      out.squads[a.en].jaConfirmedBy = a.members;
      n += 1;
    });
    out.meta.source = 'ko=namu.wiki 캐릭터 문서 인포박스 스쿼드 칸 / ja=game8 캐릭터 페이지 상단 표 部隊 칸';
    out.meta.note = '두 언어 모두 1차 출처에서 옮긴 값이다. 음차가 아니므로 지어내지 말 것(White Knight=바이스리터).';
    out.meta.capturedOn = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`\n✅ ${n}종의 ja를 data/squadNames.json에 저장했다.`);
  }
} else {
  console.log('\n반영하려면 --write 를 붙여 실행할 것.');
}
