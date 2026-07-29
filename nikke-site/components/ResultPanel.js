'use client';

import { charMap } from '@/lib/recommend';
import CharacterAvatar from '@/components/CharacterAvatar';

function NameList({ ids }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {ids.map((id) => {
        const c = charMap[id];
        if (!c) return null;
        return (
          <span
            key={id}
            className="flex items-center gap-1.5 text-xs bg-slate-800 border border-slate-700 rounded-full pl-1 pr-2.5 py-1 text-slate-200"
          >
            <CharacterAvatar character={c} size="xs" />
            {c.name}
          </span>
        );
      })}
    </div>
  );
}

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

function AiRecommendSection({ aiResult, aiMode, onAiModeChange, bossElement, onBossElementChange }) {
  if (!aiResult) return null;
  const freshness = aiResult.dataFreshness;
  const isStale = freshness && (freshness.characterDatabase.stale || freshness.synergyNotes.stale);

  return (
    <section className="bg-nikke-panel rounded-xl p-5 border border-nikke-accent/40 shadow-lg shadow-nikke-accent/5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-lg font-bold text-nikke-accent">🤖 AI 근거 기반 추천 조합</h2>
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
        보유 캐릭터의 실제 성능 데이터와 공략 근거자료(prydwen.gg 재구성 + enikk.app 실전 기록)를 규칙으로 채점해 실시간으로 탐색한 결과입니다.
        각 조합 아래 근거 이유를 함께 표시합니다.
        {aiMode === 'bossing' && bossElement && ' 선택한 약점 속성 캐릭터의 enikk.app 실사용률도 함께 반영됩니다.'}
      </p>

      {isStale && (
        <p className="text-xs text-amber-400 mb-3">
          ⚠ 근거 자료 일부가 오래되었을 수 있습니다 (캐릭터 데이터 기준일 {freshness.characterDatabase.asOf}, 시너지 자료 기준일{' '}
          {freshness.synergyNotes.asOf}). 새 패치나 신규 캐릭터 정보와 다를 수 있어요.
        </p>
      )}

      {aiResult.error && <p className="text-sm text-rose-300">{aiResult.error}</p>}

      {!aiResult.error && aiResult.teams?.length === 0 && (
        <p className="text-sm text-slate-500">분석 가능한 조합을 찾지 못했습니다. 캐릭터를 더 선택해보세요.</p>
      )}

      <div className="space-y-4">
        {(aiResult.teams || []).map((team, i) => (
          <div key={i} className="card-hover bg-slate-900/40 rounded-lg p-4 border border-slate-800">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-slate-100">
                추천 #{i + 1} · {team.formation} 포메이션
              </h3>
              <span className="text-xs text-nikke-gold bg-nikke-gold/10 border border-nikke-gold/40 rounded-full px-2 py-0.5">
                점수 {team.totalScore}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
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
            {team.reasons?.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-400 list-disc list-inside">
                {team.reasons.map((r, ri) => (
                  <li key={ri}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {aiResult.unresolvedCount > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          보유 캐릭터 중 {aiResult.unresolvedCount}명은 아직 상세 데이터(스킬/티어)가 없어 이 분석에서 제외되었습니다.
        </p>
      )}
    </section>
  );
}

export default function ResultPanel({ result, aiResult, aiMode, onAiModeChange, bossElement, onBossElementChange }) {
  if (!result) return null;
  const { fullMatches, partialMatches, autoTeam, ownedCount } = result;

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
        aiResult={aiResult}
        aiMode={aiMode}
        onAiModeChange={onAiModeChange}
        bossElement={bossElement}
        onBossElementChange={onBossElementChange}
      />

      {fullMatches.length > 0 && (
        <section className="bg-nikke-panel rounded-xl p-5 border border-nikke-accent/40 shadow-lg shadow-nikke-accent/5">
          <h2 className="text-lg font-bold text-nikke-accent mb-3">✅ 바로 사용 가능한 알려진 조합</h2>
          <div className="space-y-4">
            {fullMatches.map((combo) => (
              <div key={combo.id} className="card-hover bg-slate-900/40 rounded-lg p-4 border border-slate-800">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-semibold text-slate-100">{combo.name}</h3>
                  <span className="text-xs text-nikke-gold bg-nikke-gold/10 border border-nikke-gold/40 rounded-full px-2 py-0.5">
                    {combo.purpose}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">{combo.description}</p>
                <NameList ids={combo.members} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-nikke-panel rounded-xl p-5 border border-slate-800">
        <h2 className="text-lg font-bold text-slate-100 mb-1">🛠 보유 캐릭터 기반 자동 추천 팀</h2>
        <p className="text-sm text-slate-400 mb-3">
          보유중인 니케 중 버스트 단계별로 티어가 높은 캐릭터를 우선 배치한 5인 팀입니다.
        </p>
        {autoTeam.length === 0 ? (
          <p className="text-sm text-slate-500">선택한 캐릭터가 부족합니다. 더 많은 니케를 선택해보세요.</p>
        ) : (
          <NameList ids={autoTeam.map((c) => c.id)} />
        )}
      </section>

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
