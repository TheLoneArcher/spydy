'use client';

/**
 * Crops and resizes an image to a 512x512 square JPEG Blob client-side.
 */
export async function cropToSquare512(file: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not initialize canvas context'));
          return;
        }

        const size = Math.min(img.naturalWidth, img.naturalHeight);
        const startX = (img.naturalWidth - size) / 2;
        const startY = (img.naturalHeight - size) / 2;

        ctx.drawImage(img, startX, startY, size, size, 0, 0, 512, 512);

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('Canvas image conversion failed'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          0.88
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
