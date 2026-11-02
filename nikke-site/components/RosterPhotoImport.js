'use client';

import { useMemo, useState } from 'react';
import { CHARACTERS } from '@/data/characters';
import CharacterAvatar from '@/components/CharacterAvatar';
import { useLanguage } from '@/components/LanguageProvider';
import { characterName, localizedCharacter } from '@/lib/characterNames';
import { prepareRosterPhoto } from '@/lib/rosterPhotoImage';
import { supabase } from '@/lib/supabaseClient';

// 사진으로 보유 니케 넣기 — 베타 (2026-11-02, 유저 "사진으로 내 보유니케 선택이 가능할까?").
// 게임 「니케」 목록 캡처를 올리면 /api/roster-photo가 읽고, 여기서 사용자가 확인한 것만 보유 목록에 더한다.
//   확실하게 읽은 것은 미리 체크, 확신 없음·이름 조각으로 다시 찾은 것은 "확인 필요"로 체크하지 않는다.
//   💎는 애장품이 출시된 니케(hasTreasure)만. 이미 보유한 니케·💎는 빼지 않는다(더하기만 한다).
// 「넣기」를 누르면 체크한 목록을 사진마다 /api/roster-photo/confirm에 남긴다 — AI 결과와 비교해 기능을 고친다(유저 지시).

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));
const MAX_FILES = 10;
const CONCURRENCY = 3;

