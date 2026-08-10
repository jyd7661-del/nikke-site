'use client';

import { useState, useEffect } from 'react';
import CharacterAvatar from '@/components/CharacterAvatar';
import { useLanguage } from '@/components/LanguageProvider';

const AI_MODES = [
  { key: 'campaign', label: '캠페인' },
  { key: 'bossing', label: '보스전' },
  { key: 'pvp', label: 'PvP' },
  { key: 'tribe_tower', label: '타워' },
];

// 기업 타워 선택지. lib/synergyEngine.js의 TOWER_CORPS / TOWER_LABEL과 반드시 일치해야 한다.
//
// ⚠️ 요일을 2026-08-09에 고쳤습니다. 이전 값(월 전체 / 목·일 테트라)은 틀렸습니다.
//
// 처음엔 prydwen 가이드를 그대로 옮겨 "월요일에 전부 열린다"고 적었는데, 일본 위키
// (wiki3.jp/nikke/page/992)와 대조하니 요일이 어긋났습니다. 한국 서버를 직접 하는 유저가
// **"일요일에 모든 타워가 열린다"** 고 확인해줬고, 그 기준으로 두 출처가 정확히 맞아떨어집니다:
//   전부 열리는 날을 일요일로 두면 → 화·금 엘리시온 / 수·토 미실리스 / 목 테트라 / 수 필그림
//   으로 양쪽이 완전히 일치. prydwen 쪽은 "전체 개방일"만 월요일로 잘못 적고 있었습니다.
//
// 남은 불확실성: **테트라의 월요일은 일본 위키 한 곳만 근거**입니다. 우리 옛 데이터는 월요일을
// 전체 개방일로 착각하고 있어서 테트라 단독 요일로는 세지 않았습니다. 유저 확인 전까지
// 이 한 칸만 근거가 약하다는 점을 알고 있을 것.
//
// 요일 강조 표시는 일부러 넣지 않았다 — SSR과 클라이언트의 날짜가 어긋나면
// 하이드레이션 불일치가 나는데, 이 저장소는 npm이 막혀 로컬 빌드 검증이 안 된다(HANDOFF §8).
// 요일은 버튼 옆 고정 문구로만 알린다.
const TOWER_OPTIONS = [
  { key: null, label: '일반 트라이브', days: '상시' },
  { key: 'elysion', label: '엘리시온', days: '화·금·일' },
  { key: 'missilis', label: '미실리스', days: '수·토·일' },
  { key: 'tetra', label: '테트라', days: '월·목·일' },
  { key: 'pilgrim', label: '필그림/오버스펙', days: '수·일' },
];

// 솔로 레이드 보스 약점 속성 선택지. lib/synergyEngine.js의 BOSS_ELEMENTS,
// data/metaStats.json의 soloRaidByElement 키와 반드시 일치해야 함.
const BOSS_ELEMENT_OPTIONS = [
  { key: 'Iron', label: '철' },
  { key: 'Wind', label: '바람' },
  { key: 'Water', label: '물' },
  { key: 'Electronic', label: '전기' },
  { key: 'Fire', label: '불' },
];

