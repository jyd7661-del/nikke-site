#!/usr/bin/env node
/**
 * **Google Search Console API 조회** — 브라우저 없이 검색 실적·URL 검사를 본다. (2026-09-29)
 *
 *   node scripts/gscReport.mjs --sites                      # 이 서비스 계정이 볼 수 있는 속성
 *   node scripts/gscReport.mjs --summary [--days=28]        # 검색어·페이지 상위 + 언어별(주소·검색어 글자) 나눔
 *   node scripts/gscReport.mjs --daily [--days=28]          # 날짜별 노출·클릭 — 한국어 주소 / /en / /ja
 *   node scripts/gscReport.mjs --query="니케 팬텀"           # 그 검색어가 어느 주소로 들어오는가
 *   node scripts/gscReport.mjs --inspect=/nikke/phantom     # URL 검사: 마지막 크롤링·구글이 고른 표준·색인 상태
 *
 * 키: 서비스 계정 JSON — 기본 `~/.config/nikke/gsc-sa.json`(환경변수 GSC_KEY_FILE로 바꿀 수 있다).
 *   ⚠️ 비밀키다. 저장소에 넣지 않는다(.gitignore에 패턴도 막아 뒀다). 서비스 계정은 Search Console에 **"제한됨"**(읽기)으로만 추가한다.
 * 속성: `--site=`로 지정하지 않으면 볼 수 있는 속성 중 nikketeamguide가 들어간 것을 쓴다(도메인 속성 우선).
 *
 * 왜 만들었나: 유저가 "Search Console 최근 검색어가 전부 영어"라고 했는데, 8월 상위 검색어는 전부 한국어였다.
 *   영어 검색어가 /en 주소로 오는지(새 주소가 잡히는 것 — 정상) 한국어 주소로 오는지(구글이 한국어 페이지를 영어로 앎 —
 *   09-13~19 사고의 잔재)를 가르려면 검색어×페이지와 URL 검사가 필요했고, 이 PC에는 로그인된 브라우저가 없었다.
 * 외부 라이브러리 없이 node:crypto로 JWT(RS256)를 서명해 토큰을 받는다 — 사이트 의존성을 늘리지 않으려고.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (n, d) => { const m = process.argv.find((a) => a.startsWith('--' + n + '=')); return m ? m.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes('--' + n);
const KEY_FILE = process.env.GSC_KEY_FILE || path.join(os.homedir(), '.config', 'nikke', 'gsc-sa.json');
const ORIGIN = 'https://nikketeamguide.com';
const DAYS = Number(arg('days', 28)) || 28;

if (!fs.existsSync(KEY_FILE)) {
  console.error(`키 파일이 없다: ${KEY_FILE}\n→ 서비스 계정 JSON 키를 이 경로에 두거나 GSC_KEY_FILE로 지정할 것(docs/ops.md "Search Console API").`);
  process.exit(2);
}
const key = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) { console.error('토큰 발급 실패:', JSON.stringify(j)); process.exit(1); }
  return j.access_token;
}
const TOKEN = await token();
async function api(url, body) {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) { console.error(`API 오류 ${r.status}:`, JSON.stringify(j.error || j).slice(0, 500)); process.exit(1); }
  return j;
}

const sites = (await api('https://www.googleapis.com/webmasters/v3/sites')).siteEntry || [];
if (has('sites')) { sites.forEach((s) => console.log(`${s.siteUrl}  (${s.permissionLevel})`)); process.exit(0); }
const SITE = arg('site', null)
  || sites.find((s) => s.siteUrl === 'sc-domain:nikketeamguide.com')?.siteUrl
  || sites.find((s) => s.siteUrl.includes('nikketeamguide'))?.siteUrl;
if (!SITE) {
  console.error('볼 수 있는 속성에 nikketeamguide가 없다 — Search Console 설정 → 사용자 및 권한에 서비스 계정 이메일을 추가했는지 확인:', key.client_email);
  process.exit(1);
}
const enc = encodeURIComponent(SITE);
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
// 실적 데이터는 2~3일 늦다 — 끝 날짜를 오늘로 잡아도 API가 있는 데까지만 준다
const range = { startDate: day(DAYS), endDate: day(0) };
const sa = (body) => api(`https://www.googleapis.com/webmasters/v3/sites/${enc}/searchAnalytics/query`, { ...range, ...body });

const pageLang = (u) => { const p = String(u).replace(/^https?:\/\/(www\.)?nikketeamguide\.com/, ''); return p.startsWith('/en') ? 'en' : p.startsWith('/ja') ? 'ja' : 'ko'; };
const queryScript = (q) => (/[가-힣]/.test(q) ? '한글' : /[぀-ヿ一-鿿]/.test(q) ? '일본어' : '영문');
const fmt = (r) => `노출 ${String(r.impressions).padStart(5)} · 클릭 ${String(r.clicks).padStart(3)} · ${r.position.toFixed(1)}위`;
console.log(`속성 ${SITE} · ${range.startDate} ~ ${range.endDate}\n`);

if (has('summary')) {
  const q = (await sa({ dimensions: ['query'], rowLimit: 50 })).rows || [];
  const pg = (await sa({ dimensions: ['page'], rowLimit: 50 })).rows || [];
  const qp = (await sa({ dimensions: ['query', 'page'], rowLimit: 1000 })).rows || [];
  const agg = (rows, keyFn) => { const m = {}; for (const r of rows) { const k = keyFn(r); (m[k] ||= { impressions: 0, clicks: 0 }); m[k].impressions += r.impressions; m[k].clicks += r.clicks; } return m; };
  console.log('■ 검색어 글자 × 들어온 주소 언어 (검색어×페이지 행 합산)');
  const cross = agg(qp, (r) => `${queryScript(r.keys[0])} 검색어 → ${pageLang(r.keys[1])} 주소`);
  Object.entries(cross).sort((a, b) => b[1].impressions - a[1].impressions).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} 노출 ${v.impressions} · 클릭 ${v.clicks}`));
  console.log('\n■ 검색어 상위 30');
  q.slice(0, 30).forEach((r) => console.log(`  [${queryScript(r.keys[0])}] ${r.keys[0].padEnd(34)} ${fmt(r)}`));
  console.log('\n■ 페이지 상위 20');
  pg.slice(0, 20).forEach((r) => console.log(`  [${pageLang(r.keys[0])}] ${r.keys[0].replace(ORIGIN, '').padEnd(40)} ${fmt(r)}`));
}

if (has('daily')) {
  const rows = (await sa({ dimensions: ['date', 'page'], rowLimit: 25000 })).rows || [];
  const m = {};
  for (const r of rows) { const d = r.keys[0]; const l = pageLang(r.keys[1]); (m[d] ||= { ko: 0, en: 0, ja: 0, clicks: 0 }); m[d][l] += r.impressions; m[d].clicks += r.clicks; }
  console.log('■ 날짜별 노출 — 한국어 주소 / /en / /ja · 클릭');
  Object.keys(m).sort().forEach((d) => console.log(`  ${d}  ko ${String(m[d].ko).padStart(4)} · en ${String(m[d].en).padStart(4)} · ja ${String(m[d].ja).padStart(4)} · 클릭 ${m[d].clicks}`));
}

const QUERY = arg('query', null);
if (QUERY) {
  const rows = (await sa({ dimensions: ['page'], dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'equals', expression: QUERY }] }], rowLimit: 50 })).rows || [];
  console.log(`■ "${QUERY}"이(가) 들어온 주소`);
  rows.forEach((r) => console.log(`  [${pageLang(r.keys[0])}] ${r.keys[0].replace(ORIGIN, '')}  ${fmt(r)}`));
  if (!rows.length) console.log('  (없음)');
}

const INSPECT = arg('inspect', null);
if (INSPECT) {
  const url = INSPECT.startsWith('http') ? INSPECT : ORIGIN + INSPECT;
  const j = await api('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: SITE, languageCode: 'ko' });
  const ir = j.inspectionResult?.indexStatusResult || {};
  console.log(`■ URL 검사 ${url}`);
  for (const k of ['verdict', 'coverageState', 'indexingState', 'lastCrawlTime', 'pageFetchState', 'crawledAs', 'googleCanonical', 'userCanonical', 'robotsTxtState']) console.log(`  ${k.padEnd(16)} ${ir[k] ?? '-'}`);
}
