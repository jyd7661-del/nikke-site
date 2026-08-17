'use client';

import { useState, useEffect } from 'react';
import CharacterAvatar from '@/components/CharacterAvatar';
import { useLanguage } from '@/components/LanguageProvider';
import { memberName, characterName } from '@/lib/characterNames';

// 모듈 스코프라 t()를 부를 수 없다. 문구 대신 **키**만 들고 있다가 화면에서 t()로 푼다.
// (여기에 한국어를 그대로 적으면 언어를 바꿔도 이 목록만 한국어로 남는다 — A단계에서 겪은 그 문제)
const AI_MODES = [
  { key: 'campaign', labelKey: 'mode_campaign' },
  { key: 'bossing', labelKey: 'mode_bossing' },
  { key: 'pvp', labelKey: 'mode_pvp' },
  { key: 'tribe_tower', labelKey: 'mode_tribe_tower' },
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
  { key: null, labelKey: 'tower_normal', daysKey: 'tower_days_always' },
  { key: 'elysion', labelKey: 'tower_elysion', daysKey: 'tower_days_elysion' },
  { key: 'missilis', labelKey: 'tower_missilis', daysKey: 'tower_days_missilis' },
  { key: 'tetra', labelKey: 'tower_tetra', daysKey: 'tower_days_tetra' },
  { key: 'pilgrim', labelKey: 'tower_pilgrim', daysKey: 'tower_days_pilgrim' },
];

