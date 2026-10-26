/**
 * 👎 피드백 조건 정리 검사 — lib/feedbackContext.js. (2026-10-26)
 *
 * ■ 이 검사가 막으려는 고장
 *   저장은 **조용히 빈다.** 정리 규칙이 과하면 콜론·공백이 든 이름("Anis: Sparkling Summer")이 빠지거나
 *   목록이 통째로 null이 돼도 에러 없이 👎만 쌓인다 — 첫 👎 때처럼 다시 재현을 못 한다.
 *   반대로 느슨하면 아무 값이나 DB에 들어간다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
// .js를 그대로 부르면 ESM 재해석 경고가 뜬다. 다른 검사(testTraffic)처럼 .mjs로 복사해 부른다.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikke-fbctx-'));
fs.copyFileSync(path.join(ROOT, 'lib', 'feedbackContext.js'), path.join(tmp, 'feedbackContext.mjs'));
const { cleanFeedbackContext } = await import(pathToFileURL(path.join(tmp, 'feedbackContext.mjs')).href);

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
const all = (Array.isArray(db) ? db : Object.values(db.characters || db)).map((c) => c.title);

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('  ✗', msg); } };

// 1) 전 니케를 가진 로스터 — 하나도 빠지면 안 된다.
const full = cleanFeedbackContext('down', { titles: all, treasureIds: [1, 'x'], tower: 'tetra', role: 'healer', requireTitle: all[5], excludeTitles: all.slice(0, 5) });
check(full && full.titles.length === all.length, `전 니케 ${all.length}명 중 ${full?.titles.length}명만 남음: ${all.filter((t) => !full?.titles.includes(t)).slice(0, 5).join(', ')}`);
check(full?.tower === 'tetra' && full?.role === 'healer' && full?.requireTitle === all[5], '타워·역할·포함 니케가 빠짐');
check(full?.excludeTitles.length === 5 && full?.treasureIds.join() === '1,x', '제외 목록·애장품이 빠짐');

// 2) 👍·빈 로스터는 저장 안 함.
check(cleanFeedbackContext('up', { titles: all }) === null, '👍인데 조건이 저장됨');
check(cleanFeedbackContext('down', { titles: [] }) === null, '빈 로스터인데 저장됨');
check(cleanFeedbackContext('down', null) === null, 'context 없음인데 저장됨');

// 3) 이상한 값은 버린다.
const junk = cleanFeedbackContext('down', { titles: ['Rapi', 'x'.repeat(200), 3, {}, 'Rapi'], treasureIds: 'abc', tower: 'moon', role: 'dps', requireTitle: 5, excludeTitles: 'Rapi' });
check(junk && junk.titles.join() === 'Rapi', `잘못된 이름이 남음: ${JSON.stringify(junk?.titles)}`);
check(junk?.tower === null && junk?.role === null && junk?.requireTitle === null, '잘못된 타워·역할·포함 니케가 남음');
check(junk?.treasureIds.length === 0 && junk?.excludeTitles.length === 0, '배열 아닌 애장품·제외 목록이 남음');

if (fail) { console.log(`testFeedbackContext: ${fail}건 실패`); process.exit(1); }
console.log(`testFeedbackContext: 통과 (전 니케 ${all.length}명 보존 · 👍/빈 값 제외 · 잘못된 값 제거)`);
