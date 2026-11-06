'use client';

import { useLanguage } from '@/components/LanguageProvider';
import { termLabel } from '@/lib/dexLabels';
import DexMemberFaces from '@/components/DexMemberFaces';

// 도감 상세의 "실사용 데이터" 절 — enikk.app에서 옮긴 실사용 조합(2026-09 기준 216건)을 이 캐릭터 기준으로 뒤집은 것.
// 집계 규칙과 "무엇은 세면 안 되는가"는 lib/usage.js 주석에 있다.
//
// ⚠️ 멤버는 **서버에서 미리 풀어서** 받는다({ id, title, name_kr, name_ja }).
//    여기서 lib/dex.js나 lib/usage.js를 import하면 데이터 JSON이 통째로 브라우저 번들에
//    실린다 — DexTeams가 같은 이유로 서버에서 풀어 받는다(그 파일 주석 참고).
//
// ⚠️ 이 절은 데이터가 없으면 **안 그린다**(2026-09 기준 201명 중 100명 — enikk은 상위만 게시한다).
//    그래서 집계가 통째로 실패해도 화면은 멀쩡해 보인다. scripts/testDexUsage.mjs가
//    도감 전원을 원본과 대조해서 그 조용한 실패를 잡는다.

const SLICE_KEY = {
  overall: 'dex_usage_slice_overall',
  campaign: 'dex_usage_slice_campaign',
  soloraid: 'dex_usage_slice_soloraid',
  arena: 'dex_usage_slice_arena',
};

// enikk의 '타워 로스터 풀' 칩 → 용어집 키. 임의 번역 금지(data/glossary.json이 단일 출처).
const POOL_TERM = {
  tribe: 'tribe_tower', elysion: 'corp_elysion', missilis: 'corp_missilis',
  tetra: 'corp_tetra', overspec: 'overspec',
};

// 모드별 대표 조합의 멤버가 같으면 한 칸에 모은다(2026-11-04) — 크라운은 타워·캠페인 대표가 같은 5명이라 같은 줄이 두 번 나왔다.
// 수치는 각 모드 줄에 그대로 둔다(서로 더하지 않는다).
function mergeSameMembers(teams) {
  const out = [];
  const byKey = new Map();
  for (const e of teams) {
    const key = (e.members || []).map((m) => m.title).sort().join('|');
    const g = byKey.get(key);
    if (g) g.entries.push(e);
    else { const n = { members: e.members, entries: [e] }; byKey.set(key, n); out.push(n); }
  }
  return out;
}

export default function DexUsage({ usage }) {
  const { lang, t } = useLanguage();
  if (!usage) return null;

  const { totals, counts, tiers, teams, subsets, source } = usage;
  const hasAny = counts.all > 0 || (tiers || []).length > 0 || (subsets || []).length > 0;
  if (!hasAny) return null;

  // 조합 한 줄의 오른쪽에 붙는 원시 수치. **그 줄에 적힌 값 그대로만** 쓴다(A등급).
  // 팀 간에 더하지 않는다 — 솔로레이드 parses는 서버별 표본, 타워 %는 풀 안의 비율이다.
  const teamMeta = (e) => {
    if (e.kind === 'raid') {
      return [
        `${t('dex_usage_raid_label')(e.raid, e.boss)} · ${t('dex_usage_weakness')(termLabel(`element_${e.weakness}`, lang, e.weakness))}`,
        t('dex_usage_samples')(e.parses),
      ];
    }
    if (e.kind === 'tower') {
      return [
        `${t('mode_tribe_tower')} · ${termLabel(POOL_TERM[e.pool] || e.pool, lang, e.pool)}`,
        e.pctOfClears != null
          ? `${t('dex_usage_uses')(e.uses)} · ${t('dex_usage_pct_of_clears')(e.pctOfClears)}`
          : t('dex_usage_uses')(e.uses),
      ];
    }
    if (e.kind === 'campaign') {
      return [
        t('mode_campaign'),
        e.pctOfClears != null
          ? `${t('dex_usage_uses')(e.totalUses)} · ${t('dex_usage_pct_of_clears')(e.pctOfClears)}`
          : t('dex_usage_uses')(e.totalUses),
      ];
    }
    return [
      t('mode_pvp'),
      [e.wr != null && t('dex_usage_wr')(e.wr), e.adoption != null && t('dex_usage_adoption')(e.adoption)]
        .filter(Boolean).join(' · '),
    ];
  };

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-1">{t('dex_usage_heading')}</h2>
      <p className="text-xs text-slate-500 mb-3">{t('dex_usage_source')(source.site, source.asOf)}</p>

      {(tiers || []).length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-slate-200 mb-2">{t('dex_usage_tier_heading')}</h3>
          <div className="flex flex-wrap gap-2">
            {tiers.map((row) => (
              <span key={row.slice} className="rounded-md bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300">
                <span className="text-slate-500">{t(SLICE_KEY[row.slice] || 'dex_usage_slice_overall')}</span>{' '}
                <strong className="text-slate-100">{row.tier}</strong>
                {row.usage != null && <span className="text-slate-400"> · {row.usage}%</span>}
              </span>
            ))}
          </div>
          {/* 척도가 두 개라는 사실을 여기서 반드시 밝힌다 — 위 티어표(prydwen)는 SSS가 최고인
              9단계, 이 표(enikk)는 S가 최고인 6단계다. 나란히 두고 안 밝히면 오독한다. */}
          <p className="text-xs text-slate-500 mt-2">{t('dex_usage_tier_scale_note')}</p>
        </div>
      )}

      {/* 2026-10-11: '자주 함께 쓰인 니케'는 DexRelations의 '함께 쓰면 좋은 니케'로 옮겼다(추천 조합 횟수와 합쳐 한 목록으로 — 같은 목록이 두 번 나오지 않게) */}
      {(teams || []).length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-slate-200 mb-2">{t('dex_usage_teams_heading')}</h3>
          <div className="space-y-3">
            {mergeSameMembers(teams).map((g, i) => (
              <div key={`team-${i}`} className="rounded-lg bg-slate-800/40 p-4">
                {g.entries.map((e, k) => {
                  const [where, figure] = teamMeta(e);
                  return (
                    <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <h4 className="text-sm font-bold text-slate-100">{where}</h4>
                      <span className="text-xs text-slate-500 shrink-0">{figure}</span>
                    </div>
                  );
                })}
                <DexMemberFaces members={g.members} lang={lang} />
              </div>
            ))}
          </div>
        </div>
      )}

      {(subsets || []).length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-slate-200 mb-2">{t('dex_usage_subsets_heading')}</h3>
          <div className="space-y-2">
            {subsets.map((s, i) => (
              <div key={`sub-${i}`} className="rounded-lg bg-slate-800/40 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-xs text-slate-500">{t('dex_usage_subset_size')(s.size)}</span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {[s.wr != null && t('dex_usage_wr')(s.wr), s.adoption != null && t('dex_usage_adoption')(s.adoption)]
                      .filter(Boolean).join(' · ')}
                  </span>
                </div>
                <DexMemberFaces members={s.members} lang={lang} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
