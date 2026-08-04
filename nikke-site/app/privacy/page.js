export const metadata = {
  title: '개인정보처리방침 | 니케 조합 추천',
  description: '니케 조합 추천 사이트의 개인정보처리방침입니다.',
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 text-sm leading-relaxed text-slate-300">
      <h1 className="text-2xl font-extrabold text-white mb-2">개인정보처리방침</h1>
      <p className="text-slate-500 mb-8">시행일자: 2026년 8월 4일</p>

      <p className="mb-8">
        '니케 조합 추천'(이하 '사이트')은 승리의 여신: 니케 플레이어를 위한 비공식 팬 사이트로,
        이용자의 개인정보를 소중히 다루며 아래와 같이 개인정보처리방침을 안내합니다.
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">1. 수집하는 정보</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>로그인 시: 이메일 주소(비밀번호 없는 매직 링크 로그인 방식, Supabase Auth 사용)</li>
          <li>서비스 이용 시: 보유 캐릭터 선택 정보, AI 추천 요청에 포함되는 로스터 정보, 작성한 커뮤니티 조합·게시판 게시글, 조합에 대한 👍/👎 피드백</li>
          <li>자동 수집 정보: 방문 통계, 기기·브라우저 정보, 쿠키(아래 2번 항목 참고)</li>
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
          <li>Anthropic API(Claude) — AI 조합 추천 생성</li>
          <li>Google AdSense — 광고 게재</li>
          <li>Vercel — 사이트 호스팅</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">4. 정보의 보관 및 삭제</h2>
        <p>
          수집된 정보는 서비스 제공 목적으로만 이용되며, 이용자는 언제든지 아래 연락처로 문의하여
          본인의 계정 및 게시물 삭제를 요청할 수 있습니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-nikke-accent mb-2">5. 문의</h2>
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
