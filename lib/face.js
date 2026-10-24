// Face-aware crop. Uses the browser FaceDetector when available, else upper-center.
export async function detectFaceBox(imageUrl) {
  if (typeof window === 'undefined' || !imageUrl) return null;
  try {
    if (!('FaceDetector' in window)) return null;
    const img = await loadImage(imageUrl);
    const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    const faces = await detector.detect(img);
    if (!faces?.length) return null;
    const box = faces[0].boundingBox;
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      w: img.naturalWidth || img.width,
      h: img.naturalHeight || img.height,
    };
  } catch {
    return null;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function cropFromFace(face, vertical = true) {
  if (!face || !face.w || !face.h) {
    return vertical
      ? 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:x=(iw-720)/2:y=(ih-1280)/5'
      : 'scale=1280:-2';
  }
  // Map face center to a 9:16 crop window.
  const cx = Math.max(0, Math.min(1, face.x / face.w));
  const cy = Math.max(0, Math.min(1, face.y / face.h));
  if (!vertical) return 'scale=1280:-2';
  return `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:x=(iw-720)*${cx.toFixed(3)}:y=(ih-1280)*${Math.max(0, cy - 0.15).toFixed(3)}`;
}