// 솔로 레이드 보스 약점 속성 선택지. lib/synergyEngine.js의 BOSS_ELEMENTS,
// data/metaStats.json의 soloRaidByElement 키와 반드시 일치해야 함.
const BOSS_ELEMENT_OPTIONS = [
  { key: 'Iron', labelKey: 'element_iron' },
  { key: 'Wind', labelKey: 'element_wind' },
  { key: 'Water', labelKey: 'element_water' },
  { key: 'Electronic', labelKey: 'element_electronic' },
  { key: 'Fire', labelKey: 'element_fire' },
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
const SOURCE_LABEL_KEY = {
  'enikk-real-usage': 'source_enikk',
  'prydwen-exact-match': 'source_prydwen',
  'skill-synergy-fallback': 'source_fallback',
};

// 조합 구성원을 세로 카드로 그린다. **주력 조합과 대안 조합이 같은 것을 쓴다.**
//
// 처음엔 주력 조합만 카드로 키우고 대안 조합은 옛 원형 칩으로 뒀는데, 한 화면에 조합이 둘
// 나오는 걸 놓쳤다("조합 두가지 나오는데 왜 위에 조합만 확대해놨어", 2026-08-13).
// 같은 것을 두 벌로 두면 한쪽만 고치는 실수가 또 난다. 그래서 컴포넌트로 뺐다.
//
// ⚠️ 이 컴포넌트도 useLanguage()를 **자기가** 받는다. 한 파일에 컴포넌트가 여럿이면 스코프가
//    각각이고, 훅 없이 t()를 쓰면 콘솔 에러도 없이 이 컴포넌트만 통째로 렌더되지 않는다
//    (.claude/rules/ui-i18n.md, 실제 사고 2026-08-11).
//
// 폭은 88px(모바일) / 116px(그 이상)로 고정한다.
// 1280 뷰포트에서 5열 그리드로 두면 카드가 233×310px까지 커진다(실측). 선택 그리드 카드가
// 143px인데 그보다 크다 — "사진이 너무 큰 것 같으니까 반으로 줄여보자"는 지적 그대로다.
// 233의 절반이 116이라 이 값을 썼다.
// 모바일은 줄이지 않았다. 지금도 3열에서 약 85px인데 여기서 반으로 줄이면 43px이라
// 얼굴을 알아볼 수 없어 원래 목적(한눈에 파악)이 사라진다. 88px이면 375px 화면에서
// 여전히 한 줄에 3장 들어간다.
function TeamMemberCards({ members, treasureIds }) {
  const { lang, t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {members.map((m) => {
        const name = `${memberName(m, lang)}${treasureIds?.includes(m.id) ? ` ${t('treasure_suffix')}` : ''}`;
        return (
          // 초상화를 누르면 그 니케의 도감 페이지로 간다(스킬을 바로 보려는 용도, 유저 건의 2026-08-15).
          // ⚠️ 반드시 **새 탭**으로 연다. 추천 결과는 /api/ai-recommend 호출로 만들어진 화면 상태라
          //    같은 탭에서 이동했다가 돌아오면 조합이 사라지고 AI 호출을 다시 하게 된다(= 비용도 다시 든다).
          //    rel="noopener"는 새 탭이 window.opener로 이 페이지를 건드리지 못하게 막는다.
          // m.id는 characterDatabase의 id라 도감 라우트 /nikke/[id]와 그대로 맞는다(예: helm → /nikke/helm).
          <a
            key={m.id}
            href={`/nikke/${m.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`${memberName(m, lang)} ${t('dex_open_hint')}`}
            className="group relative w-[88px] sm:w-[116px] rounded-lg overflow-hidden border border-slate-700 bg-slate-900/40 block transition hover:border-nikke-accent focus:outline-none focus:ring-2 focus:ring-nikke-accent"
          >
            <CharacterAvatar character={{ img: m.img, name: memberName(m, lang) }} shape="portrait" />
            {/* 이름은 카드 안 아래쪽에 겹친다. 밑에 따로 칸을 두면 이름 줄 수에 따라 카드
                높이가 갈려 행 전체가 들쭉날쭉해진다(CharacterPicker에서 겪고 고친 문제). */}
            <span
              title={name}
              className="absolute inset-x-0 bottom-0 px-1 pt-5 pb-1 text-[12px] font-semibold text-center leading-tight line-clamp-3 break-keep text-slate-100 drop-shadow-[0_1px_2px_rgba(2,6,23,0.95)] bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent"
            >
              {name}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function AiRecommendButton({ roster, mode, bossElement, tower }) {
  const { lang, t } = useLanguage();
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
        setErrorMsg(data.error || t('ai_error_generic'));
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
      setErrorMsg(t('ai_error_network'));
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
          {phase === 'loading' ? t('ai_building') : t('ai_build_cta')}
        </button>
        {phase === 'loading' && (
          <p className="text-xs text-slate-500 mt-2">
            {t('ai_wait_note')}
          </p>
        )}
        {phase === 'error' && <p className="text-sm text-rose-300 mt-2">{errorMsg}</p>}
      </div>
    );
  }

  return (
    <div className="bg-slate-900/40 rounded-lg p-4 border border-nikke-accent/30">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="font-semibold text-slate-100">{t('ai_team_heading')}</h3>
        <div className="flex items-center gap-1.5">
          {SOURCE_LABEL_KEY[source] && (
            <span className="text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
              {t(SOURCE_LABEL_KEY[source])}
            </span>
          )}
          <span className="text-xs text-nikke-gold bg-nikke-gold/10 border border-nikke-gold/40 rounded-full px-2 py-0.5">
            {t('score')} {team.totalScore}
          </span>
        </div>
      </div>
      <TeamMemberCards members={team.members} treasureIds={roster.treasureIds} />
      {reasoning && (
        <div className="bg-slate-900/60 border border-nikke-accent/20 rounded-lg p-3 mb-3">
          <p className="text-xs text-nikke-accent font-semibold mb-1.5">
            {budgetExhausted ? t('reason_fallback_heading') : t('reason_ai_heading')}
          </p>
          <p className="text-sm text-slate-300 whitespace-pre-line">{reasoning}</p>
          {budgetExhausted && (
            <p className="text-xs text-slate-500 mt-2">
              {t('budget_exhausted_note')}
            </p>
          )}
        </div>
      )}
      {alternative && (
        <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <p className="text-xs text-slate-400 font-semibold">
              {t('alt_team_from')} — {SOURCE_LABEL_KEY[alternative.source] ? t(SOURCE_LABEL_KEY[alternative.source]) : t('source_other')}
            </p>
            <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
              {t('score')} {alternative.totalScore}
            </span>
          </div>
          <TeamMemberCards members={alternative.members} treasureIds={roster.treasureIds} />
          {/* 근거 문장(headline)은 lib/synergyEngine.js가 한국어로 조립한다. 그 문장 안에는
              synergyNotes.json·characterInvestmentNotes.json 같은 **데이터 파일의 한국어 원문**이
              그대로 박히기 때문에, 코드만 다국어화해도 문장 절반이 한국어로 남는다(2026-08-11 조사).
              근거 문장의 주 소비자는 화면이 아니라 AI 프롬프트이고, AI는 이미 사용자 언어로
              설명을 쓴다. 그래서 한국어일 때만 보여주고, 다른 언어에서는 조합·출처·점수만 남긴다.
              데이터까지 번역하기로 방침이 바뀌면 이 조건을 지우면 된다. */}
          {alternative.headline && lang === 'ko' && (
            <p className="text-xs text-slate-500 leading-relaxed">{alternative.headline}</p>
          )}
        </div>
      )}

      {phase === 'error' && <p className="text-xs text-rose-300 mb-2">{errorMsg}</p>}

      <div className="flex items-center flex-wrap gap-2 mb-3">
        <span className="text-xs text-slate-500">{t('feedback_ask')}</span>
        <button
          onClick={() => sendFeedback('up')}
          disabled={feedback === 'sending' || feedback === 'up' || feedback === 'down'}
          className={`text-xs px-2.5 py-1 rounded-full border transition disabled:opacity-50 ${
            feedback === 'up'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold'
              : 'border-slate-700 text-slate-300 hover:border-slate-500'
          }`}
        >
          {t('feedback_good')}
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
          {t('feedback_bad')}
        </button>
        {(feedback === 'up' || feedback === 'down') && (
          <span className="text-xs text-slate-500">{t('feedback_thanks')}</span>
        )}
      </div>

      <button
        onClick={() => requestTeam(excludeTitles)}
        disabled={phase === 'loading'}
        className="text-xs bg-nikke-accent/10 text-nikke-accent border border-nikke-accent/40 font-semibold px-3 py-1.5 rounded-lg hover:bg-nikke-accent/20 transition disabled:opacity-50"
      >
        {phase === 'loading' ? t('ai_rebuilding') : t('ai_another_team')}
      </button>
    </div>
  );
}

function AiRecommendSection({ roster, aiMode, onAiModeChange, bossElement, onBossElementChange, tower, onTowerChange, dataFreshness }) {
  const { t } = useLanguage();
  if (!roster) return null;
  const isStale = dataFreshness && (dataFreshness.characterDatabase.stale || dataFreshness.synergyNotes.stale);

  return (
    <section className="bg-nikke-panel rounded-xl p-5 border border-nikke-accent/40 shadow-lg shadow-nikke-accent/5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-lg font-bold text-nikke-accent">{t('ai_section_heading')}</h2>
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
              {t(m.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {aiMode === 'bossing' && (
        <div className="flex items-center flex-wrap gap-2 mb-3 mt-2">
          <span className="text-xs text-slate-500">{t('boss_weak_element')}</span>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => onBossElementChange(null)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                !bossElement
                  ? 'bg-nikke-gold/20 text-nikke-gold border-nikke-gold/60 font-semibold'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              {t('none_selected')}
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
                {t(el.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      {aiMode === 'tribe_tower' && (
        <div className="mt-2 mb-3">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xs text-slate-500">{t('tower_kind')}</span>
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
                  {t(tw.labelKey)}
                  <span className="ml-1 opacity-60">{t(tw.daysKey)}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {tower
              ? t('tower_corp_note')
              : t('tower_normal_note')}
            {tower === 'pilgrim' &&
              ` ${t('tower_pilgrim_note')}`}
          </p>
        </div>
      )}

      <p className="text-sm text-slate-400 mb-3">
        {t('ai_section_desc')}
        {aiMode === 'bossing' && bossElement && ` ${t('ai_desc_boss')}`}
        {aiMode === 'tribe_tower' && tower && ` ${t('ai_desc_tower')}`}
      </p>

      {isStale && (
        <p className="text-xs text-amber-400 mb-3">
          {t('data_stale_note')(dataFreshness.characterDatabase.asOf, dataFreshness.synergyNotes.asOf)}
        </p>
      )}

      <AiRecommendButton roster={roster} mode={aiMode} bossElement={bossElement} tower={tower} />

      {roster.unresolvedCount > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          {t('unresolved_note')(roster.unresolvedCount)}
        </p>
      )}
    </section>
  );
}

export default function ResultPanel({ result, roster, aiMode, onAiModeChange, bossElement, onBossElementChange, tower, onTowerChange, dataFreshness }) {
  const { lang, t } = useLanguage();
  if (!result) return null;
  const { ownedCount } = result;

  if (ownedCount === 0) {
    return (
      <div className="bg-nikke-panel rounded-xl p-6 border border-slate-800 text-center text-slate-400">
        {t('select_nikkes_first')}
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


    </div>
  );
}
