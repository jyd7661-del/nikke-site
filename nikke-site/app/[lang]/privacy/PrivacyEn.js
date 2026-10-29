// 개인정보처리방침 영어 번역본(2026-10-28). 기준은 한국어판(page.js) — 그쪽을 고치면 여기도 같은 날 고친다.
const A = 'text-nikke-accent underline';

export default function PrivacyEn({ consent }) {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 text-sm leading-relaxed text-slate-300">
      <h1 className="text-2xl font-extrabold text-white mb-2">Privacy Policy</h1>
      <p className="text-slate-500 mb-2">Effective date: October 29, 2026 (first effective: August 4, 2026)</p>
      <p className="text-slate-500 mb-8">
        This is a translation provided for convenience. If it differs from the Korean original, the Korean version prevails.
      </p>

      <p className="mb-8">
        &quot;Nikke Team Guide&quot; (the &quot;Site&quot;) is an unofficial fan site for players of Goddess of Victory: NIKKE.
        We value your personal information and explain how we handle it below.
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">1. Information we collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            When you sign in: you <strong>sign in with your Google account</strong>, and we receive your email address from
            Google to identify your account (via Supabase Auth). The Site never receives or stores your Google password.
          </li>
          <li>Information you enter: a nickname (shown publicly on the board and community teams)</li>
          <li>
            When you use the service: the characters you mark as owned, the roster included in AI recommendation requests,
            community teams, board posts and comments you write, and 👍/👎 feedback and up/down votes on teams
          </li>
          <li>Automatically collected: visit statistics, device and browser information, cookies (see section 2)</li>
          <li>
            To prevent abuse: to limit AI recommendations and prevent duplicate feedback, we convert your IP address into an{' '}
            <strong>irreversible form (SHA-256 hash)</strong> and store it only in usage records. We do not store the original IP address.
          </li>
          <li>
            Visit statistics: we count how many times each page is opened, daily visitors, and, on your first page, where you came
            from (only the previous site&apos;s domain name — never search terms or full addresses) and your country. To count
            visitors, we store your IP address and browser information{' '}
            <strong>combined with the date in an irreversible form (SHA-256 hash)</strong>;{' '}
            <strong>this value changes every day, so it cannot be used to recognize the same visitor across days.</strong>{' '}
            We do not store the original IP address or browser information, and this does not use cookies. To count returning
            visitors, your browser keeps only the date of your last visit in local storage (localStorage), and we receive only
            whether you visited on an earlier date (in European Economic Area, UK and Swiss time zones, only after you accept
            analytics cookies). Only the Site
            operator can see the totals.
          </li>
          <li>
            Google Analytics: we use Google Analytics 4 for visit statistics. Google uses cookies to collect pages viewed, time
            spent, device, approximate region and similar data; the operator sees only aggregate figures that do not identify
            individuals. If you visit from the European Economic Area, the UK or Switzerland, analytics cookies are not used
            until you consent (you can change your choice at any time{consent && <> — {consent}</>}). You can also opt out with
            the{' '}
            <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className={A}>
              Google Analytics Opt-out Browser Add-on
            </a>
            .
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">2. Cookies and advertising</h2>
        <p className="mb-2">
          The Site displays ads through Google AdSense. In doing so, Google and its advertising partners may use cookies to
          serve ads based on your previous visits to this and other sites.
        </p>
        <p className="mb-2">
          You can turn off personalized ads in{' '}
          <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer" className={A}>
            Google Ad Settings
          </a>
          . For details on how Google uses cookies in ads on partner sites, see{' '}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className={A}>
            Google&apos;s Privacy Policy
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">3. Third-party services</h2>
        <p className="mb-2">We use the following services to run the Site.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Supabase — authentication and database</li>
          <li>Google — sign-in (OAuth), AdSense ads, Google Analytics visit statistics</li>
          <li>
            Anthropic API (Claude) — AI team recommendations and <strong>automatic translation of community posts</strong>
          </li>
          <li>Vercel — site hosting</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">4. Automatic translation of community posts</h2>
        <p className="mb-2">
          Board posts, comments and community teams are automatically translated so that users of other languages can read
          them. For this, <strong>the title, body and description you write are sent to the Anthropic API (Claude) for
          translation</strong>, and the translations are stored and displayed on the Site together with the original.
        </p>
        <p className="mb-2">
          Translations follow the same visibility as the original. Translations of private posts are visible only to the author
          and the operator. When you delete the original, its translations are deleted too.
        </p>
        <p>Please do not post content you do not want automatically translated.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">5. Retention and deletion</h2>
        <p className="mb-2">
          Collected information is used only to provide the service. You can edit or delete your own posts, comments and
          community teams on the Site; deleting them also deletes their translations and vote records.
        </p>
        <p>To delete your account itself or any other information, please contact us at the address below.</p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-nikke-accent mb-2">6. Contact</h2>
        <p>
          For privacy questions, please contact{' '}
          <a href="mailto:jyd7661@gmail.com" className={A}>
            jyd7661@gmail.com
          </a>
          . This policy may be updated in line with applicable laws and changes to the service.
        </p>
      </section>
    </main>
  );
}
