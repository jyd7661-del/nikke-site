// 광고 배치 검사 (2026-08-13 추가)
//
// 왜 만들었나: 2026-08-13 애드센스가 사이트를 "게시자 콘텐츠가 없는 화면에 Google 게재 광고"로
// 반려했다. 원인은 /combos 였다 — 등록된 조합이 0건이라 화면에 "불러오는 중…" 또는
// "아직 등록된 조합이 없습니다" 한 줄과 광고만 있었다. 에러도 경고도 없이 조용히 정책을
// 위반하고 있었고, 사람이 대시보드를 열어보고 나서야 알았다(CLAUDE.md 원칙 §3).
//
// 무엇을 보나 — **고장의 단위 = 라우트 하나**다(원칙 §4).
// 판정 대상은 "본문을 런타임에 받아오는 페이지"뿐이다. 즉 로딩 상태를 들고 있는
// 클라이언트 페이지. 이런 페이지는 첫 렌더에 본문이 없으므로, 광고를 무조건 그리면
// 반드시 "콘텐츠 없는 화면 + 광고" 순간이 생긴다.
//
// 홈(app/page.js)처럼 본문이 정적으로 항상 있는 페이지는 대상이 아니다. 여기까지 가드를
// 요구하면 오탐이 나고, **오탐이 나는 검사는 아무도 믿지 않는다**(원칙 §4).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 사용자 홈 경로에 한글이 있어 URL.pathname을 그대로 쓰면 퍼센트 인코딩된 채로 나온다.
// 다른 검사 스크립트와 같이 fileURLToPath를 쓴다.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(ROOT, 'app');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === 'page.js') out.push(full);
  }
  return out;
}

// 본문을 런타임에 받아오는 페이지인가 — 로딩 상태를 들고 있으면 그렇다.
function loadsAtRuntime(src) {
  return /useState\s*\(\s*true\s*\)/.test(src) && /\bloading\b/.test(src);
}

// <AdSlot ... /> 이 조건부 블록 안에 있는가.
// JSX에서 `{조건 && (` 로 감싼 형태만 인정한다. 조건에 loading 부정이 들어 있어야
// "아직 준비 중인 화면"(정책 문구)에 광고가 뜨지 않는다.
function guardsFor(src) {
  const results = [];
  const re = /<AdSlot\b/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(0, m.index);
    // 가장 가까운 여는 JSX 표현식 블록을 거슬러 찾는다
    const open = before.lastIndexOf('{');
    const guard = open === -1 ? '' : before.slice(open, open + 200);
    const line = before.split('\n').length;
    results.push({ line, guard });
  }
  return results;
}

const errors = [];
const checked = [];

for (const file of walk(APP_DIR)) {
  const src = readFileSync(file, 'utf8');
  if (!/<AdSlot\b/.test(src)) continue;
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const runtime = loadsAtRuntime(src);
  const slots = guardsFor(src);
  checked.push({ rel, runtime, count: slots.length });

  if (!runtime) continue; // 정적 본문 페이지는 대상이 아니다

  for (const s of slots) {
    const negatesLoading = /!\s*loading/.test(s.guard);
    const requiresContent = /\.length\s*>\s*0/.test(s.guard);
    if (!negatesLoading || !requiresContent) {
      errors.push(
        `[AD_ON_EMPTY_SCREEN] ${rel}:${s.line} — 본문을 런타임에 받아오는 페이지인데 ` +
          `AdSlot이 ${!negatesLoading ? '로딩 상태를 배제하지 않는다' : '본문이 있는지 확인하지 않는다'}. ` +
          `애드센스 "게시자 콘텐츠가 없는 화면에 Google 게재 광고" 위반이 된다 (docs/ops.md)`
      );
    }
  }
}

console.log('광고 배치 검사 — AdSlot을 쓰는 페이지');
for (const c of checked) {
  console.log(`  ${c.rel} — 슬롯 ${c.count}개 · ${c.runtime ? '런타임 로딩(판정 대상)' : '정적 본문(대상 아님)'}`);
}
console.log('─'.repeat(72));

if (errors.length) {
  console.log(`❌ ERROR ${errors.length}건`);
  for (const e of errors) console.log('   ' + e);
  process.exit(1);
}
console.log('ERROR 0 — 콘텐츠 없는 화면에 광고를 그리는 페이지 없음');
