'use client';

import { charMap } from '@/lib/recommend';

function NameList({ ids }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {ids.map((id) => {
        const c = charMap[id];
        if (!c) return null;
        return (
          <span
            key={id}
            className="text-xs bg-slate-800 border border-slate-700 rounded-full px-2.5 py-1 text-slate-200"
          >
            {c.name}
          </span>
        );
      })}
    </div>
  );
}

export default function ResultPanel({ result }) {
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
      {fullMatches.length > 0 && (
        <section className="bg-nikke-panel rounded-xl p-5 border border-nikke-accent/40">
          <h2 className="text-lg font-bold text-nikke-accent mb-3">✅ 바로 사용 가능한 알려진 조합</h2>
          <div className="space-y-4">
            {fullMatches.map((combo) => (
              <div key={combo.id} className="bg-slate-900/40 rounded-lg p-4 border border-slate-800">
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
              <div key={combo.id} className="bg-slate-900/40 rounded-lg p-4 border border-slate-800">
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
