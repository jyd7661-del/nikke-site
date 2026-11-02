// 사진으로 보유 니케 넣기 — 브라우저에서 캡처를 줄이고 자른다(2026-11-02, 베타). app/api/roster-photo가 받는 모양을 만든다.
//
// ⚠️ 11-02 운영 첫 시험: 긴 변 1568(724x1568)로 줄였더니 헬름·목단의 주황 하트(애장품)를 못 읽었다 — 같은 캡처를
//   그 크기로 3번 보내 1번만 읽음, 원본(1080x2340)·폭 1000은 6번 모두 읽음. "API가 1.15MP로 줄이니 미리 줄여도 같다"는
//   가정이 틀렸다(원본 입력 토큰이 더 많다). 그래서 폰 캡처는 거의 줄이지 않는다(긴 변 2400 · 2.6MP 안).
//   세로 캡처(1080x2340 등): 그대로 한 장. 보관용 사진도 이것(따로 두 번 보내지 않는다).
//   가로 캡처(2340x1080 등): 통째로 보내면 카드 28~42장이 1.15MP 안에 들어가 이름이 뭉개진다(11-02 시험: 오독 다수).
//     세로 띠 3개로 나누고(옆 띠와 7.5%씩 겹쳐 경계 카드가 한쪽에는 온전히 나온다) 띠마다 2배까지 키운다(11-02 시험 조건).
//     폰 비율(가로/세로 ≥ 1.9)이면 위아래 메뉴를 잘라 카드 칸(높이 25~87%)만 남긴다 — 시험한 화면 배치. 태블릿 비율은 자르지 않는다.
// 가로의 보관용 사진(photo)은 긴 변 1568 한 장 — 나중에 결과와 비교할 때 사람이 본다.

const MAX_LONG = 2400;
const MAX_PIXELS = 2_600_000;
const QUALITY = 0.8;
// 보관용 가로 사진(사람이 볼 것)
const PHOTO_LONG = 1568;

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* 아래 방식으로 */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 원본의 (sx, sy, sw, sh) 영역을 긴 변 2400·2.6MP 안으로 맞춰 JPEG base64로. upscale이면 작은 띠를 2배까지 키운다.
function crop(img, sx, sy, sw, sh, upscale = false, maxLong = MAX_LONG) {
  let k = Math.min(maxLong / Math.max(sw, sh), Math.sqrt(MAX_PIXELS / (sw * sh)));
  k = upscale ? Math.min(k, 2) : Math.min(k, 1);
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', QUALITY).split(',')[1];
}

// File → { orientation, photo, parts } — 세로는 photo 없이 보낸다(서버가 parts[0]을 보관)
export async function prepareRosterPhoto(file) {
  const img = await loadImage(file);
  const W = img.width;
  const H = img.height;
  if (H >= W) {
    const one = crop(img, 0, 0, W, H);
    return { orientation: 'portrait', photo: null, parts: [one] };
  }
  const photo = crop(img, 0, 0, W, H, false, PHOTO_LONG);
  const phone = W / H >= 1.9;
  const top = phone ? Math.round(H * 0.25) : 0;
  const bottom = phone ? Math.round(H * 0.87) : H;
  const third = W / 3;
  const ov = Math.round(W * 0.075);
  const parts = [0, 1, 2].map((i) => {
    const x0 = Math.max(0, Math.round(i * third) - ov);
    const x1 = Math.min(W, Math.round((i + 1) * third) + ov);
    return crop(img, x0, top, x1 - x0, bottom - top, true);
  });
  return { orientation: 'landscape', photo, parts };
}
