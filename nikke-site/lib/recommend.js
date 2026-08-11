import { CHARACTERS } from '@/data/characters';

// 로스터 id → 캐릭터 객체. 커뮤니티 조합 화면에서 멤버 아바타를 그릴 때 씁니다.
const charMap = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

// 예전에는 여기서 세 가지를 계산했습니다:
//   fullMatches   — 지금 바로 만들 수 있는 '알려진 메타 조합'
//   partialMatches— 1~2명만 더 모으면 완성되는 조합
//   autoTeam      — 보유 캐릭터를 티어순으로 채운 자동 팀
//
// 2026-08-11에 전부 걷어냈습니다. 이유:
//   · fullMatches / autoTeam 은 **화면에서 참조가 0회**였습니다. AI 추천(app/api/ai-recommend)이
//     같은 일을 실사용 데이터 근거로 더 잘하게 되면서 표시가 빠졌는데 계산만 남아 있었습니다.
//   · partialMatches("조금만 더 모으면 완성되는 조합")는 화면에 나왔지만 두 가지가 문제였습니다.
//     ① 근거였던 data/combos.js가 "주기적으로 업데이트가 필요합니다"라고 적어둔 **초안 목록**인데
//        주간 예약 작업의 갱신 대상이 아니라 한 번도 갱신되지 않았습니다. 멤버를 enikk 실사용
//        데이터와 대조하니 PvE 조합 3건이 5명 중 2명만 실사용에 등재돼 있었습니다
//        (예: 대표 조합이 크라운·리타·레드후드·모더니아·나가인데, 실제 1위 조합과 겹치는 건 크라운 하나).
//     ② 뽑기 게임이라 "이 캐릭터를 더 모으세요"는 사용자가 실행할 수 없는 조언입니다.
//        AI 추천이 이미 "가진 것으로 최선"을 만들어 주므로 역할도 겹칩니다.
//   · 낡은 정보가 같은 화면에서 AI 추천과 다른 말을 해 신뢰를 깎고 있었습니다.
//
// 되살리려면 수기 목록이 아니라 data/metaStats.json 의 campaignCompositions.list(20건)와
// pvp.topTeams(25건)에서 뽑으세요. 주간 작업이 갱신하는 파일이라 저절로 최신이 됩니다.
export function recommend(ownedIds) {
  const owned = new Set(ownedIds);
  return {
    ownedCount: CHARACTERS.filter((c) => owned.has(c.id)).length,
  };
}

export { charMap };
