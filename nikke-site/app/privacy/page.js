// 개인정보처리방침.
//
// ⚠️ 법적 문서입니다. 코드가 바뀌면 여기도 같이 바뀌어야 합니다 —
//    특히 로그인 방식, 제3자로 나가는 데이터, 수집 항목이 그렇습니다.
//    2026-08-11에 아래 세 가지가 실제 동작과 어긋나 있는 것을 발견해 고쳤습니다:
//      · 매직링크 로그인으로 적혀 있었으나 2026-08-09에 구글 OAuth로 바뀜(매직링크는 제거됨)
//      · 게시글 본문이 번역을 위해 Anthropic으로 전송되는데 그 사실이 빠져 있었음
//      · 닉네임을 저장·공개 표시하는데 수집 항목에 없었음
//
// 이 페이지는 서버 컴포넌트라 클라이언트 i18n(lib/i18n.js)을 쓸 수 없습니다.
// 번역본을 올릴지는 별도 판단 사항입니다(어느 언어본이 기준인지 명시가 필요).
export const metadata = {
  title: '개인정보처리방침 | 니케 조합 추천',
  description: '니케 조합 추천 사이트의 개인정보처리방침입니다.',
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 text-sm leading-relaxed text-slate-300">
      <h1 className="text-2xl font-extrabold text-white mb-2">개인정보처리방침</h1>
      <p className="text-slate-500 mb-8">시행일자: 2026년 8월 11일 (최초 시행: 2026년 8월 4일)</p>

      <p className="mb-8">
        '니케 조합 추천'(이하 '사이트')은 승리의 여신: 니케 플레이어를 위한 비공식 팬 사이트로,
        이용자의 개인정보를 소중히 다루며 아래와 같이 개인정보처리방침을 안내합니다.
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">1. 수집하는 정보</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            로그인 시: <strong>구글 계정으로 로그인</strong>하며, 구글로부터 이메일 주소를 전달받아
            계정 식별에 사용합니다(Supabase Auth 이용). 사이트는 구글 계정의 비밀번호를 받지도
            보관하지도 않습니다.
          </li>
          <li>이용자가 직접 입력하는 정보: 닉네임(게시판·커뮤니티 조합에 공개 표시됩니다)</li>
          <li>
            서비스 이용 시: 보유 캐릭터 선택 정보, AI 추천 요청에 포함되는 로스터 정보, 작성한
            커뮤니티 조합·게시판 게시글과 댓글, 조합에 대한 👍/👎 피드백 및 추천/비추천 투표
          </li>
          <li>자동 수집 정보: 방문 통계, 기기·브라우저 정보, 쿠키(아래 2번 항목 참고)</li>
          <li>
            남용 방지 목적: AI 추천 횟수 제한과 피드백 중복 방지를 위해 접속 IP 주소를{' '}
            <strong>되돌릴 수 없는 형태로 변환(SHA-256 해시)</strong>해 사용량 기록에만 저장합니다.
            IP 주소 원본은 저장하지 않습니다.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">2. 쿠키와 광고</h2>
        <p className="mb-2">
          이 사이트는 Google AdSense를 통해 광고를 게재하며, 이 과정에서 Google과 광고 파트너가
          쿠키를 사용해 이용자의 이전 사이트 방문 기록 등을 바탕으로 광고를 게재할 수 있습니다.
        </p>
        <p className="mb-2">
          이용자는{' '}
          <a
            href="https://adssettings.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-nikke-accent underline"
          >
            Google 광고 설정
          </a>
          에서 맞춤 광고를 비활성화할 수 있으며, Google이 파트너 사이트에서 광고에 쿠키를 사용하는
          방식에 대한 자세한 내용은{' '}
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener noreferrer"
            className="text-nikke-accent underline"
          >
            Google 개인정보처리방침
          </a>
          에서 확인할 수 있습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">3. 제3자 서비스</h2>
        <p className="mb-2">사이트 운영을 위해 아래 서비스를 이용합니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Supabase — 회원 인증 및 데이터베이스</li>
          <li>Google — 로그인(OAuth) 및 AdSense 광고 게재</li>
          <li>
            Anthropic API(Claude) — AI 조합 추천 생성, 그리고{' '}
            <strong>커뮤니티 글 자동 번역</strong>
          </li>
          <li>Vercel — 사이트 호스팅</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">4. 커뮤니티 글의 자동 번역</h2>
        <p className="mb-2">
          게시판 글·댓글과 커뮤니티 조합은 다른 언어 사용자도 읽을 수 있도록 자동 번역본을 함께
          만듭니다. 이를 위해 <strong>이용자가 작성한 제목·본문·설명이 번역 목적으로 Anthropic
          API(Claude)에 전송</strong>되며, 만들어진 번역본은 원문과 함께 사이트에 보관·표시됩니다.
        </p>
        <p className="mb-2">
          번역본은 원문과 동일한 공개 범위를 따릅니다. 비밀글로 작성한 글의 번역본은 작성자와
          운영자에게만 보입니다. 원문을 삭제하면 번역본도 함께 삭제됩니다.
        </p>
        <p>
          자동 번역을 원하지 않는 내용은 게시하지 않으시길 권합니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">5. 정보의 보관 및 삭제</h2>
        <p className="mb-2">
          수집된 정보는 서비스 제공 목적으로만 이용됩니다. 이용자는 사이트에서 직접 자신의 게시글·
          댓글·커뮤니티 조합을 수정하거나 삭제할 수 있으며, 삭제 시 해당 글의 번역본과 투표 기록도
          함께 삭제됩니다.
        </p>
        <p>
          계정 자체의 삭제나 그 밖의 정보 삭제는 아래 연락처로 요청해 주시기 바랍니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-nikke-accent mb-2">6. 문의</h2>
        <p>
          개인정보와 관련한 문의사항은{' '}
          <a href="mailto:jyd7661@gmail.com" className="text-nikke-accent underline">
            jyd7661@gmail.com
          </a>
          으로 연락 주시기 바랍니다. 본 방침은 관련 법령 및 서비스 변경에 따라 수정될 수 있습니다.
        </p>
      </section>
    </main>
  );
}