async function authHeader() {
  try {
    const { data } = (await supabase?.auth.getSession()) || {};
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

export default function RosterPhotoImport({ ownedIds, treasureIds, onApply }) {
  const { lang, t, lp } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // { done, total }
  const [scans, setScans] = useState([]); // [{ scanId, found: [{id, treasure, sure}], unknown }]
  const [errors, setErrors] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [treasure, setTreasure] = useState(new Set());
  const [applied, setApplied] = useState(null);

  // 여러 장의 결과를 니케 하나당 한 줄로. 확인 필요가 위로 온다.
  const rows = useMemo(() => {
    const m = new Map();
    for (const s of scans) for (const f of s.found) {
      if (!BY_ID.has(f.id)) continue;
      const p = m.get(f.id);
      if (!p) m.set(f.id, { ...f });
      else { p.sure = p.sure || f.sure; p.treasure = p.treasure || f.treasure; }
    }
    return [...m.values()].sort((a, b) => Number(a.sure) - Number(b.sure));
  }, [scans]);
  const unknown = scans.reduce((s, x) => s + (x.unknown || 0), 0);

  const reset = () => { setScans([]); setErrors([]); setChecked(new Set()); setTreasure(new Set()); setApplied(null); };
  const close = () => { if (!busy) { setOpen(false); reset(); } };

  const onFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/')).slice(0, MAX_FILES);
    if (!files.length) return;
    setApplied(null);
    setBusy({ done: 0, total: files.length });
    const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
    const results = [];
    const errs = [];
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const file = files[next++];
        try {
          const img = await prepareRosterPhoto(file);
          const res = await fetch('/api/roster-photo', { method: 'POST', headers, body: JSON.stringify({ lang, ...img }) });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) errs.push(j.error || 'failed');
          else results.push(j);
        } catch {
          errs.push('bad_image');
        }
        setBusy((b) => (b ? { ...b, done: b.done + 1 } : b));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    setScans((prev) => [...prev, ...results]);
    // 새로 읽은 것 중 확실한 것만 미리 체크(이미 보유한 니케도 체크해 둔다 — 넣어도 변화 없음)
    const sure = results.flatMap((r) => r.found.filter((f) => f.sure && BY_ID.has(f.id)));
    setChecked((c) => new Set([...c, ...sure.map((f) => f.id)]));
    setTreasure((c) => new Set([...c, ...sure.filter((f) => f.treasure && BY_ID.get(f.id).hasTreasure).map((f) => f.id)]));
    setErrors((prev) => [...prev, ...errs]);
    setBusy(null);
  };

  const toggle = (id) => setChecked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleTreasure = (id) => setTreasure((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const apply = () => {
    const ids = rows.map((r) => r.id).filter((id) => checked.has(id));
    const tIds = ids.filter((id) => treasure.has(id) && BY_ID.get(id)?.hasTreasure);
    onApply(ids, tIds);
    // 사진마다 그 사진에서 읽은 니케 중 무엇을 넣었는지 남긴다(실패해도 사용자에게는 상관없다).
    scans.forEach((s) => {
      if (!s.scanId) return;
      const mine = new Set(s.found.map((f) => f.id));
      fetch('/api/roster-photo/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: s.scanId, ids: ids.filter((id) => mine.has(id)), treasure: tIds.filter((id) => mine.has(id)) }),
      }).catch(() => {});
    });
    const added = ids.filter((id) => !ownedIds.has(id)).length;
    setScans([]); setChecked(new Set()); setTreasure(new Set()); setErrors([]);
    setApplied(added);
  };

  const nChecked = rows.filter((r) => checked.has(r.id)).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mb-3 w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg border border-nikke-accent/50 bg-nikke-accent/10 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-nikke-accent/20 transition"
      >
        <span>📷 {t('photo_import_button')}</span>
        <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">BETA</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={close}>
          <div
            className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-nikke-panel p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                📷 {t('photo_import_title')}
                <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">BETA</span>
              </h2>
              <button onClick={close} disabled={!!busy} className="text-slate-400 hover:text-slate-200 text-xl leading-none disabled:opacity-30" aria-label={t('photo_import_close')}>×</button>
            </div>

            <ul className="text-xs text-slate-400 space-y-1 mb-4 list-disc pl-4">
              <li>{t('photo_import_how')}</li>
              <li>{t('photo_import_tip')}</li>
              <li className="text-amber-200/90">{t('photo_import_beta')}</li>
              <li>
                {t('photo_import_privacy')}{' '}
                <a href={lp('/privacy')} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-slate-200">{t('photo_import_privacy_link')}</a>
              </li>
            </ul>

            <label className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${busy ? 'border-slate-700 opacity-60' : 'border-slate-600 hover:border-nikke-accent cursor-pointer'}`}>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={!!busy}
                className="hidden"
                onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
              />
              {busy ? (
                <span className="text-sm text-slate-200">{t('photo_import_reading')(busy.done, busy.total)}</span>
              ) : (
                <>
                  <span className="text-sm font-semibold text-slate-100">{t('photo_import_pick')}</span>
                  <span className="text-xs text-slate-500">{t('photo_import_pick_hint')(MAX_FILES)}</span>
                </>
              )}
            </label>
            {/* 한 장 고르기(2026-11-02 유저 "앱 고르는거에서 갤러리는 못고르게하나?"): multiple이 붙으면 여러 장 고르기를
                지원하지 않는 갤러리 앱(일부 안드로이드 기본 갤러리)이 앱 고르기 창에서 빠진다. multiple 없는 입력을 따로 둔다 —
                결과는 올릴 때마다 쌓이니 한 장씩 여러 번 올려도 된다. */}
            {!busy && (
              <label className="mt-2 block text-center text-xs text-slate-400 underline decoration-dotted cursor-pointer hover:text-slate-200">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
                />
                {t('photo_import_pick_one')}
              </label>
            )}

            {errors.length > 0 && (
              <p className="mt-3 text-xs text-rose-300">
                {[...new Set(errors)].map((e) => t(`photo_import_err_${['daily_limit', 'budget', 'bad_image', 'read_failed'].includes(e) ? e : 'other'}`)).join(' ')}
              </p>
            )}

            {applied !== null && (
              <p className="mt-3 text-sm text-emerald-300">{t('photo_import_applied')(applied)}</p>
            )}

            {rows.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-slate-300 mb-2">{t('photo_import_found')(rows.length)}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {rows.map((r) => {
                    const c = BY_ID.get(r.id);
                    const on = checked.has(r.id);
                    const owned = ownedIds.has(r.id);
                    return (
                      <div key={r.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${on ? 'border-nikke-accent/60 bg-nikke-accent/5' : 'border-slate-700'}`}>
                        <label className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={on} onChange={() => toggle(r.id)} className="accent-nikke-accent" />
                          <CharacterAvatar character={localizedCharacter(c, lang)} size="sm" />
                          <span className="truncate text-sm text-slate-100">{characterName(c, lang)}</span>
                        </label>
                        {!r.sure && <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">{t('photo_import_check')}</span>}
                        {owned && <span className="shrink-0 text-[10px] text-slate-500">{t('photo_import_owned')}</span>}
                        {c.hasTreasure && (
                          <button
                            onClick={() => toggleTreasure(r.id)}
                            title={t('treasure_toggle_title')}
                            className={`shrink-0 text-sm ${treasure.has(r.id) || treasureIds.has(r.id) ? '' : 'opacity-25 grayscale'}`}
                          >
                            💎
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {unknown > 0 && <p className="mt-2 text-xs text-slate-500">{t('photo_import_unknown')(unknown)}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={reset} className="px-4 py-2 rounded-lg text-sm border border-slate-700 text-slate-300 hover:border-slate-500">{t('photo_import_discard')}</button>
                  <button
                    onClick={apply}
                    disabled={nChecked === 0}
                    className="bg-nikke-accent text-slate-900 font-bold px-4 py-2 rounded-lg text-sm hover:brightness-110 disabled:opacity-40"
                  >
                    {t('photo_import_apply')(nChecked)}
                  </button>
                </div>
              </div>
            )}
            {rows.length === 0 && scans.length > 0 && !busy && (
              <p className="mt-3 text-sm text-slate-400">{t('photo_import_none')}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