// AI가 "규칙 엔진이 미리 뽑아둔 후보 중 하나를 설명"하는 게 아니라, 보유 로스터(roster.resolved)와
// 공략 근거자료를 통째로 서버(app/api/ai-recommend)에 넘겨 AI가 직접 5인 조합을 구성하게 하는 버튼.
// 응답에 포함된 team.reasons/totalScore는 lib/synergyEngine.js의 scoreTeam이 AI의 결과물을 사후
// 검증/채점한 것이고, aiReasoning은 AI가 직접 쓴 구성 이유다.
// "다른 조합 보기"를 누르면 이전까지 나온 멤버 목록을 excludeTitles로 함께 보내 겹치지 않는 조합을 유도한다.
// 👍/👎 버튼은 app/api/ai-recommend/feedback에 평가를 저장하고, 그 통계는 다음 AI 추천 호출 때
// app/api/ai-recommend가 "반응 좋았던 조합" 힌트로 다시 읽어 프롬프트에 실어 보낸다.
// 조합이 어느 근거에서 나왔는지 표시하는 라벨.
// 유저 정의: "검증된 조합"이란 사람들이 두루두루 쓰는 조합(enikk 실사용) 또는 prydwen에
// 등록된 조합이며, 둘은 대등하다. 어느 쪽 근거인지 밝혀야 사용자가 판단할 수 있다.
const SOURCE_LABEL = {
  'enikk-real-usage': '실사용 검증',
  'prydwen-exact-match': 'prydwen 등록',
  'skill-synergy-fallback': '보유 조합 탐색',
};

