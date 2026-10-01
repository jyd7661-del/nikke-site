#!/usr/bin/env node
/**
 * **버스트를 못 쓸 때 남는 딜 비율** — `data/offBurstShare.json`을 만든다. (2026-10-01)
 *
 *   node scripts/buildOffBurstShare.mjs          # 계산만(저장된 파일과 다른지 보고)
 *   node scripts/buildOffBurstShare.mjs --write  # 저장
 *
 * 엔진(lib/synergyEngine.js)의 "낭비 인원"(같은 버스트 단계가 남아 버스트를 못 쓰는 멤버)은 그동안 **티어 0점**이었다.
 * 그런데 그 멤버도 평타·일반 스킬로는 딜을 넣는다 — 시뮬레이터 실측으로 자체 딜의 81~100%가 평타다.
 * 0점이라 엔진은 강한 세 번째 B3 대신 D~B급 B2를 넣었다(내 블라인드 판정 개발 60건 중 5건, 2026-10-01).
 * 예전 "낭비 인원 70%"는 근거 없는 숫자라 기각됐다(CLAUDE.md 원칙 2) — 그래서 **비율을 캐릭터마다 스킬 원문에서** 계산한다:
 *   비율 = 시뮬레이터 자체 값(버스트 스킬을 뺀 캐릭터) ÷ 자체 값(전부)   (scoreComposition 1인 팀)
 * 엔진은 낭비 멤버를 `티어 점수 × 이 비율`로 센다. 값이 없으면 0(옛 동작).
 * 스킬이 바뀌면 값이 바뀐다 — simulateTeams --selftest가 저장값과 재계산을 대본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreComposition } from './simulateTeams.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'offBurstShare.json');

export function computeOffBurstShare() {
  const cdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characterDatabase.json'), 'utf8'));
  const byTitle = {};
  for (const c of cdb) {
    if ((c.skills || []).length !== 3) continue;
    const full = scoreComposition([c]).total;
    if (!(full > 0)) continue;
    const nob = scoreComposition([{ ...c, skills: c.skills.slice(0, 2) }]).total;
    byTitle[c.title] = Math.round(Math.min(1, Math.max(0, nob / full)) * 100) / 100;
  }
  return byTitle;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('buildOffBurstShare.mjs')) {
  const byTitle = computeOffBurstShare();
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).byTitle : {};
  const diff = Object.keys({ ...old, ...byTitle }).filter((t) => old[t] !== byTitle[t]);
  console.log(`${Object.keys(byTitle).length}명 · 저장값과 다른 ${diff.length}명${diff.length ? ': ' + diff.slice(0, 8).join(', ') : ''}`);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(OUT, JSON.stringify({
      _doc: '버스트를 못 쓸 때 남는 자체 딜 비율(시뮬레이터, 스킬 원문). 엔진 낭비 인원 = 티어 × 이 비율. 생성: scripts/buildOffBurstShare.mjs — 손으로 고치지 말 것',
      generatedOn: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
      byTitle,
    }, null, 2) + '\n');
    console.log('저장: data/offBurstShare.json');
  }
}
