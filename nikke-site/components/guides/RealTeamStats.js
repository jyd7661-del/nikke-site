import { USAGE, PAIRS, CLASS_KR } from '@/lib/guideStats';
import { Section, Table, Note, CharLink, Lead } from './GuideBits';

// 가이드 ①: 실사용 조합 214건을 캐릭터 기준으로 뒤집은 통계.
//
// 이 글의 숫자는 **전부 lib/guideStats.js가 빌드 때 센 값**이다. 본문에 손으로 적은
// 수치가 하나도 없어야 한다 — scripts/testGuides.mjs가 그걸 검사한다.

const pct = (n) => Math.round((n / USAGE.total) * 100);

export default function RealTeamStats() {
  const [first, second, third, fourth] = USAGE.top;
  const unseen = USAGE.charactersTotal - USAGE.charactersSeen;

  return (
    <>
      <Lead>
        이 사이트는 실제로 쓰인 5인 조합 {USAGE.total}건을 데이터로 갖고 있다. 솔로레이드·타워·캠페인·
        챔피언 아레나에서 클리어에 쓰인 편성들이다. 보통은 &ldquo;이 보스엔 이 조합&rdquo; 식으로 조합 하나씩
        읽게 되는데, 이번엔 반대로 세어봤다. <strong className="text-slate-100">조합이 아니라 캐릭터를 기준으로</strong>{' '}
        다시 세면 무엇이 보이는지에 대한 글이다.
      </Lead>

      <Section id="what" title="무엇을 셌나">
        <p>
          {USAGE.total}건의 출처는 네 갈래이고 성격이 서로 다르다. 솔로레이드는 시즌마다 보스와 약점 속성이
          바뀌고, 타워는 로스터 풀(트라이브·기업별)이 갈리고, 캠페인과 아레나는 또 다른 환경이다.
        </p>
        <Table
          head={['갈래', '조합 수', '이 표에서의 성격']}
          align={['', 'r', '']}
          rows={[
            ['솔로레이드', `${USAGE.byKind.raid}건`, '시즌·보스·약점 속성이 조건으로 붙는다'],
            ['타워', `${USAGE.byKind.tower}건`, '트라이브 타워와 기업별 타워의 로스터 풀이 다르다'],
            ['캠페인', `${USAGE.byKind.campaign}건`, '스테이지 진행용'],
            ['챔피언 아레나', `${USAGE.byKind.pvp}건`, 'PvP. 배치 순서까지 의미가 있다'],
          ]}
        />
        <p>
          세는 방법은 하나로 통일했다. <strong className="text-slate-100">
          &ldquo;이 캐릭터가 몇 건의 조합에 이름을 올렸는가&rdquo;</strong>다. 사용 횟수나 데미지를 더하지 않았다 —
          그건 더하면 안 되는 값이기 때문이다(아래 주의 참고).
        </p>
      </Section>

      <Section id="top" title={`가장 많이 등장하는 ${USAGE.top.length}명`}>
        <Table
          head={['', '캐릭터', '등장', '비율']}
          align={['r', '', 'r', 'r']}
          rows={USAGE.top.map((c, i) => [
            `${i + 1}`,
            <CharLink key={c.title} c={c} />,
            `${c.n}건`,
            `${pct(c.n)}%`,
          ])}
        />
        <p>
          1위 <CharLink c={first} />는 {USAGE.total}건 중 {first.n}건, 그러니까{' '}
          <strong className="text-slate-100">{pct(first.n)}%의 조합에 들어 있다.</strong> 세 판에 한 판꼴이다.
          2위 <CharLink c={second} />({pct(second.n)}%), 3위 <CharLink c={third} />({pct(third.n)}%),
          4위 <CharLink c={fourth} />({pct(fourth.n)}%)까지가 한 덩어리다.
        </p>
        {USAGE.topNonDealers.length > 0 ? (
          <p>
            눈여겨볼 것은 <strong className="text-slate-100">상위 {USAGE.topN}명 중 {USAGE.topNonDealers.length}명이
            화력형이 아니라는 점</strong>이다 — {USAGE.topNonDealers.map((c, i) => (
              <span key={c.title}>{i > 0 && ', '}{c.rank}위 <CharLink c={c} />({CLASS_KR[c.cls] || c.cls})</span>
            ))}. 조합을 짤 때 &ldquo;누가 제일 세게 때리는가&rdquo;부터 고르기 쉬운데, 실제로 자리를 가장
            확실하게 차지하는 것은 팀 전체를 굴러가게 만드는 쪽이다.
          </p>
        ) : (
          <p>상위 {USAGE.topN}명이 전부 화력형이다 — 이 시즌 데이터에서는 딜러가 자리를 독점하고 있다.</p>
        )}
      </Section>

      <Section id="pairs" title="늘 붙어 다니는 조합">
        <p>
          두 명씩 묶어 세면 조합의 뼈대가 드러난다. 아래는 같은 조합에 함께 이름을 올린 횟수 상위{' '}
          {PAIRS.length}쌍이다.
        </p>
        <Table
          head={['', '두 캐릭터', '함께 등장']}
          align={['r', '', 'r']}
          rows={PAIRS.map((p, i) => [
            `${i + 1}`,
            <span key={i}><CharLink c={p.a} /> <span className="text-slate-600">+</span> <CharLink c={p.b} /></span>,
            `${p.n}건`,
          ])}
        />
        <p>
          1위 쌍은 <CharLink c={PAIRS[0].a} /> + <CharLink c={PAIRS[0].b} />로 {PAIRS[0].n}건이다.
          1위 캐릭터의 {first.n}건 중 {Math.round((PAIRS[0].n / first.n) * 100)}%가 이 둘이 같이 있는
          경우라는 뜻이다. 한 명을 뽑았으면 다른 한 명도 거의 자동으로 따라온다.
        </p>
        <p>
          이 표가 보여주는 실질적인 사실은 이렇다. <strong className="text-slate-100">
          조합은 다섯 자리를 따로따로 채우는 게임이 아니다.</strong> 두세 명이 한 덩어리로 붙고, 남는 자리를
          상황에 맞춰 바꾸는 형태다. 그래서 &ldquo;좋은 캐릭터를 모았는데 조합이 안 나온다&rdquo;는 일이 생긴다 —
          덩어리의 짝이 없기 때문이다.
        </p>
      </Section>

      <Section id="unseen" title={`그리고 ${unseen}명은 한 번도 나오지 않는다`}>
        <p>
          도감에 실린 {USAGE.charactersTotal}명 중 이 {USAGE.total}건에 한 번이라도 이름을 올린 것은{' '}
          <strong className="text-slate-100">{USAGE.charactersSeen}명</strong>이다. 나머지 {unseen}명,
          그러니까 절반이 조금 넘는 인원은 여기에 없다.
        </p>
        <Note kind="warn">
          <strong>다만 이걸 &ldquo;{unseen}명은 쓸모없다&rdquo;로 읽으면 안 된다.</strong> 이 표의 출처는 상위
          기록만 게시한다. 상위권에 없다는 것과 약하다는 것은 다르다. 게다가 여기 실린 조합은 대부분
          <strong> 완성된 로스터를 전제로 한 최적해</strong>다 — 가진 캐릭터가 적을 때의 답과는 다른 문제다.
        </Note>
        <p>
          이 사이트의 추천 기능이 이 지점을 위해 있다. 완성 조합은 이런 표를 보면 되지만, 보유한 캐릭터가
          여기 상위권과 겹치지 않을 때는 표가 답을 주지 않는다. 그때는 가진 것 안에서 버스트 단계를 맞추고
          역할을 채우는 계산이 따로 필요하다.
        </p>
      </Section>

      <Section id="caution" title="이 통계를 읽을 때의 주의">
        <Note>
          <p className="mb-2">
            <strong className="text-slate-300">더하면 안 되는 값이 있다.</strong> 솔로레이드의 기록 수는
            서버별 표본이고, 타워의 클리어 비율은 각 로스터 풀 안에서의 비율이다. 서로 분모가 달라서
            조합끼리 더하면 뜻이 없어진다. 그래서 이 글은 처음부터 끝까지{' '}
            <strong className="text-slate-300">&ldquo;몇 건에 등장했는가&rdquo;</strong>만 센다. 계수는 분모가
            {' '}{USAGE.total}건 하나라 안전하다.
          </p>
          <p>
            <strong className="text-slate-300">출처.</strong> 조합 원본은 enikk.app의 공개 집계 화면에서
            사람이 옮긴 것이고, 캐릭터 정보는 이 사이트의 도감 데이터다. 이 글의 모든 수치는 그 원본에서
            빌드할 때 다시 세어 만든다 — 손으로 적은 숫자는 한 개도 없다.
          </p>
        </Note>
      </Section>
    </>
  );
}