function AiRecommendButton({ roster, mode, bossElement, tower }) {
  const { lang } = useLanguage();
  const [phase, setPhase] = useState('idle'); // idle | loading | error
  const [team, setTeam] = useState(null);
  const [reasoning, setReasoning] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [excludeTitles, setExcludeTitles] = useState([]);
  const [feedback, setFeedback] = useState(null); // null | 'sending' | 'up' | 'down'
  // 2026-08-08: enikk 실사용 조합과 prydwen 등록 조합을 같은 층에서 점수로 비교하고,
  // 진 쪽도 함께 보여준다. 둘은 서로 다른 질문에 대한 답이라 하나만 띄우면 나머지가
  // 있었다는 사실 자체가 사용자에게 보이지 않는다.
  const [alternative, setAlternative] = useState(null);
  const [source, setSource] = useState(null);
  // 일일 총 상한(서킷 브레이커)에 걸려 AI 문장 없이 근거 문장으로 나온 경우.
  // 표시가 없으면 사용자는 "왜 갑자기 설명이 딱딱해졌지"만 느끼고 원인을 알 수 없다.
  const [budgetExhausted, setBudgetExhausted] = useState(false);

  // 애장품(Treasure) 체크 목록을 문자열로 직렬화해 useEffect 의존성 비교에 사용한다.
  // roster.treasureIds는 부모(app/page.js)에서 treasureIds가 바뀔 때마다 새 배열로 만들어지므로,
  // 참조가 아니라 내용(join)으로 비교해야 실제 값이 바뀐 경우에만 재실행된다.
  const treasureKey = (roster?.treasureIds || []).join(',');

  // 캠페인/보스전/PvP 탭이나 보스 약점 속성, 애장품 체크 상태가 바뀌면 이전에 만든 조합은 더 이상
  // 유효하지 않으므로 상태를 초기화한다. 이게 없으면 탭을 바꾸거나 애장품을 체크/해제해도 화면에는
  // 이전 조합이 그대로 남아있어 "체크해도 반영이 안 된다"고 느껴질 수 있었다.
  useEffect(() => {
    setTeam(null);
    setReasoning('');
    setErrorMsg('');
    setExcludeTitles([]);
    setFeedback(null);
    setAlternative(null);
    setSource(null);
    setBudgetExhausted(false);
    setPhase('idle');
  }, [mode, bossElement, tower, treasureKey]);

  const requestTeam = async (exclude) => {
    setPhase('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/ai-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characters: roster.resolved,
          treasureIds: roster.treasureIds,
          mode,
          bossElement,
          tower,
          excludeTitles: exclude,
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'AI 추천을 불러오지 못했습니다.');
        setPhase('error');
        return;
      }
      setTeam(data.team);
      setReasoning(data.aiReasoning || '');
      setAlternative(data.alternative || null);
      setSource(data.model || null);
      setBudgetExhausted(Boolean(data.budgetExhausted));
      setPhase('idle');
      setFeedback(null);
      setExcludeTitles((prev) => [...prev, ...data.team.members.map((m) => m.title)]);
    } catch {
      setErrorMsg('네트워크 오류로 AI 추천을 불러오지 못했습니다.');
      setPhase('error');
    }
  };

  const sendFeedback = async (rating) => {
    if (!team || feedback === 'sending' || feedback === 'up' || feedback === 'down') return;
    setFeedback('sending');
    try {
      const res = await fetch('/api/ai-recommend/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: team.members,
          mode,
          bossElement,
          rating,
        }),
      });
      if (!res.ok) {
        setFeedback(null);
        return;
      }
      setFeedback(rating);
    } catch {
      setFeedback(null);
    }
  };

  if (!team) {
    return (
      <div className="mb-2">
        <button
          onClick={() => requestTeam([])}
          disabled={phase === 'loading'}
          className="w-full sm:w-auto bg-nikke-accent text-slate-900 font-bold px-5 py-3 rounded-lg hover:brightness-110 transition disabled:opacity-50"
        >
          {phase === 'loading' ? 'AI가 조합을 구성하는 중...' : '🤖 이 로스터로 AI가 조합 직접 구성하기'}
        </button>
        {phase === 'loading' && (
          <p className="text-xs text-slate-500 mt-2">
            보유 캐릭터가 많을수록 AI가 검토할 자료도 많아져 최대 40~50초 정도 걸릴 수 있어요. 화면이 멈춘 게 아니니 잠시만 기다려주세요.
          </p>
        )}
        {phase === 'error' && <p className="text-sm text-rose-300 mt-2">{errorMsg}</p>}
      </div>
    );
  }

  return (
    <div className="bg-slate-900/40 rounded-lg p-4 border border-nikke-accent/30">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="font-semibold text-slate-100">🤖 AI가 구성한 조합</h3>
        <div className="flex items-center gap-1.5">
          {SOURCE_LABEL[source] && (
            <span className="text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
              {SOURCE_LABEL[source]}
            </span>
          )}
          <span className="text-xs text-nikke-gold bg-nikke-gold/10 border border-nikke-gold/40 rounded-full px-2 py-0.5">
            점수 {team.totalScore}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {team.members.map((m) => (
          <span
            key={m.id}
            className="flex items-center gap-1.5 text-xs bg-slate-800 border border-slate-700 rounded-full pl-1 pr-2.5 py-1 text-slate-200"
          >
            <CharacterAvatar character={{ img: m.img, name: m.name_kr }} size="xs" />
            {m.name_kr}{roster.treasureIds?.includes(m.id) ? ' (애장품)' : ''}
          </span>
        ))}
      </div>
      {reasoning && (
        <div className="bg-slate-900/60 border border-nikke-accent/20 rounded-lg p-3 mb-3">
          <p className="text-xs text-nikke-accent font-semibold mb-1.5">
            {budgetExhausted ? '📋 구성 근거' : '🤖 AI의 구성 이유'}
          </p>
          <p className="text-sm text-slate-300 whitespace-pre-line">{reasoning}</p>
          {budgetExhausted && (
            <p className="text-xs text-slate-500 mt-2">
              오늘 AI 설명 생성 한도에 도달해 근거 문장을 그대로 보여드립니다. 조합 구성과 점수는
              AI가 아니라 규칙 엔진이 정하므로 추천 결과 자체는 평소와 동일합니다.
            </p>
          )}
        </div>
      )}
      {alternative && (
        <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <p className="text-xs text-slate-400 font-semibold">
              다른 근거로 뽑은 조합 — {SOURCE_LABEL[alternative.source] || '대안'}
            </p>
            <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
              점수 {alternative.totalScore}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {alternative.members.map((m) => (
              <span
                key={m.id}
                className="flex items-center gap-1.5 text-xs bg-slate-800/60 border border-slate-700 rounded-full pl-1 pr-2.5 py-1 text-slate-300"
              >
                <CharacterAvatar character={{ img: m.img, name: m.name_kr }} size="xs" />
                {m.name_kr}{roster.treasureIds?.includes(m.id) ? ' (애장품)' : ''}
              </span>
            ))}
          </div>
          {alternative.headline && (
            <p className="text-xs text-slate-500 leading-relaxed">{alternative.headline}</p>
          )}
        </div>
      )}

      {phase === 'error' && <p className="text-xs text-rose-300 mb-2">{errorMsg}</p>}

      <div className="flex items-center flex-wrap gap-2 mb-3">
        <span className="text-xs text-slate-500">이 조합 어때요?</span>
        <button
          onClick={() => sendFeedback('up')}
          disabled={feedback === 'sending' || feedback === 'up' || feedback === 'down'}
          className={`text-xs px-2.5 py-1 rounded-full border transition disabled:opacity-50 ${
            feedback === 'up'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold'
              : 'border-slate-700 text-slate-300 hover:border-slate-500'
          }`}
        >
          👍 좋아요
        </button>
        <button
          onClick={() => sendFeedback('down')}
          disabled={feedback === 'sending' || feedback === 'up' || feedback === 'down'}
          className={`text-xs px-2.5 py-1 rounded-full border transition disabled:opacity-50 ${
            feedback === 'down'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-semibold'
              : 'border-slate-700 text-slate-300 hover:border-slate-500'
          }`}
        >
          👎 별로예요
        </button>
        {(feedback === 'up' || feedback === 'down') && (
          <span className="text-xs text-slate-500">피드백 감사합니다! 다음 추천에 참고할게요.</span>
        )}
      </div>

      <button
        onClick={() => requestTeam(excludeTitles)}
        disabled={phase === 'loading'}
        className="text-xs bg-nikke-accent/10 text-nikke-accent border border-nikke-accent/40 font-semibold px-3 py-1.5 rounded-lg hover:bg-nikke-accent/20 transition disabled:opacity-50"
      >
        {phase === 'loading' ? 'AI가 다시 구성하는 중...' : '🔄 다른 조합 보기'}
      </button>
    </div>
  );
}

