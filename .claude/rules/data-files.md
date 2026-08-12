---
paths:
  - "nikke-site/data/**"
---

# 데이터 파일을 고칠 때

- **A(1차 출처에서 그대로 옮긴 값)만 반영한다. B(추론·해석)는 제안만 한다.**
  `totemRole` 신규 등록과 오버스펙 판정은 **언제나 B**다.
- 캐릭터를 추가하면 `id/title/name_kr/name_ja/class/burst/element/weapon/releaseDate/tiers/skills[3]`을
  **전부** 채운다. `name_ja`가 없으면 `checkData`가 ERROR를 낸다.
- 이름 표기가 어긋나면 **에러 없이 그 캐릭터가 모든 추천에서 조용히 빠진다.**
  실제로 `name_kr`이 `"{{hover"`(위키 템플릿 잔재)여서 홍련(PvP SS)이 통째로 누락된 적 있다.
- 캐릭터 데이터는 **두 벌**이다 — 화면이 그리는 `characters.js`(168명)와 엔진이 쓰는
  `characterDatabase.json`(196명). 연결은 **id로만** 한다. 이름 매칭은 금지.
- 고친 뒤 반드시 `/verify`. 기준선: `checkData` ERROR 0 / WARN 3, `findTotems` 1군 0명.

자세한 내용: `docs/data.md`, `docs/weekly-research.md`
