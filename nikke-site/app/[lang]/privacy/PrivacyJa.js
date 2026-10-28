// 개인정보처리방침 일본어 번역본(2026-10-28). 기준은 한국어판(page.js) — 그쪽을 고치면 여기도 같은 날 고친다.
const A = 'text-nikke-accent underline';

export default function PrivacyJa({ consent }) {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 text-sm leading-relaxed text-slate-300">
      <h1 className="text-2xl font-extrabold text-white mb-2">プライバシーポリシー</h1>
      <p className="text-slate-500 mb-2">施行日:2026年10月28日(初回施行:2026年8月4日)</p>
      <p className="text-slate-500 mb-8">
        この文書は便宜のための翻訳です。韓国語の原文と内容が異なる場合は、韓国語版が優先されます。
      </p>

      <p className="mb-8">
        「ニケ編成ガイド」(以下「本サイト」)は『勝利の女神:NIKKE』プレイヤーのための非公式ファンサイトです。
        利用者の個人情報を大切に扱い、その取り扱いについて以下のとおりご案内します。
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">1. 収集する情報</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            ログイン時:<strong>Googleアカウントでログイン</strong>し、アカウントの識別のためにGoogleからメールアドレスを受け取ります
            (Supabase Authを利用)。本サイトがGoogleアカウントのパスワードを受け取ったり保管したりすることはありません。
          </li>
          <li>利用者が入力する情報:ニックネーム(掲示板・コミュニティ編成に公開表示されます)</li>
          <li>
            サービス利用時:所持キャラクターの選択情報、AI推薦リクエストに含まれる編成情報、投稿したコミュニティ編成・掲示板の投稿とコメント、
            編成への👍/👎フィードバックおよび高評価/低評価の投票
          </li>
          <li>自動的に収集する情報:アクセス統計、端末・ブラウザ情報、Cookie(下記2を参照)</li>
          <li>
            不正利用の防止:AI推薦の回数制限とフィードバックの重複防止のため、接続IPアドレスを
            <strong>元に戻せない形(SHA-256ハッシュ)に変換</strong>して利用記録にのみ保存します。IPアドレスそのものは保存しません。
          </li>
          <li>
            アクセス統計:各ページが開かれた回数、1日の訪問者数、そして最初のページでは流入元(直前のサイトのドメイン名のみ。検索語やアドレス全体は保存しません)
            と接続国を集計します。訪問者数を数えるため、IPアドレスとブラウザ情報を
            <strong>日付と合わせて元に戻せない形(SHA-256ハッシュ)に変換</strong>して保存します。
            <strong>この値は毎日変わるため、日をまたいで同じ利用者かどうかを確認することはできません。</strong>
            IPアドレスとブラウザ情報そのものは保存せず、Cookieも使いません。集計値はサイト運営者だけが閲覧します。
          </li>
          <li>
            Google Analytics:アクセス統計のためにGoogle Analytics 4を利用しています。GoogleがCookieで閲覧ページ・滞在時間・端末・おおよその地域などを収集し、
            運営者は個人を特定できない集計のみを閲覧します。欧州経済領域・英国・スイスからのアクセスでは、同意をいただくまで分析用Cookieを使いません
            (同意はいつでも変更できます{consent && <> — {consent}</>})。
            <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className={A}>
              Google アナリティクス オプトアウト アドオン
            </a>
            で収集を拒否することもできます。
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">2. Cookieと広告</h2>
        <p className="mb-2">
          本サイトはGoogle AdSenseを通じて広告を掲載しており、その過程でGoogleおよび広告パートナーがCookieを使い、
          利用者の過去のサイト訪問履歴などに基づいて広告を表示することがあります。
        </p>
        <p className="mb-2">
          利用者は
          <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer" className={A}>
            Google 広告設定
          </a>
          でパーソナライズ広告を無効にできます。Googleがパートナーサイトの広告でCookieをどのように使うかについては、
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className={A}>
            Google プライバシー ポリシー
          </a>
          をご覧ください。
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">3. 第三者サービス</h2>
        <p className="mb-2">サイト運営のために以下のサービスを利用しています。</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Supabase — 会員認証およびデータベース</li>
          <li>Google — ログイン(OAuth)、AdSense広告の掲載、Google Analyticsアクセス統計</li>
          <li>
            Anthropic API(Claude) — AI編成推薦の生成、および<strong>コミュニティ投稿の自動翻訳</strong>
          </li>
          <li>Vercel — サイトのホスティング</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">4. コミュニティ投稿の自動翻訳</h2>
        <p className="mb-2">
          掲示板の投稿・コメントとコミュニティ編成は、他の言語の利用者も読めるよう自動翻訳版を一緒に作成します。そのため、
          <strong>利用者が書いたタイトル・本文・説明が翻訳のためにAnthropic API(Claude)へ送信</strong>され、
          作成された翻訳版は原文とともに本サイトに保管・表示されます。
        </p>
        <p className="mb-2">
          翻訳版は原文と同じ公開範囲に従います。非公開で投稿した記事の翻訳版は、投稿者と運営者にのみ表示されます。原文を削除すると翻訳版も一緒に削除されます。
        </p>
        <p>自動翻訳を望まない内容は投稿しないようお願いします。</p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-nikke-accent mb-2">5. 情報の保管と削除</h2>
        <p className="mb-2">
          収集した情報はサービス提供の目的にのみ利用します。利用者は本サイト上で自分の投稿・コメント・コミュニティ編成を直接編集・削除でき、
          削除すると、その翻訳版と投票記録も一緒に削除されます。
        </p>
        <p>アカウント自体の削除やその他の情報の削除は、下記の連絡先までご依頼ください。</p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-nikke-accent mb-2">6. お問い合わせ</h2>
        <p>
          個人情報に関するお問い合わせは
          <a href="mailto:jyd7661@gmail.com" className={A}>
            jyd7661@gmail.com
          </a>
          までご連絡ください。本ポリシーは関連法令およびサービスの変更に応じて改定されることがあります。
        </p>
      </section>
    </main>
  );
}
