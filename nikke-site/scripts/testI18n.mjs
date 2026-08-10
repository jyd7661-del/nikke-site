#!/usr/bin/env node
/**
 * lib/i18n.js 사전 정합성 테스트
 *
 *   node scripts/testI18n.mjs
 *
 * 왜 필요한가:
 * 번역 사전은 틀려도 **에러가 나지 않는다.** 일본어에 키 하나를 빠뜨리면 그 자리에만
 * 한국어가 나오거나 키 이름(`board_empty`)이 그대로 찍히는데, 개발자는 한국어로만
 * 확인하므로 끝까지 모른다. 2026-08-10 B단계에서 키가 44개 → 182개로 늘면서
 * 사람 눈으로 세 언어를 대조하는 게 불가능해졌다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const I18N = path.join(ROOT, 'lib', 'i18n.js');
const { LOCALES, DEFAULT_LOCALE, t } = await import(pathToFileURL(I18N).href);

const src = fs.readFileSync(I18N, 'utf8');
const keysOf = (loc) => {
  const m = src.match(new RegExp(`^  ${loc}: \\{([\\s\\S]*?)^  \\},`, 'm'));
  if (!m) return null;
  return [...m[1].matchAll(/^    ([a-z][a-z0-9_]*):/gm)].map((x) => x[1]);
};

let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const table = {};
for (const loc of LOCALES) {
  const ks = keysOf(loc);
  check(`${loc} 사전 블록을 찾음`, ks !== null, '상수 형태가 바뀌었는지 확인할 것');
  table[loc] = ks || [];
}

// 1. 세 언어 키 집합이 같아야 한다. 하나만 빠지면 그 언어에서만 다른 문구가 나온다.
const base = new Set(table[DEFAULT_LOCALE]);
for (const loc of LOCALES) {
  const miss = table[DEFAULT_LOCALE].filter((k) => !table[loc].includes(k));
  const extra = table[loc].filter((k) => !base.has(k));
  check(`${loc}: ${DEFAULT_LOCALE} 대비 누락 없음`, miss.length === 0, miss.join(', '));
  check(`${loc}: 여분 키 없음`, extra.length === 0, extra.join(', '));
  // 2. 중복 키는 뒤엣것이 앞엣것을 덮어써 조용히 다른 문구가 나온다.
  const dup = table[loc].filter((k, i) => table[loc].indexOf(k) !== i);
  check(`${loc}: 중복 키 없음`, dup.length === 0, [...new Set(dup)].join(', '));
}

// 3. 값 타입이 언어마다 같아야 한다. 한쪽만 함수면 호출부에서 터지거나 함수가 그대로 찍힌다.
const typeBad = [];
for (const k of table[DEFAULT_LOCALE]) {
  const types = [...new Set(LOCALES.map((l) => typeof t(k, l)))];
  if (types.length !== 1) typeBad.push(`${k}(${types.join('/')})`);
}
check('값 타입이 언어별로 동일', typeBad.length === 0, typeBad.join(', '));

// 4. 함수형 키는 실제로 불러서 문자열이 나와야 한다.
const fnKeys = table[DEFAULT_LOCALE].filter((k) => typeof t(k, DEFAULT_LOCALE) === 'function');
const fnBad = [];
for (const k of fnKeys) {
  for (const l of LOCALES) {
    try {
      const r = t(k, l)(1, 2);
      if (typeof r !== 'string' || !r.length) fnBad.push(`${k}/${l}`);
    } catch { fnBad.push(`${k}/${l}:예외`); }
  }
}
check(`함수형 키 ${fnKeys.length}개가 모든 언어에서 호출 가능`, fnBad.length === 0, fnBad.join(', '));

// 5. 빈 문자열이면 화면에 아무것도 안 나온다.
const empty = table[DEFAULT_LOCALE].filter((k) => LOCALES.some((l) => t(k, l) === ''));
check('빈 값 없음', empty.length === 0, empty.join(', '));

// 6. 폴백 — 모르는 키/언어에도 화면이 비지 않아야 한다.
check('없는 키는 키 이름을 그대로 반환', t('no_such_key_xyz', 'ja') === 'no_such_key_xyz');
check('모르는 언어는 기본 언어로', t(table[DEFAULT_LOCALE][0], 'zz') === t(table[DEFAULT_LOCALE][0], DEFAULT_LOCALE));

// 7. 코드가 실제로 부르는 키가 사전에 다 있는가.
//    t('...') 직접 호출과 labelKey/daysKey 같은 간접 참조를 함께 훑는다.
const scanDirs = ['app', 'components', 'lib'];
const used = new Map();
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(fp); continue; }
    if (!e.name.endsWith('.js')) continue;
    const s = fs.readFileSync(fp, 'utf8');
    const add = (re) => { for (const m of s.matchAll(re)) used.set(m[1], path.relative(ROOT, fp)); };
    add(/(?<![A-Za-z0-9_.])t\(\s*'([a-z][a-z0-9_]*)'/g);
    add(/(?:labelKey|daysKey):\s*'([a-z][a-z0-9_]*)'/g);
    add(/'(?:[a-z-]+)':\s*'(source_[a-z_]+)'/g);
  }
};
for (const d of scanDirs) walk(path.join(ROOT, d));
const undefinedKeys = [...used].filter(([k]) => !base.has(k));
check(`코드가 쓰는 키 ${used.size}개가 사전에 존재`, undefinedKeys.length === 0,
  undefinedKeys.map(([k, f]) => `${k}(${f})`).join(', '));

// 8. 번역 함수 t 를 가리는 콜백 인자가 없는가.
//    `TABS.map((t) => ...)` 처럼 쓰면 그 블록 안의 t('...')가 조용히 깨진다(2026-08-10 실제 발생).
const shadow = [];
const walkShadow = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walkShadow(fp); continue; }
    if (!e.name.endsWith('.js')) continue;
    const s = fs.readFileSync(fp, 'utf8');
    if (!s.includes('useLanguage')) continue;
    s.split('\n').forEach((l, i) => {
      if (/\.(map|filter|forEach|find|some|every|reduce)\(\s*\(?\s*t\s*[,)=]/.test(l)) {
        shadow.push(`${path.relative(ROOT, fp)}:${i + 1}`);
      }
    });
  }
};
for (const d of scanDirs) walkShadow(path.join(ROOT, d));
check('번역 함수 t 를 가리는 콜백 인자 없음', shadow.length === 0, shadow.join(', '));

// 9. t()를 쓰는 **컴포넌트마다** useLanguage() 훅이 있는가.
//
//    ⚠️ 파일 단위로 검사하면 안 된다. 한 파일에 컴포넌트가 여럿이면 스코프가 각각인데,
//       파일 어딘가에 훅이 하나만 있어도 통과해버린다. 2026-08-11에 실제로 이걸 놓쳤다 —
//       components/ResultPanel.js의 AiRecommendSection이 t()를 16번 쓰면서 훅이 없었고,
//       **AI 추천 섹션이 통째로 안 그려졌다.** 에러 로그도 안 남아서 사용자 제보로 알았다.
const scopeBad = [];
const walkScope = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walkScope(fp); continue; }
    if (!e.name.endsWith('.js')) continue;
    const lines = fs.readFileSync(fp, 'utf8').split('\n');
    // 최상위 함수 선언(= 컴포넌트/헬퍼)을 경계로 잘라 각 구간을 따로 본다.
    const starts = [];
    lines.forEach((l, i) => { if (/^(export default )?function [A-Za-z]/.test(l)) starts.push(i); });
    if (!starts.length) return;
    starts.push(lines.length);
    for (let k = 0; k < starts.length - 1; k++) {
      const body = lines.slice(starts[k], starts[k + 1]).join('\n');
      const uses = (body.match(/(?<![A-Za-z0-9_.])t\(/g) || []).length;
      if (!uses) continue;
      if (!/const \{[^}]*\bt\b[^}]*\} = useLanguage\(\)/.test(body)) {
        const name = (lines[starts[k]].match(/function ([A-Za-z0-9_]+)/) || [, '?'])[1];
        scopeBad.push(`${path.relative(ROOT, fp)}:${starts[k] + 1} ${name}() — t() ${uses}회`);
      }
    }
  }
};
for (const d of scanDirs) walkScope(path.join(ROOT, d));
check('t()를 쓰는 컴포넌트마다 useLanguage() 보유', scopeBad.length === 0, scopeBad.join(' / '));

// 10. 날짜 로케일이 하드코딩돼 있지 않은가.
//    문구만 번역하고 날짜를 놔두면 일본어 화면에 `2026. 8. 10.` 같은 한국식 표기가 남는다.
//    2026-08-10에 상세 페이지만 고치고 목록 페이지를 놓쳐 실제로 그 상태로 배포됐다.
const hardDate = [];
const walkDate = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walkDate(fp); continue; }
    if (!e.name.endsWith('.js')) continue;
    fs.readFileSync(fp, 'utf8').split('\n').forEach((l, i) => {
      if (/toLocale(?:Date|Time)?String\(\s*['"][a-z]{2}-[A-Z]{2}['"]/.test(l)) {
        hardDate.push(`${path.relative(ROOT, fp)}:${i + 1}`);
      }
    });
  }
};
for (const d of scanDirs) walkDate(path.join(ROOT, d));
check('날짜 로케일 하드코딩 없음', hardDate.length === 0,
  `${hardDate.join(', ')} — lib/i18n.js의 dateLocale(lang)을 쓸 것`);

console.log(`\ni18n 사전 테스트 — 키 ${table[DEFAULT_LOCALE].length}개 × ${LOCALES.length}개 언어 / 함수형 ${fnKeys.length}개`);
console.log(`통과 ${pass} / 실패 ${fails.length}`);
if (fails.length) {
  console.log('');
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log('전부 통과\n');
