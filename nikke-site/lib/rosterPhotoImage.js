// 사진으로 보유 니케 넣기 — 브라우저에서 캡처를 줄이고 자른다(2026-11-02, 베타). app/api/roster-photo가 받는 모양을 만든다.
//
// API는 이미지를 약 1.15MP로 줄여서 읽는다. 그래서
//   세로 캡처(1080x2340 등): 긴 변 1568로 줄여 한 장 그대로 보낸다(≈1.13MP — 손실 없음).
//   가로 캡처(2340x1080 등): 통째로 보내면 카드 28~42장이 1.15MP 안에 들어가 이름이 뭉개진다(11-02 시험: 오독 다수).
//     세로 띠 3개로 나누고(옆 띠와 7.5%씩 겹쳐 경계 카드가 한쪽에는 온전히 나온다) 띠마다 1.15MP까지 키운다.
//     폰 비율(가로/세로 ≥ 1.9)이면 위아래 메뉴를 잘라 카드 칸(높이 25~87%)만 남긴다 — 시험한 화면 배치. 태블릿 비율은 자르지 않는다.
// 보관용 사진(photo)은 긴 변 1568 한 장 — 나중에 결과와 비교할 때 사람이 본다.

const MAX_LONG = 1568;
const MAX_PIXELS = 1_150_000;
const QUALITY = 0.7;

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

// 원본의 (sx, sy, sw, sh) 영역을 긴 변 1568·1.15MP 안으로 맞춰 JPEG base64로. upscale이면 작은 띠를 2배까지 키운다.
function crop(img, sx, sy, sw, sh, upscale = false) {
  let k = Math.min(MAX_LONG / Math.max(sw, sh), Math.sqrt(MAX_PIXELS / (sw * sh)));
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

// File → { orientation, photo, parts }
export async function prepareRosterPhoto(file) {
  const img = await loadImage(file);
  const W = img.width;
  const H = img.height;
  if (H >= W) {
    const one = crop(img, 0, 0, W, H);
    return { orientation: 'portrait', photo: one, parts: [one] };
  }
  const photo = crop(img, 0, 0, W, H);
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
