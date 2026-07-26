'use client';

import { useMemo, useState } from 'react';
import { CHARACTERS, BURST_LABEL } from '@/data/characters';

const TIER_COLOR = {
  T0: 'bg-amber-400 text-amber-950',
  T1: 'bg-sky-400 text-sky-950',
  T2: 'bg-emerald-400 text-emerald-950',
  T3: 'bg-slate-400 text-slate-950',
  T4: 'bg-slate-600 text-slate-100',
};

export default function CharacterPicker({ ownedIds, onToggle, onClear }) {
  const [query, setQuery] = useState('');
  const [burstFilter, setBurstFilter] = useState('all');

  const filtered = useMemo(() => {
    return CHARACTERS.filter((c) => {
      if (burstFilter !== 'all' && c.burst !== Number(burstFilter)) return false;
      if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query, burstFilter]);

  const grouped = useMemo(() => {
    const g = { 1: [], 2: [], 3: [] };
    for (const c of filtered) g[c.burst].push(c);
    return g;
  }, [filtered]);

  return (
    <div className="bg-nikke-panel rounded-xl p-5 border border-slate-800">
      <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-wrap">
          {['all', '1', '2', '3'].map((b) => (
            <button
              key={b}
              onClick={() => setBurstFilter(b)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                burstFilter === b
                  ? 'bg-nikke-accent text-slate-900 border-nikke-accent'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {b === 'all' ? '전체' : `버스트 ${b}`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="캐릭터 검색..."
            className="bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-nikke-accent w-48"
          />
          <button
            onClick={onClear}
            className="px-3 py-1.5 rounded-lg text-sm border border-slate-700 text-slate-300 hover:border-rose-400 hover:text-rose-300"
          >
            선택 초기화
          </button>
        </div>
      </div>

      {[1, 2, 3].map((b) =>
        grouped[b].length === 0 ? null : (
          <div key={b} className="mb-5">
            <h3 className="text-sm font-semibold text-slate-400 mb-2">{BURST_LABEL[b]}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {grouped[b].map((c) => {
                const active = ownedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => onToggle(c.id)}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm border transition text-left ${
                      active
                        ? 'bg-nikke-accent/15 border-nikke-accent text-nikke-accent'
                        : 'bg-slate-800/40 border-slate-700 hover:border-slate-500 text-slate-200'
                    }`}
                  >
                    <span className="truncate">{c.name}</span>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_COLOR[c.tier] || 'bg-slate-600'}`}
                    >
                      {c.tier}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
