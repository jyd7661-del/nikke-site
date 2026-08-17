'use client';

import { useLanguage } from '@/components/LanguageProvider';

// 도감 상세(/nikke/[id])의 스킬 목록.
//
// ■ 왜 컴포넌트를 따로 뺐는가
//
// 도감 페이지는 **서버 컴포넌트**다(빌드 때 196페이지를 정적 생성한다). 서버 컴포넌트는
// useLanguage() 같은 클라이언트 훅을 쓸 수 없어서, 예전에는 영어 s.desc를 그대로 박아
// 놓을 수밖에 없었다. 유저 결정(2026-08-13)은 **"사이트 언어설정에 따라 바뀌도록 한다"**
// 였으므로, 스킬 블록만 클라이언트로 떼어내고 세 언어를 props(=이미 정적 HTML에 실린 값)로
// 받는다. 정적 생성은 그대로 유지되고 토글에만 반응한다.
//
// ■ 알고 있어야 할 트레이드오프
//
// 서버가 렌더하는 HTML은 한국어 하나뿐이므로 **영어·일본어 스킬 문구는 검색 색인이 안 된다.**
// URL을 언어별로 나누지 않기로 한 결정의 대가이고, 이미 합의된 사항이다.
// (이름은 지금처럼 title(영문)·name_ja(일문)가 본문에 함께 실려 3개국어로 색인된다)
//
// ■ 한국어가 없는 캐릭터가 있다
//
// 나무위키 수집이 검증을 통과한 것만 저장했기 때문에 588개 중 564개(95.9%)에만 desc_kr이
// 있다. 없으면 영어로 폴백한다 — 빈칸을 보여주는 것보다 낫고, 예전 상태와 같다.
// 남은 캐릭터는 `docs/open-items.md` 참고.

export default function DexSkillList({ skills }) {
  const { lang, t } = useLanguage();

  // 언어별로 실제 보여줄 값을 고른다. 없으면 영어 원문으로 폴백.
  const pick = (s) => {
    if (lang === 'ko') {
      return { name: s.name_kr || s.name, desc: s.desc_kr || s.desc, fellBack: !s.desc_kr };
    }
    if (lang === 'ja') {
      return { name: s.name_ja || s.name, desc: s.desc_ja || s.desc, fellBack: !s.desc_ja };
    }
    return { name: s.name, desc: s.desc, fellBack: false };
  };

  const anyFallback = (skills || []).some((s) => pick(s).fellBack);

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-3">{t('dex_skills_heading')}</h2>
      <div className="space-y-3">
        {(skills || []).map((s, i) => {
          const v = pick(s);
          return (
            <div key={i} className="rounded-lg bg-slate-800/40 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-bold text-slate-100">{v.name}</h3>
                <span className="text-xs text-slate-500 shrink-0">
                  {s.type}{s.cd && s.cd !== 'N/A' ? ` · ${t('dex_cooldown')} ${s.cd}${t('dex_seconds')}` : ''}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">{v.desc}</p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-600 mt-2">
        {anyFallback ? t('dex_skills_source_fallback') : t('dex_skills_source')}
      </p>
    </section>
  );
}
