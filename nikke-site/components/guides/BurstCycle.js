import { BURST, USAGE } from '@/lib/guideStats';
import { Section, Table, Note, CharLink, Lead } from './GuideBits';

// 가이드 ②: 버스트 쿨타임.
//
// 이 글의 규칙과 실측은 우리 추천 엔진(lib/synergyEngine.js)이 실제로 쓰는 것이다.
// 배치 순서 규칙만 외부 출처(인벤)이고 본문에 그렇게 밝혀 뒀다 — docs/engine.md 4-3-e.

export default function BurstCycle() {
  const cd40 = BURST.cooldowns.find((c) => c.cd === 40);
  const cd20 = BURST.cooldowns.find((c) => c.cd === BURST.fastCd);
  const total = BURST.total;
  const b3 = BURST.byStageCd.find((s) => s.stage === '3');
  const b3Fast = b3?.cds.filter((x) => x.cd <= BURST.fastCd).reduce((a, x) => a + x.n, 0) ?? 0;
  const b3Slow = b3 ? b3.n - b3Fast : 0;
  const s1 = BURST.byStageClass.find((s) => s.stage === '1');
  const s3 = BURST.byStageClass.find((s) => s.stage === '3');
  const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  // 쿨타임이 기준(fastCd)의 몇 배인가 — 사이클 길이를 가정하지 않고 데이터에서 그대로 나오는 비율
  const ratio = (cd) => (cd <= BURST.fastCd ? '기준(가장 잦음)' : `기준의 1/${Math.round(cd / BURST.fastCd)}`);

  return (
    <>
      <Lead>
        조합을 짤 때 &ldquo;버스트 1·2·3을 하나씩 넣으면 된다&rdquo;는 말을 자주 듣는다. 반은 맞고 반은 틀리다.
        <strong className="text-slate-100"> 한 번은 그렇게 돌지만, 두 번째부터 멈추기 때문이다.</strong>{' '}
        풀버스트 사이클과 버스트 스킬 쿨타임의 길이가 다른 탓인데, 이 글은 그 어긋남이 어디서 오고
        어떻게 메우는지를 정리한다.
      </Lead>

      <Section id="mismatch" title={`버스트 쿨타임은 사실상 두 종류다 — ${cd20?.cd}초와 ${cd40?.cd}초`}>
        <p>
          캐릭터 {total}명의 버스트 스킬 쿨타임을 세어 보면 이렇게 갈린다.
        </p>
        <Table
          head={['버스트 쿨타임', '인원', '쓸 수 있는 빈도']}
          align={['', 'r', '']}
          rows={BURST.cooldowns.map((c) => [`${c.cd}초`, `${c.n}명`, ratio(c.cd)])}
        />
        <p>
          이 사이트의 추천 엔진은 <strong className="text-slate-100">쿨타임 {BURST.fastCd}초를 &ldquo;풀버스트가 열릴 때마다
          쓸 수 있는 빠른 버스트&rdquo;의 기준</strong>으로 삼는다. 실제 풀버스트가 몇 초마다 돌아오는지는 팀의
          게이지 충전 속도에 따라 달라서 여기서 초 단위로 못 박지 않는다. 다만 표에서 그대로 따라 나오는
          사실이 있다 — <strong className="text-slate-100">쿨 {cd40?.cd}초는 쿨 {cd20?.cd}초의 절반 빈도</strong>다.
          {total}명 중 {cd40?.n}명이 그렇다.
        </p>
        <p>
          그리고 이게 이 글에서 제일 중요한 숫자다. <strong className="text-slate-100">3단계 {b3?.n}명 중
          {cd20?.cd}초 이하는 {b3Fast}명</strong>이다.{b3Fast === 0 ? ' 한 명도 없다.' : ''} 딜러가 서는 3단계는
          예외 없이 {cd40?.cd}초 이상이라, <strong className="text-slate-100">딜러 한 명으로는 풀버스트를 한 번
          걸러 한 번만 연다.</strong> 매번 열고 싶으면 3단계가 둘이어야 한다.
        </p>
        <p>
          여기서 흔한 실수가 나온다. 버스트 1·2·3을 한 명씩 넣고 남은 두 자리를 딜러로 채우면, 첫 풀버스트는
          완벽하게 돌고 <strong className="text-slate-100">두 번째에서 {cd40?.cd}초짜리 자리가 빈다.</strong>{' '}
          화면상으로는 아무 경고도 안 뜨고, 그냥 버스트가 늦게 터진다.
        </p>
        <Note>
          그래서 실전 조합은 같은 버스트 단계를 <strong className="text-slate-300">두 명</strong> 넣는 경우가
          많다. {cd40?.cd}초짜리 둘을 번갈아 쓰면 그 단계가 매번 열린다. 조합에서 &ldquo;왜 같은 버스트가
          둘이지?&rdquo; 싶은 자리는 대개 이 계산이다.
        </Note>
      </Section>

      <Section id="stages" title="단계별 인원 — 2·3단계는 넉넉하고 1단계가 병목이다">
        <Table
          head={['버스트 단계', '인원', '비중']}
          align={['', 'r', 'r']}
          rows={BURST.byStage.map((s) => [
            `${s.stage}단계`, `${s.n}명`, `${Math.round((s.n / total) * 100)}%`,
          ])}
        />
        <p>
          {BURST.byStage[0].stage}단계가 {BURST.byStage[0].n}명으로 가장 적다. 조합이 안 짜일 때 모자란 쪽은
          대개 여기다. 클래스를 세어 보면 이유가 보인다 — 1단계는{' '}
          <strong className="text-slate-100">{pctOf((s1?.supporter ?? 0) + (s1?.defender ?? 0), s1?.n)}%가 지원·방어형</strong>이고,
          화력형은 3단계에 {pctOf(s3?.attacker ?? 0, s3?.n)}% 몰려 있다. 딜러를 모으는 데 집중하면 1단계가 비는
          구조다.
        </p>
      </Section>

      <Section id="flex" title="자리를 바꿔 서는 캐릭터">
        <p>
          몇몇은 정해진 한 단계에만 서지 않는다. <strong className="text-slate-100">유동 버스트</strong>는
          비어 있는 단계에 맞춰 들어간다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          {BURST.flex.map((c) => (
            <li key={c.title}><CharLink c={c} /></li>
          ))}
        </ul>
        <p>
          {BURST.flex.length}명뿐이지만 조합을 짤 때의 가치는 숫자보다 크다. 부족한 단계를 메워주기 때문에
          &ldquo;한 명이 없어서 조합이 안 되는&rdquo; 상황을 자주 풀어준다.
        </p>
      </Section>

      <Section id="reentry" title={`재진입 — 그 단계가 한 사이클에 두 번 열린다 (${BURST.reentry.length}명)`}>
        <p>
          재진입을 가진 캐릭터는 같은 단계의 동료가 버스트를 쓴 뒤 <strong className="text-slate-100">
          한 번 더</strong> 그 단계를 열 수 있다. 즉 그 자리의 두 번째 인원이 잉여가 아니라 설계된 짝이다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          {BURST.reentry.map((c) => (
            <li key={c.title}><CharLink c={c} /></li>
          ))}
        </ul>
        <p>
          앞에서 본 실사용 통계에서 <CharLink c={USAGE.top[0]} />가 {USAGE.total}건 중 {USAGE.top[0].n}건으로
          1위였는데, 그가 바로 이 재진입 캐릭터다. 다른 같은 단계 동료가 있을 때만 재진입으로 전환되는
          방식이라, 혼자 쓰면 이 값이 안 나온다.
        </p>

        <h3 className="text-base font-bold text-slate-100 pt-2">배치 순서를 틀리면 재진입이 아예 안 터진다</h3>
        <p>
          여기가 이 글에서 제일 실수하기 쉬운 부분이다. 파티의 니케는{' '}
          <strong className="text-slate-100">왼쪽에서 오른쪽 순으로</strong> 버스트를 쓴다. 그래서 재진입
          캐릭터는 같은 단계 동료보다 <strong className="text-slate-100">왼쪽</strong>에 있어야 한다.
          오른쪽에 두면 동료가 먼저 써버려서 재진입 조건이 성립하지 않는다.
        </p>
        <Note kind="warn">
          <strong>이 사이트도 이걸 틀리고 있었다.</strong> 추천 결과의 표시 순서를 쿨타임이 짧은 쪽부터로
          정렬해 두었는데, 재진입 캐릭터는 쿨타임이 긴 편이라 자꾸 오른쪽으로 밀렸다. 실사용 조합{' '}
          {USAGE.total}건 중 재진입 캐릭터가 같은 단계 동료와 함께 있는 16건을 대조해 보니{' '}
          <strong>11건에서 우리 순서가 재진입을 무력화</strong>하고 있었다. 정렬 규칙에 재진입 우선을
          넣어 11건 → 0건으로 고쳤다(2026-09-01).
        </Note>
        <p className="text-sm text-slate-400">
          배치 순서 규칙의 출처는 인벤 「꼭 알아야 하는 니케 배치 방법」이다. 몇 명이 재진입을 가지는지와
          위의 16건·11건은 이 사이트가 직접 센 값이다.
        </p>
      </Section>

      <Section id="summary" title="정리">
        <ul className="list-disc pl-5 space-y-2">
          <li>버스트 쿨타임은 {cd20?.cd}초와 {cd40?.cd}초로 갈리고, {cd40?.cd}초는 절반 빈도다. <strong className="text-slate-100">3단계는 {b3Slow}/{b3?.n}명이 {cd40?.cd}초 이상</strong> — 딜러 한 명으로는 한 번 걸러 한 번이다.</li>
          <li>그래서 같은 단계를 두 명 넣는 조합이 흔하다. 낭비가 아니라 사이클을 메우는 것이다.</li>
          <li>{BURST.byStage[0].stage}단계가 {BURST.byStage[0].n}명으로 가장 적어 병목이 되기 쉽다.</li>
          <li>재진입 {BURST.reentry.length}명은 <strong className="text-slate-100">같은 단계 동료보다 왼쪽</strong>에 둔다. 순서가 곧 발동 조건이다.</li>
        </ul>
      </Section>
    </>
  );
}
