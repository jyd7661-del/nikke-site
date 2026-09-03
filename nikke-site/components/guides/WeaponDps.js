import { WEAPONS, WEAPON_POPULATION } from '@/lib/guideStats';
import { Section, Table, Note, Lead } from './GuideBits';

// 가이드 ③: 무기 타입별 평타 DPS.
//
// 6초 상수와 풀차지 배율은 이 사이트가 데이터를 모으다 발견한 것이다. 출처는 본문에 밝힌다.
// 계수·장탄·재장전 = Fandom 위키, 연사속도 = 아카라이브 커뮤니티 글. 둘 다 2차 출처(B등급)이고
// 인게임과 대조하지는 않았다 — 그 한계도 본문에 적어 둔다.

const TYPE_KR = { ar: '돌격소총 AR', smg: '기관단총 SMG', sg: '샷건 SG', sr: '저격총 SR', rl: '런처 RL', mg: '기관총 MG' };

export default function WeaponDps() {
  const top = WEAPONS.types[0];
  const bottom = WEAPONS.types[WEAPONS.types.length - 1];
  const charge = WEAPONS.types.filter((t) => t.chargeSec);
  const pop = new Map(WEAPON_POPULATION.map((p) => [p.type, p.n]));
  const ar = WEAPONS.types.find((t) => t.type === 'ar');
  const mg = WEAPONS.types.find((t) => t.type === 'mg');
  const sg = WEAPONS.types.find((t) => t.type === 'sg');
  const DISPUTED_AR_RATE = 12;   // 다른 자료가 주장하는 값. 우리 데이터가 아니라 반박 대상이라 리터럴이다.

  return (
    <>
      <Lead>
        &ldquo;이 무기가 세다&rdquo;는 말은 많은데 숫자로 본 적은 드물다. 무기 {WEAPONS.totalKinds}종의 한 발당
        계수·장탄수·재장전 시간을 모아 <strong className="text-slate-100">타입별 평타 DPS</strong>를 직접
        계산해봤다. 계산하다 재미있는 상수를 하나 발견했고, 흔한 오해도 하나 깨졌다.
      </Lead>

      <Section id="how" title="계산 방법">
        <p>
          평타 DPS는 이렇게 나온다. 한 탄창을 다 쏘고 재장전까지 마치는 것을 한 주기로 본다.
        </p>
        <div className="rounded-lg bg-slate-800/60 border border-slate-700 px-4 py-3 font-mono text-sm text-slate-300 overflow-x-auto">
          DPS = (1발당 계수 × 장탄수) ÷ (장탄수 ÷ 연사속도 + 재장전 시간)
        </div>
        <p>
          계수는 &ldquo;최종 공격력의 몇 %&rdquo;라서 단위가 %다. 캐릭터의 공격력이 아니라{' '}
          <strong className="text-slate-100">무기끼리의 상대 비교</strong>에 쓰는 값이다.
        </p>
      </Section>

      <Section id="constant" title={`발견 — 장탄수 ÷ 연사속도가 전부 정확히 ${WEAPONS.magazineSeconds}초다`}>
        <p>
          계산하려면 연사속도가 필요한데, 무기 표에는 장탄수와 재장전만 있고 연사속도가 없다. 커뮤니티
          자료에서 값을 구해 넣어 보다가 이걸 발견했다.
        </p>
        {WEAPONS.selfCheck && (
          <Table
            head={['타입', '장탄수 ÷ 연사속도']}
            rows={Object.entries(WEAPONS.selfCheck).map(([t, v]) => [TYPE_KR[t] || t.toUpperCase(), v])}
          />
        )}
        <p>
          <strong className="text-slate-100">한 탄창을 비우는 데 걸리는 시간이 모든 타입에서 똑같이{' '}
          {WEAPONS.magazineSeconds}초</strong>다. 장탄수는 위키에서, 연사속도는 3년 전 커뮤니티 글에서
          왔는데도 이렇게 맞아떨어진다. 우연으로 보기 어려운 설계 상수이고,{' '}
          <strong className="text-slate-100">두 출처가 서로를 검증해준다</strong>는 점이 더 중요하다.
        </p>
        <Note>
          이 상수 덕분에 논쟁 하나가 정리됐다. AR 연사속도를 {ar.rate}발/초로 보는 자료와 {DISPUTED_AR_RATE}발/초로 보는 자료가
          있는데, {DISPUTED_AR_RATE}라면 {ar.cap} ÷ {DISPUTED_AR_RATE} = {(ar.cap / DISPUTED_AR_RATE).toFixed(1)}초가 되어 혼자 패턴을 깬다.{' '}
          <strong className="text-slate-300">{ar.rate}이 맞다.</strong> 또 3년 전 글의 연사속도가 지금의 장탄수와 정확히 맞으므로, 그 사이에 값이 바뀌지
          않았다고 볼 근거도 생긴다.
        </Note>
      </Section>

      <Section id="table" title="타입별 평타 DPS">
        <Table
          head={['타입', '보유', '1발당', '장탄', '연사(/초)', '재장전', '주기', 'DPS']}
          align={['', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
          rows={WEAPONS.types.map((t) => [
            TYPE_KR[t.type] || t.type.toUpperCase(),
            `${pop.get(t.type) ?? 0}명`,
            `${t.coef}%`,
            `${t.cap}발`,
            t.chargeSec ? `${t.rate} (차지)` : `${t.rate}`,
            `${t.rel}초`,
            `${t.cycleSec}초`,
            `${t.dps}%`,
          ])}
        />
        <p className="text-sm text-slate-400">
          각 칸은 그 타입에 속한 무기들의 중앙값이다. 보유 인원은 이 사이트 도감 기준이다.
        </p>
        <p>
          1위 {TYPE_KR[top.type]}({top.dps}%)와 꼴찌 {TYPE_KR[bottom.type]}({bottom.dps}%)의 차이는{' '}
          <strong className="text-slate-100">{WEAPONS.spread}배</strong>다.
        </p>
      </Section>

      <Section id="charge" title="SR·RL이 약해 보였던 이유 — 풀차지 배율">
        <p>
          이 사이트도 처음에는 저격총과 런처를 크게 과소평가하고 있었다. 계산에{' '}
          <strong className="text-slate-100">풀차지 배율을 빼먹었기</strong> 때문이다.
        </p>
        <p>
          차지 무기는 한 발이 곧 풀차지 사격이고, 위키 설명에 배율이 그대로 적혀 있다 —{' '}
          <code className="text-sky-300 text-sm">Full Charge Damage: 250% of damage</code>. 이걸 안 넣으면
          한 발의 위력이 {(charge[0].chargeMult / 100).toFixed(1)}배 낮게 잡힌다.
        </p>
        <Table
          head={['타입', '차지 시간', '풀차지 배율', '실효 연사', 'DPS']}
          align={['', 'r', 'r', 'r', 'r']}
          rows={charge.map((t) => [
            TYPE_KR[t.type] || t.type.toUpperCase(),
            `${t.chargeSec}초`,
            `${t.chargeMult}%`,
            `${t.rate}/초`,
            `${t.dps}%`,
          ])}
        />
        <p>
          배율을 빼고 계산하면 타입 간 격차가 {WEAPONS.spreadWithoutCharge}배로 벌어져서 저격총과 런처가 쓰레기처럼 보인다.
          제대로 넣으면 <strong className="text-slate-100">{WEAPONS.spread}배</strong>다. 게임이 무기를
          그 정도 폭으로 균형 잡아 뒀다고 보는 편이 훨씬 자연스럽다.
        </p>
        <p className="text-sm text-slate-400">
          이 오류는 &ldquo;스노우 화이트: 헤비암즈가 최고 딜러로 평가받는데 왜 우리 계산에서는 낮은가&rdquo;라는
          지적에서 잡혔다. 실제로 배율이 빠져 있었다.
        </p>
      </Section>

      <Section id="limits" title="이 숫자가 말하지 않는 것">
        <p>
          여기까지가 <strong className="text-slate-100">원시 평타 DPS</strong>다. 실전 세기 순서가 아니다.
          빠진 것이 최소 세 가지 있고, 전부 표로 만들 수 없는 값이다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-slate-100">코어 히트.</strong> 약점을 맞히면 배율이 붙는데, 적중률은
            적의 크기·거리에 좌우된다. 샷건처럼 한 발을 여러 탄으로 쪼개 쏘는 무기는 코어 적중률이 낮다.
          </li>
          <li>
            <strong className="text-slate-100">다중 대상·관통.</strong> 락온으로 여러 대상을 동시에 때리거나
            관통이 붙는 경우 실제 피해는 표의 몇 배가 된다. 평균 대상 수는 상황마다 다르다.
          </li>
          <li>
            <strong className="text-slate-100">스킬.</strong> 캐릭터 위력의 상당 부분은 평타가 아니라
            스킬에서 나온다. 특히 &ldquo;평타 N발마다&rdquo; 발동하는 스킬은 연사속도가 빠른 무기에서 훨씬
            자주 터진다 — 같은 {WEAPONS.magazineSeconds}초에 기관총은 {mg?.cap}발, 샷건은 {sg?.cap}발을 쏜다.
          </li>
        </ul>
        <Note kind="warn">
          <strong>정리하면 이 표는 무기 타입을 고르는 기준이 아니다.</strong> 같은 타입 안에서 무기를
          비교하거나, 왜 어떤 스킬이 특정 무기에서 잘 터지는지 이해하는 용도로 보는 것이 맞다.
        </Note>
      </Section>

      <Section id="source" title="출처와 등급">
        <Note>
          <p className="mb-2">
            <strong className="text-slate-300">계수·장탄수·재장전·차지 배율</strong> — 니케 국제 위키(Fandom)의
            무기 타입별 문서. {WEAPONS.totalKinds}종을 옮겼다.
          </p>
          <p className="mb-2">
            <strong className="text-slate-300">연사속도</strong> — 아카라이브 승리의 여신: 니케 채널의
            무기별 DPS 정리 글(2023). 단일 출처지만 위 {WEAPONS.magazineSeconds}초 상수가 이를 뒷받침한다.
          </p>
          <p>
            둘 다 <strong className="text-slate-300">2차 출처</strong>다. 위키와 커뮤니티가 인게임 값을 옮긴
            것을 우리가 다시 옮겼고, 인게임과 직접 대조하지는 않았다. 표에 나오는 DPS는 이 사이트가 위
            공식으로 계산한 값이다.
          </p>
        </Note>
      </Section>
    </>
  );
}
