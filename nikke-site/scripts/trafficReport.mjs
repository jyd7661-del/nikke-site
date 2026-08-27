/**
 * 자체 방문 계측 조회 — **운영자 전용**. (2026-08-26)
 *
 * page_views / daily_visitors 는 RLS가 켜져 있고 anon 정책이 없다. 즉 anon 키로는
 * 읽히지 않고, 이 스크립트처럼 service_role 키를 가진 쪽만 볼 수 있다.
 * 그래서 사이트에는 이 숫자를 보여주는 페이지가 없다(만들지 말 것 — 공개되면 의미가 없어진다).
 *
 * 두 값을 나눠 보는 이유:
 *   인원수      = 얼마나 많은 사람이 왔는가
 *   로딩 횟수   = 광고가 몇 번 그려질 기회가 있었는가 (수익과 비례)
 *   로딩/인원   = 한 사람이 몇 페이지를 돌았는가 (콘텐츠 품질 신호)
 *
 * 사용법:
 *   node scripts/trafficReport.mjs           # 최근 14일
 *   node scripts/trafficReport.mjs --days=30
 *   node scripts/trafficReport.mjs --top=30  # 상위 경로 개수
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? Number(m.split('=')[1]) : dflt;
};
const DAYS = arg('days', 14);
const TOP = arg('top', 15);

// .env.local 이 있으면 읽는다(로컬 실행 편의). 없으면 환경변수를 쓴다.
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다.');
  console.error('   .env.local 에 넣거나 환경변수로 설정할 것. anon 키로는 읽히지 않는다(RLS).');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const since = new Date(Date.now() - (DAYS - 1) * 86400000).toISOString().slice(0, 10);

const [{ data: views, error: e1 }, { data: visitors, error: e2 }] = await Promise.all([
  supabase.from('page_views').select('path, view_date, views').gte('view_date', since),
  supabase.from('daily_visitors').select('view_date').gte('view_date', since),
]);
if (e1 || e2) {
  console.error('❌ 조회 실패:', (e1 || e2).message);
  console.error('   테이블이 없으면 supabase/traffic_migration.sql 을 먼저 적용할 것.');
  process.exit(1);
}

const byDate = new Map();
(views || []).forEach((r) => {
  const d = byDate.get(r.view_date) || { loads: 0, people: 0 };
  d.loads += r.views;
  byDate.set(r.view_date, d);
});
(visitors || []).forEach((r) => {
  const d = byDate.get(r.view_date) || { loads: 0, people: 0 };
  d.people += 1;
  byDate.set(r.view_date, d);
});

const line = '─'.repeat(72);
console.log(line);
console.log(`자체 방문 계측 — 최근 ${DAYS}일 (${since} 이후)`);
console.log(line);
if (byDate.size === 0) {
  console.log('아직 쌓인 데이터가 없다.');
  console.log('  · supabase/traffic_migration.sql 을 적용했는지');
  console.log('  · Vercel 환경변수에 SUPABASE_SERVICE_ROLE_KEY 가 있는지 (없으면 계측이 조용히 꺼진다)');
  console.log('  · 배포 후 실제 방문이 있었는지');
  process.exit(0);
}

console.log('날짜          인원    로딩    로딩/인원');
let tp = 0; let tl = 0;
[...byDate.entries()].sort().forEach(([d, v]) => {
  tp += v.people; tl += v.loads;
  const ratio = v.people ? (v.loads / v.people).toFixed(1) : '—';
  console.log(`${d}  ${String(v.people).padStart(6)}  ${String(v.loads).padStart(6)}    ${String(ratio).padStart(6)}`);
});
console.log(line);
console.log(`합계          ${String(tp).padStart(6)}  ${String(tl).padStart(6)}    ${String(tp ? (tl / tp).toFixed(1) : '—').padStart(6)}`);
console.log('  로딩/인원이 높을수록 한 사람이 여러 페이지를 돌았다는 뜻이다(콘텐츠가 붙잡았다).');
console.log('  로딩 수는 광고가 그려질 기회 수와 비례한다.');

const byPath = new Map();
(views || []).forEach((r) => byPath.set(r.path, (byPath.get(r.path) || 0) + r.views));
console.log(line);
console.log(`많이 본 경로 상위 ${TOP}`);
[...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP)
  .forEach(([p, n], i) => console.log(`  ${String(i + 1).padStart(2)}. ${p.padEnd(38)} ${String(n).padStart(6)}`));
console.log(line);
