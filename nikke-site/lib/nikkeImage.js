// 니케 위키(Fandom)의 캐릭터 아이콘 이미지를 참조합니다.
// 이미지 파일 자체를 사이트에 올리지 않고, 위키 서버의 URL을 그대로 참조(핫링크)합니다.
// 출처: https://nikke-goddess-of-victory-international.fandom.com
const WIKI_IMAGE_BASE = 'https://static.wikia.nocookie.net/nikke-goddess-of-victory-international/images/';

export function nikkeImageUrl(path) {
  return path ? `${WIKI_IMAGE_BASE}${path}` : null;
}
