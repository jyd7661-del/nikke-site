'use client';

import { useState, useEffect } from 'react';
import CharacterAvatar from '@/components/CharacterAvatar';
import { useLanguage } from '@/components/LanguageProvider';

const AI_MODES = [
  { key: 'campaign', label: '캠페인' },
  { key: 'bossing', label: '보스전' },
  { key: 'pvp', label: 'PvP' },
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
function AiRecommendButton({ roster, mode, bossElement }) {
  const { lang } = useLanguage();
  const [phase, setPhase] = useState('idle'); // idle | loading | error
  const [team, setTeam] = useState(null);
  const [reasoning, setReasoning] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [excludeTitles, setExcludeTitles] = useState([]);
  const [feedback, setFeedback] = useState(null); // null | 'sending' | 'up' | 'down'

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
    setPhase('idle');
  }, [mode, bossElement, treasureKey]);

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
          formation: team.formation,
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
        <h3 className="font-semibold text-slate-100">🤖 AI가 구성한 조합 · {team.formation} 포메이션</h3>
        <span className="text-xs text-nikke-gold bg-nikke-gold/10 border border-nikke-gold/40 rounded-full px-2 py-0.5">
          점수 {team.totalScore}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {team.members.map((m) => (
          <span
            key={m.id}
            className="flex items-center gap-1.5 text-xs bg-slate-800 border border-slate-700 rounded-full pl-1 pr-2.5 py-1 text-slate-200"
          >
            <CharacterAvatar character={{ img: m.img, name: m.name_kr }} size="xs" />
            {m.name_kr}
          </span>
        ))}
      </div>
      {reasoning && (
        <div className="bg-slate-900/60 border border-nikke-accent/20 rounded-lg p-3 mb-3">
          <p className="text-xs text-nikke-accent font-semibold mb-1.5">🤖 AI의 구성 이유</p>
          <p className="text-sm text-slate-300 whitespace-pre-line">{reasoning}</p>
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

function AiRecommendSection({ roster, aiMode, onAiModeChange, bossElement, onBossElementChange, dataFreshness }) {
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

      <p className="text-sm text-slate-400 mb-3">
        보유 캐릭터와 공략 근거자료(아키타입/시너지 페어/애장품 정보)를 AI에게 그대로 전달해, AI가 이 데이터만 근거로
        5인 조합을 직접 구성합니다. 구성된 조합은 게임 규칙(버스트 I/II/III)과 점수를 자동으로 검증해 함께 보여드려요.
        {aiMode === 'bossing' && bossElement && ' 선택한 약점 속성 캐릭터의 enikk.app 실사용률도 함께 반영됩니다.'}
      </p>

      {isStale && (
        <p className="text-xs text-amber-400 mb-3">
          ⚠ 근거 자료 일부가 오래되었을 수 있습니다 (캐릭터 데이터 기준일 {dataFreshness.characterDatabase.asOf}, 시너지
          자료 기준일 {dataFreshness.synergyNotes.asOf}). 새 패치나 신규 캐릭터 정보와 다를 수 있어요.
        </p>
      )}

      <AiRecommendButton roster={roster} mode={aiMode} bossElement={bossElement} />

      {roster.unresolvedCount > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          보유 캐릭터 중 {roster.unresolvedCount}명은 아직 상세 데이터(스킬/티어)가 없어 이 분석에서 제외되었습니다.
        </p>
      )}
    </section>
  );
}

export default function ResultPanel({ result, roster, aiMode, onAiModeChange, bossElement, onBossElementChange, dataFreshness }) {
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
