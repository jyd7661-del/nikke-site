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
//
// ── 2026-08-24 추가: 애드센스 로더 태그 검사 ─────────────────────────────────
// 새 도메인에서 소유권 확인이 "사이트를 확인할 수 없습니다"로 **세 번 연속** 실패했다.
// 원인은 app/layout.js가 로더를 next/script(<Script>)로 붙이고 있던 것이다.
// afterInteractive든 beforeInteractive든 Next.js는 HTML에 <link rel="preload">만
// 내보내고 진짜 <script> 태그는 브라우저에서 JS로 만든다(두 strategy 모두 빌드
// 산출물로 실측: script 0개 / preload 1개). 사람이 브라우저로 보면 광고가 정상이라
// **화면에는 아무 증상이 없다** — 전형적인 "조용한 누락"(원칙 §3).
//
// 판정 단위는 app/layout.js 안의 로더 한 곳이다(원칙 §4). 빌드 산출물로 재는 쪽이
// 고장의 단위에 더 가깝지만, NEXT_PUBLIC_ADSENSE_CLIENT_ID가 Vercel에만 있어
// 로컬 빌드에는 로더가 아예 없다 — 그래서 평소 /verify에서는 늘 건너뛰는 검사가 된다.
// **건너뛰는 검사는 없는 것과 같으므로** 원인 지점을 소스에서 직접 본다.
// 빌드 산출물로 확인하려면(도메인·레이아웃을 건드렸을 때 권장):
//   NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-1541956672617594 npx next build
//   grep -o '<script[^>]*googlesyndication[^>]*>' .next/server/app/index.html
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

// ── 애드센스 로더 태그 ───────────────────────────────────────────────────────
const LAYOUT = join(ROOT, 'app/layout.js');
const layoutSrc = readFileSync(LAYOUT, 'utf8');
const LOADER_SRC = 'adsbygoogle.js';

const headStart = layoutSrc.indexOf('<head>');
const headEnd = layoutSrc.indexOf('</head>');
const loaderAt = layoutSrc.indexOf(LOADER_SRC);

let loaderNote;
if (loaderAt === -1) {
  errors.push(
    `[ADSENSE_LOADER_MISSING] app/layout.js — 애드센스 로더(${LOADER_SRC})가 없다. ` +
      '지우면 광고가 아예 안 뜨고 소유권 확인도 실패한다 (docs/ops.md)'
  );
  loaderNote = '없음';
} else {
  // 로더를 감싼 태그가 <Script>(next/script)인지 <script>(평범한 태그)인지 본다.
  const openAt = layoutSrc.lastIndexOf('<', loaderAt);
  const tag = layoutSrc.slice(openAt, openAt + 8);
  const isNextScript = tag.startsWith('<Script');
  const inHead = headStart !== -1 && headEnd !== -1 && headStart < loaderAt && loaderAt < headEnd;

  if (isNextScript) {
    errors.push(
      '[ADSENSE_LOADER_NEXT_SCRIPT] app/layout.js — 애드센스 로더를 next/script(<Script>)로 ' +
        '붙였다. Next.js는 HTML에 <link rel="preload">만 내보내고 진짜 <script> 태그는 ' +
        '브라우저에서 JS로 만든다. 화면에는 광고가 정상으로 보이지만 **애드센스 소유권 확인이 ' +
        '실패한다**(2026-08-24 세 번 연속 실패, 실측). 평범한 <script> 태그를 쓸 것 (docs/ops.md)'
    );
  }
  if (!inHead) {
    errors.push(
      '[ADSENSE_LOADER_NOT_IN_HEAD] app/layout.js — 애드센스 로더가 <head>…</head> 밖에 있다. ' +
        '애드센스 안내문이 요구하는 위치는 <head> 안이다 (docs/ops.md)'
    );
  }
  loaderNote = isNextScript ? '<Script>(next/script) ❌' : inHead ? '<script> · <head> 안 ✅' : '<script> · head 밖 ❌';
}

console.log('광고 배치 검사 — AdSlot을 쓰는 페이지');
for (const c of checked) {
  console.log(`  ${c.rel} — 슬롯 ${c.count}개 · ${c.runtime ? '런타임 로딩(판정 대상)' : '정적 본문(대상 아님)'}`);
}
console.log(`  app/layout.js — 애드센스 로더: ${loaderNote}`);
console.log('─'.repeat(72));

if (errors.length) {
  console.log(`❌ ERROR ${errors.length}건`);
  for (const e of errors) console.log('   ' + e);
  process.exit(1);
}
console.log('ERROR 0 — 콘텐츠 없는 화면에 광고를 그리는 페이지 없음 · 애드센스 로더 정상');
