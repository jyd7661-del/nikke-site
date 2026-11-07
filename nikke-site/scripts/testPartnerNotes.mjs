// 도감 짝 해설(data/partnerNotes.json) 검사 — 2026-11-06.
// 해설은 클로드가 스킬 원문을 읽고 쓴 해석(B등급)이다. 해석은 사람이 보지만, **숫자와 이름은 기계로 지킨다**:
//   ① 해설 속 숫자(%·초·회·기·발 앞의 수)는 두 니케 스킬 원문(desc_kr·desc) 어딘가에 그대로 있어야 한다 — 지어낸 수치 방지
//   ② 두 니케 이름이 DB에 있어야 하고, 해설 본문에 둘 다 나와야 한다(양쪽 페이지에 같은 문장이 뜬다)
//   ③ 금지어: 우연·배(리프트 수치는 화면에서 뺐다 — 유저 "보는사람입장에서 아무 도움이 안돼"), 애장품(원문을 안 줬다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/characterDatabase.json'), 'utf8'));
const notes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/partnerNotes.json'), 'utf8')).pairs || [];
const by = new Map(db.map((c) => [c.title, c]));
const problems = [];
const nums = (s) => [...String(s).matchAll(/(\d+(?:\.\d+)?)\s*(?=%|초|회|기|발|중첩|秒|回|体|発|sec|s\b|times|hits|units|rounds|stacks)/g)].map((m) => m[1]);
for (const p of notes) {
  const a = by.get(p.a); const b = by.get(p.b);
  if (!a || !b) { problems.push(`이름 없음: ${p.a} / ${p.b}`); continue; }
  for (const lang of ['ko', 'en', 'ja']) {
    const t = p[lang];
    if (!t) { if (lang === 'ko') problems.push(`[${lang}] 해설 없음: ${a.name_kr} + ${b.name_kr}`); continue; }   // 영어·일본어는 없으면 화면이 그 줄을 안 그린다(11-07)
    const src = [a, b].flatMap((c) => (c.skills || []).map((s) => `${s.desc_kr || ''} ${s.desc || ''}`)).join(' ');
    const srcNums = new Set([...src.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]));
    for (const n of nums(t)) if (!srcNums.has(n)) problems.push(`[숫자] ${a.name_kr} + ${b.name_kr}: 「${n}」이 원문에 없다 — ${t}`);
    const nm = (c) => (lang === 'en' ? c.title : lang === 'ja' ? c.name_ja : c.name_kr);
    if (!t.includes(nm(a)) || !t.includes(nm(b))) problems.push(`[이름·${lang}] ${a.name_kr} + ${b.name_kr}: 해설에 두 이름(${nm(a)} · ${nm(b)})이 다 있어야 한다 — ${t}`);
    if (lang !== 'ko') for (const n of nums(p.ko)) if (!nums(t).includes(n) && !t.includes(n)) problems.push(`[숫자·${lang}] ${a.name_kr} + ${b.name_kr}: 한국어의 「${n}」이 번역에 없다 — ${t}`);
    if (/우연|\d\s*배|애장품/.test(t)) problems.push(`[금지어] ${a.name_kr} + ${b.name_kr}: ${t}`);
  }
}
// 역테스트 전제 확인용: --selftest 는 일부러 틀린 숫자를 넣어 잡히는지 본다
if (process.argv.includes('--selftest')) {
  const t = '에이드 : 에이전트 바니의 관통 대미지 99.99% ▲를 레드 후드가 받는다';
  const src = ['Ade: Agent Bunny', 'Red Hood'].flatMap((x) => by.get(x).skills.map((s) => `${s.desc_kr} ${s.desc}`)).join(' ');
  const ok = nums(t).some((n) => !new Set([...src.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])).has(n));
  console.log(ok ? '역테스트: 지어낸 숫자 99.99를 잡는다' : '역테스트 실패: 지어낸 숫자를 못 잡는다'); if (!ok) process.exit(1);
}
console.log(`짝 해설 ${notes.length}개 — 문제 ${problems.length}건`);
problems.slice(0, 40).forEach((x) => console.log('  ' + x));
if (problems.length) process.exit(1);
