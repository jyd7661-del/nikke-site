export const LOCALES = ['ko', 'en', 'ja'];
export const LOCALE_LABELS = { ko: '한국어', en: 'English', ja: '日本語' };
export const DEFAULT_LOCALE = 'ko';

// 가벼운 클라이언트 사이드 다국어 사전. URL 경로는 바꾸지 않고(예: /ko, /en 분리 없음)
// 브라우저에 저장된 언어 선택값에 따라 화면 문구만 바꿔치기한다. AdSense 심사가 막 시작된
// 시점이라 URL 구조를 바꾸는 건 위험 부담이 커서 일부러 피했다(components/LanguageProvider.js 참고).
const dict = {
  ko: {
    site_name_suffix: '조합 추천',
    nav_recommend: '추천',
    nav_combos: '커뮤니티 조합',
    nav_board: '게시판',
    login: '로그인',
    logout: '로그아웃',
    login_email_placeholder: '이메일 주소',
    login_send_link: '로그인 링크 받기',
    login_sent: '메일함에서 로그인 링크를 확인해주세요!',
    login_password_note: '비밀번호 없이, 받은 메일의 링크를 클릭하면 로그인됩니다.',
    home_title: '내 니케로 최고의 조합 찾기',
    home_subtitle: '보유중인 니케를 선택하면 바로 조합을 추천해드려요. 로그인 없이도 바로 사용할 수 있어요.',
    logged_in_status: '로그인 상태 — 보유 니케가 자동 저장됩니다.',
    share_link_copy: '친구에게 공유 링크 복사',
    login_hint: '로그인하면 보유 니케가 자동 저장되고, 친구와 공유할 수 있어요. (로그인 안 해도 추천 기능은 바로 사용 가능)',
    top_banner_ad: '상단 배너 광고',
    bottom_ad: '본문 하단 광고',
    selected_count: (n) => `선택한 니케: ${n}명`,
    loading_suffix: ' (불러오는 중...)',
    get_recommendation: '조합 추천받기',
    community_title: '💬 유저들과 조합·정보 나누기',
    community_subtitle: '내가 쓰는 조합을 직접 등록하고 투표받거나, 게시판에서 다른 지휘관들과 이야기해보세요.',
    view_combos: '커뮤니티 조합 보기',
    go_board: '게시판 가기',
    // 커뮤니티 번역 (2026-08-09)
    translated_badge: '자동 번역',
    show_original: '원문 보기',
    show_translation: '번역 보기',
    translate_pending: '번역 준비 중',
    translate_failed: '자동 번역을 만들지 못해 원문을 그대로 보여드립니다.',
    footer_disclaimer_1: '본 사이트는 팬 제작 비공식 정보 사이트이며, 승리의 여신: 니케의 저작권은 시프트업(SHIFT UP)에 있습니다.',
    footer_disclaimer_2: '조합 정보는 커뮤니티 공략을 참고해 정리한 자료로 실제 게임 밸런스와 다를 수 있습니다.',
    footer_fan_site: '니케 조합 추천은 승리의 여신: 니케(시프트업) 비공식 팬 사이트입니다.',
    privacy_policy: '개인정보처리방침',
  },
  en: {
    site_name_suffix: 'Team Guide',
    nav_recommend: 'Recommend',
    nav_combos: 'Community Teams',
    nav_board: 'Board',
    login: 'Log in',
    logout: 'Log out',
    login_email_placeholder: 'Email address',
    login_send_link: 'Send login link',
    login_sent: 'Check your inbox for the login link!',
    login_password_note: 'No password needed — just click the link in your email to log in.',
    home_title: 'Find the best team with your Nikkes',
    home_subtitle: 'Select the Nikkes you own and get an instant team recommendation. No login required.',
    logged_in_status: 'Logged in — your roster is saved automatically.',
    share_link_copy: 'Copy share link for friends',
    login_hint: 'Log in to save your roster automatically and share it with friends. (Recommendations work without logging in too.)',
    top_banner_ad: 'Top banner ad',
    bottom_ad: 'Bottom content ad',
    selected_count: (n) => `Selected Nikkes: ${n}`,
    loading_suffix: ' (loading...)',
    get_recommendation: 'Get team recommendation',
    community_title: '💬 Share teams & info with other players',
    community_subtitle: 'Post your own team and get votes, or chat with other commanders on the board.',
    view_combos: 'View community teams',
    go_board: 'Go to board',
    translated_badge: 'Auto-translated',
    show_original: 'Show original',
    show_translation: 'Show translation',
    translate_pending: 'Translation pending',
    translate_failed: 'Automatic translation is unavailable, so the original text is shown.',
    footer_disclaimer_1: 'This is an unofficial fan-made information site. All rights to Goddess of Victory: NIKKE belong to SHIFT UP.',
    footer_disclaimer_2: 'Team info is compiled from community guides and may differ from actual in-game balance.',
    footer_fan_site: '"Nikke Team Guide" is an unofficial fan site for Goddess of Victory: NIKKE (SHIFT UP).',
    privacy_policy: 'Privacy Policy',
  },
  ja: {
    site_name_suffix: '編成ガイド',
    nav_recommend: 'おすすめ',
    nav_combos: 'コミュニティ編成',
    nav_board: '掲示板',
    login: 'ログイン',
    logout: 'ログアウト',
    login_email_placeholder: 'メールアドレス',
    login_send_link: 'ログインリンクを受け取る',
    login_sent: 'メールで届いたログインリンクをご確認ください!',
    login_password_note: 'パスワード不要、届いたメールのリンクをクリックするとログインできます。',
    home_title: '手持ちのニケで最強編成を探そう',
    home_subtitle: '所持しているニケを選ぶとすぐに編成をおすすめします。ログインなしでもすぐ使えます。',
    logged_in_status: 'ログイン中 — 所持ニケが自動保存されます。',
    share_link_copy: 'フレンドに共有リンクをコピー',
    login_hint: 'ログインすると所持ニケが自動保存され、フレンドと共有できます。(ログインなしでもおすすめ機能はすぐ使えます)',
    top_banner_ad: '上部バナー広告',
    bottom_ad: '本文下部広告',
    selected_count: (n) => `選択したニケ: ${n}体`,
    loading_suffix: '(読み込み中...)',
    get_recommendation: '編成をおすすめしてもらう',
    community_title: '💬 ユーザーと編成・情報を共有しよう',
    community_subtitle: '自分の編成を登録して投票を集めたり、掲示板で他の指揮官と交流しよう。',
    view_combos: 'コミュニティ編成を見る',
    go_board: '掲示板へ',
    translated_badge: '自動翻訳',
    show_original: '原文を見る',
    show_translation: '翻訳を見る',
    translate_pending: '翻訳の準備中',
    translate_failed: '自動翻訳を作成できなかったため、原文をそのまま表示しています。',
    footer_disclaimer_1: '本サイトはファン制作の非公式情報サイトであり、『勝利の女神:NIKKE』の著作権はShift Upに帰属します。',
    footer_disclaimer_2: '編成情報はコミュニティ攻略を参考にまとめたものであり、実際のゲームバランスと異なる場合があります。',
    footer_fan_site: '「ニケ編成ガイド」は『勝利の女神:NIKKE』(Shift Up)の非公式ファンサイトです。',
    privacy_policy: 'プライバシーポリシー',
  },
};