function AiRecommendSection({ roster, aiMode, onAiModeChange, bossElement, onBossElementChange, tower, onTowerChange, dataFreshness }) {
  if (!roster) return null;
  const isStale = dataFreshness && (dataFreshness.characterDatabase.stale || dataFreshness.synergyNotes.stale);

  return (
    <section className="bg-nikke-panel rounded-xl p-5 border border-nikke-accent/40 shadow-lg shadow-nikke-accent/5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-lg font-bold text-nikke-accent">🤖 AI 조합 추천</h2>
        <div className="flex gap-1">
          {AI_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => onAiModeChange(m.key)}
              className={`text-xs px-3 py-1 rounded-full border transition ${
                aiMode === m.key
                  ? 'bg-nikke-accent text-slate-900 border-nikke-accent font-semibold'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {aiMode === 'bossing' && (
        <div className="flex items-center flex-wrap gap-2 mb-3 mt-2">
          <span className="text-xs text-slate-500">이번에 상대할 보스의 약점 속성:</span>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => onBossElementChange(null)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                !bossElement
                  ? 'bg-nikke-gold/20 text-nikke-gold border-nikke-gold/60 font-semibold'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              선택 안 함
            </button>
            {BOSS_ELEMENT_OPTIONS.map((el) => (
              <button
                key={el.key}
                onClick={() => onBossElementChange(el.key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  bossElement === el.key
                    ? 'bg-nikke-gold/20 text-nikke-gold border-nikke-gold/60 font-semibold'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {el.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {aiMode === 'tribe_tower' && (
        <div className="mt-2 mb-3">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xs text-slate-500">타워 종류:</span>
            <div className="flex gap-1 flex-wrap">
              {TOWER_OPTIONS.map((tw) => (
                <button
                  key={tw.key || 'general'}
                  onClick={() => onTowerChange(tw.key)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    tower === tw.key
                      ? 'bg-nikke-gold/20 text-nikke-gold border-nikke-gold/60 font-semibold'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {tw.label}
                  <span className="ml-1 opacity-60">{tw.days}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {tower
              ? '기업 타워는 해당 제조사 니케만 출전할 수 있어, 보유 니케 중 조건에 맞는 인원으로만 조합을 만듭니다.'
              : '일반 트라이브 타워는 제조사 제한이 없고 상시 열려 있습니다.'}
            {tower === 'pilgrim' &&
              ' 필그림 타워에는 오버스펙 니케(라피: 레드 후드, 미하라: 본딩 체인, 아니스: 스타, 네온: 비전 아이)도 출전할 수 있습니다.'}
          </p>
        </div>
      )}

      <p className="text-sm text-slate-400 mb-3">
        보유 캐릭터와 공략 근거자료(아키타입/시너지 페어/애장품 정보)를 AI에게 그대로 전달해, AI가 이 데이터만 근거로
        5인 조합을 직접 구성합니다. 구성된 조합은 게임 규칙(버스트 I/II/III)과 점수를 자동으로 검증해 함께 보여드려요.
        {aiMode === 'bossing' && bossElement && ' 선택한 약점 속성 캐릭터의 enikk.app 실사용률도 함께 반영됩니다.'}
        {aiMode === 'tribe_tower' && tower && ' 선택한 기업 타워에 출전 가능한 니케만 후보로 씁니다.'}
      </p>

      {isStale && (
        <p className="text-xs text-amber-400 mb-3">
          ⚠ 근거 자료 일부가 오래되었을 수 있습니다 (캐릭터 데이터 기준일 {dataFreshness.characterDatabase.asOf}, 시너지
          자료 기준일 {dataFreshness.synergyNotes.asOf}). 새 패치나 신규 캐릭터 정보와 다를 수 있어요.
        </p>
      )}

      <AiRecommendButton roster={roster} mode={aiMode} bossElement={bossElement} tower={tower} />

      {roster.unresolvedCount > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          보유 캐릭터 중 {roster.unresolvedCount}명은 아직 상세 데이터(스킬/티어)가 없어 이 분석에서 제외되었습니다.
        </p>
      )}
    </section>
  );
}

export default function ResultPanel({ result, roster, aiMode, onAiModeChange, bossElement, onBossElementChange, tower, onTowerChange, dataFreshness }) {
  if (!result) return null;
  const { partialMatches, ownedCount } = result;

  if (ownedCount === 0) {
    return (
      <div className="bg-nikke-panel rounded-xl p-6 border border-slate-800 text-center text-slate-400">
        보유중인 니케를 위에서 먼저 선택해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AiRecommendSection
        roster={roster}
        aiMode={aiMode}
        onAiModeChange={onAiModeChange}
        bossElement={bossElement}
        onBossElementChange={onBossElementChange}
        tower={tower}
        onTowerChange={onTowerChange}
        dataFreshness={dataFreshness}
      />

      {partialMatches.length > 0 && (
        <section className="bg-nikke-panel rounded-xl p-5 border border-slate-800">
          <h2 className="text-lg font-bold text-slate-100 mb-3">🎯 조금만 더 모으면 완성되는 조합</h2>
          <div className="space-y-4">
            {partialMatches.map(({ combo, missing }) => (
              <div key={combo.id} className="card-hover bg-slate-900/40 rounded-lg p-4 border border-slate-800">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-semibold text-slate-100">{combo.name}</h3>
                  <span className="text-xs text-nikke-gold bg-nikke-gold/10 border border-nikke-gold/40 rounded-full px-2 py-0.5">
                    {combo.purpose}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">{combo.description}</p>
                <p className="text-xs text-rose-300 mt-2">
                  부족한 캐릭터: {missing.map((c) => c.name).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
