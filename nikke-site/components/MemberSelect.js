'use client';

import { CHARACTERS } from '@/data/characters';
import CharacterAvatar from '@/components/CharacterAvatar';
import { useLanguage } from '@/components/LanguageProvider';
import { characterName, localizedCharacter } from '@/lib/characterNames';

// 조합 등록 폼에서 최대 5명까지 캐릭터를 고르는 컴팩트한 선택기
export default function MemberSelect({ selected, onToggle, max = 5 }) {
  const { lang, t } = useLanguage();
  return (
    <div className="border border-slate-700 rounded-lg p-3 max-h-72 overflow-y-auto bg-slate-900/40">
      {[1, 2, 3].map((b) => (
        <div key={b} className="mb-3">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">{t(`burst_label_${b}`)}</p>
          <div className="flex flex-wrap gap-1.5">
            {CHARACTERS.filter((c) => c.burst === b).map((c) => {
              const active = selected.includes(c.id);
              const disabled = !active && selected.length >= max;
              return (
                <button
                  type="button"
                  key={c.id}
                  disabled={disabled}
                  onClick={() => onToggle(c.id)}
                  className={`flex items-center gap-1.5 text-xs pl-1 pr-2.5 py-1 rounded-full border transition ${
                    active
                      ? 'bg-nikke-accent text-slate-900 border-nikke-accent'
                      : disabled
                      ? 'opacity-30 border-slate-700 cursor-not-allowed'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <CharacterAvatar character={localizedCharacter(c, lang)} size="xs" />
                  {characterName(c, lang)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