// -----------------------------------------------------------------------------
// 원문 언어 판별
//
// 화면 언어 설정을 그대로 쓰지 않는 이유: 화면을 영어로 두고 한국어로 쓰는 사람이 있다.
// 그러면 원문이 en 으로 기록돼 **한국어 글을 한국어로 번역하려 들고**, 정작 필요한
// 일본어 번역은 안 만들어진다. 글자만 보면 확실히 알 수 있는 걸 설정에 맡길 이유가 없다.
//
// 한글(가-힣)은 한국어에만, 가나(ひらがな/カタカナ)는 일본어에만 쓰인다. 이 두 개면
// 우리가 지원하는 세 언어는 갈린다. 한자만 있는 경우는 일본어로 본다(중국어는 미지원).
// -----------------------------------------------------------------------------
export function detectLang(text, fallback = DEFAULT_LOCALE) {
  const s = String(text || '');
  if (!s.trim()) return fallback;
  let hangul = 0;
  let kana = 0;
  let kanji = 0;
  let latin = 0;
  for (const ch of s) {
    // 완성형 한글 + 호환 자모(ㅋㅋㅋ, ㅠㅠ 같은 것도 분명한 한국어 단서다)
    if ((ch >= '가' && ch <= '힣') || (ch >= 'ㄱ' && ch <= 'ㆎ')) hangul++;
    else if ((ch >= 'ぁ' && ch <= 'ゖ') || (ch >= 'ァ' && ch <= 'ヴ')) kana++;
    else if (ch >= '一' && ch <= '鿿') kanji++;
    else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) latin++;
  }
  if (hangul > 0 && hangul >= kana) return 'ko';
  if (kana > 0) return 'ja';
  if (kanji > 0) return 'ja';
  // 라틴 문자만 있으면 영어로 본다. 여기서 fallback(기본 ko)으로 넘기면
  // 영어 글이 한국어로 기록돼 **영어 번역본이 안 만들어진다.**
  if (latin > 0) return 'en';
  // 숫자·기호뿐이라 단서가 없을 때만 fallback
  return LOCALES.includes(fallback) ? fallback : DEFAULT_LOCALE;
}

export function t(key, locale) {
  const table = dict[locale] || dict[DEFAULT_LOCALE];
  const value = table[key] ?? dict[DEFAULT_LOCALE][key] ?? key;
  return value;
}

export default dict;
