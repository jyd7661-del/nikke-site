// 사이트맵에 실리는 모든 주소에 **자기 자신을 가리키는 canonical**이 있는지 검사한다.
//
// 왜 필요한가:
//   ?utm_source= 같은 쿼리가 붙은 주소도 200으로 살아 있어(실측) 별개 URL로 색인될 수 있다.
//   canonical이 그 중복을 한 주소로 모아준다. 나중에 자체 도메인으로 옮길 때도 필요하다.
//
// 왜 검사가 필요한가:
//   /·/combos·/board 는 'use client'라 페이지에서 metadata를 export할 수 없어, 각각
//   **별도 레이아웃 파일**로 canonical을 붙였다. 이 구조는 두 가지로 조용히 깨진다:
//     1) 레이아웃 파일을 지우거나 라우트를 옮기면 canonical이 사라진다 (에러 없음)
//     2) 부모 레이아웃의 canonical을 자식이 그대로 **상속**해서, 예를 들어 /board/new 의
//        정본이 /board 로 찍힌다 (에러 없음, 검색엔진만 잘못 안다)
//   둘 다 화면에는 아무 증상이 없으므로 사람 눈으로는 못 잡는다.
//
// 빌드 산출물(.next/server/app/*.html)을 읽으므로 **next build 이후에** 돌려야 한다.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.next/server/app');
// ⚠️ 주소를 여기 하드코딩하면 커스텀 도메인으로 옮긴 뒤 이 검사가 통째로 실패한다.
//    2026-08-24부터 lib/site.js·next.config.js와 **같은 파일**(data/siteConfig.json)을 읽는다.
//    그전에는 세 파일이 각자 같은 문자열을 하드코딩하고 있어서 한쪽만 고치면 조용히 어긋났다.
const siteConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/siteConfig.json'), 'utf8'));
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.productionUrl)
  .replace(/\/+$/, '');

if (!fs.existsSync(OUT)) {
  console.error('빌드 산출물이 없습니다. 먼저 next build 를 돌리세요.');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/characterDatabase.json'), 'utf8'));
const cdb = Array.isArray(raw) ? raw : raw.characters;

// 사이트맵과 같은 규칙 (app/sitemap.js · lib/locale.js). 여기가 어긋나면 검사 자체가 무의미해진다.
//
// 언어별 주소(2026-09-19): 페이지가 app/[lang]/ 아래로 옮겨 가 산출물도 언어 폴더에 생긴다
// (.next/server/app/ko/nikke/crown.html, 홈은 ko.html). 한국어 주소는 접두어가 없다(rewrite).
//   · 번역된 페이지(홈·도감)  → 세 언어 모두 **자기 주소**가 canonical + hreflang 4개(ko·en·ja·x-default)
//   · 번역 안 된 페이지       → 영어·일본어판은 canonical이 **한국어 주소** + noindex
// 후자가 틀리면 번역 안 된 한국어 글이 /en 주소로 세 번 색인돼 서로 순위를 깎는다.
const LOCALES = ['ko', 'en', 'ja'];
const urlOf = (l, p) => (l === 'ko' ? p : p === '/' ? `/${l}` : `/${l}${p}`);
const fileOf = (l, p) => (p === '/' ? `${l}.html` : path.join(l, `${p.slice(1)}.html`));
const LOCALIZED = ['/', '/nikke', ...cdb.map((c) => `/nikke/${c.id}`)];
const KO_ONLY = ['/combos', '/board', '/privacy', '/guide'];

let errors = 0;
let checked = 0;
const err = (m) => { console.error('  ERROR ' + m); errors++; };
const norm = (u) => u.replace(/\/$/, '');

function inspect(lang, bare, { wantCanonical, wantNoindex, wantAlternates }) {
  const route = urlOf(lang, bare);
  const file = fileOf(lang, bare);
  const fp = path.join(OUT, file);
  checked++;
  if (!fs.existsSync(fp)) { err(`${route} — 빌드 산출물 없음 (${file})`); return; }
  const html = fs.readFileSync(fp, 'utf8');
  const found = [...html.matchAll(/<link[^>]+rel="canonical"[^>]*>/g)]
    .map((m) => (m[0].match(/href="([^"]+)"/) || [, ''])[1]);
  if (found.length === 0) { err(`${route} — canonical 없음`); return; }
  if (found.length > 1) { err(`${route} — canonical이 ${found.length}개`); return; }
  const want = SITE_URL + wantCanonical;
  if (norm(found[0]) !== norm(want)) err(`${route} — canonical이 ${want}가 아님: ${found[0]}`);
  const noindex = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(html);
  if (noindex !== wantNoindex) err(`${route} — noindex ${noindex ? '있음' : '없음'}(기대: ${wantNoindex ? '있음' : '없음'})`);
  if (wantAlternates) {
    const alts = Object.fromEntries([...html.matchAll(/<link[^>]+rel="alternate"[^>]*>/g)]
      .map((m) => [(m[0].match(/hrefLang="([^"]+)"/i) || [, ''])[1], (m[0].match(/href="([^"]+)"/) || [, ''])[1]]));
    for (const l of LOCALES) {
      if (norm(alts[l] || '') !== norm(SITE_URL + urlOf(l, bare))) err(`${route} — hreflang ${l}가 틀림: ${alts[l] || '없음'}`);
    }
    if (norm(alts['x-default'] || '') !== norm(SITE_URL + urlOf('ko', bare))) err(`${route} — x-default가 틀림: ${alts['x-default'] || '없음'}`);
  }
}

for (const bare of LOCALIZED) {
  for (const l of LOCALES) inspect(l, bare, { wantCanonical: urlOf(l, bare), wantNoindex: false, wantAlternates: true });
}
for (const bare of KO_ONLY) {
  inspect('ko', bare, { wantCanonical: bare, wantNoindex: false, wantAlternates: false });
  for (const l of ['en', 'ja']) inspect(l, bare, { wantCanonical: bare, wantNoindex: true, wantAlternates: false });
}

console.log(errors === 0
  ? `ERROR 0 — ${checked}개 주소(번역 ${LOCALIZED.length}×3 · 한국어 전용 ${KO_ONLY.length}×3) canonical·noindex·hreflang 정상`
  : `ERROR ${errors} — canonical 문제`);
process.exit(errors ? 1 : 0);
