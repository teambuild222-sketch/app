/**
 * Upload size caps — keep aligned with backend `max_image_upload_mb` /
 * `max_video_upload_mb` in app/config.py (overridable via env on Render).
 */
export const UPLOAD_MAX_MB = {
  /** After compression, uploaded JPEG size must fit this. */
  image: 25,
  /** Raw video file size. */
  video: 100,
} as const;

/** Camera rolls often exceed the upload cap; we still let the user pick them. */
export const PICK_MAX_MB = {
  image: 80,
  video: UPLOAD_MAX_MB.video,
} as const;

export function bytesFromMb(mb: number): number {
  return mb * 1024 * 1024;
}

export function uploadKindFromFile(file: File): 'image' | 'video' | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return null;
}

/**
 * Downscales photos before upload so a 40 MB iPhone shot becomes a few MB
 * JPEG without the user hitting "file too large".
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  const blob = await downscaleToJpegBlob(file, 2048, 0.85);
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

function downscaleToJpegBlob(file: File, maxDim: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process image'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image'))),
          'image/jpeg',
          quality,
        );
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
