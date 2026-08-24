// 캐릭터 객체의 표시 이름 — **데이터 파일을 읽지 않는 순수 모듈** (2026-08-24 분리)
//
// ■ 왜 lib/characterNames.js에서 떼어냈는가
//
//   memberName은 넘겨받은 객체({ title, name_kr, name_ja })만 보는 순수 함수인데,
//   lib/characterNames.js는 최상위에서 characterDatabase.json(666KB)과 characters.js를
//   읽는다. 그래서 **클라이언트 컴포넌트가 이 함수 하나 때문에 666KB를 번들에 싣는다.**
//   도감을 다국어로 바꾸면서 실제로 /nikke의 First Load JS가 94kB -> 347kB로 뛰었다.
//
//   그렇다고 클라이언트 쪽에 같은 규칙을 복사해 두면 `.claude/rules/ui-i18n.md`가 막는
//   "이름 규칙이 두 곳으로 갈라지는" 상태가 된다. 그래서 **정의를 여기 하나만 두고**
//   lib/characterNames.js가 이걸 재수출한다. 규칙은 한 곳, import 경로만 둘이다.
//
// ⚠️ 이름 규칙을 바꾸려면 이 파일만 고친다.

// 조합 멤버·캐릭터 객체({ id, title, name_kr, name_ja })의 표시 이름.
//
// 엔진이 내려보낸 멤버의 id는 characterDatabase의 id라서 로스터 기준 이름표로는 찾을 수
// 없다. 그래서 객체가 들고 온 표기를 그대로 쓴다 — lib/synergyEngine.js가 name_ja를
// 함께 실어 보내야 일본어가 나온다.
export function memberName(m, lang) {
  if (!m) return '';
  if (lang === 'ja') return m.name_ja || m.name_kr || m.title || '';
  if (lang === 'en') return m.title || m.name_kr || '';
  return m.name_kr || m.title || '';
}
