import 'server-only';
import sharp from 'sharp';
import crypto from 'node:crypto';

/**
 * 64-bit Difference Hash (dHash) implementation
 * Resizes image to 9x8 grayscale, then compares horizontally adjacent pixels.
 * 8 rows * 8 comparisons = 64 bits.
 */
export async function computeDHash(imageBuffer: Buffer): Promise<bigint> {
  const { data, info } = await sharp(imageBuffer)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 9 || info.height !== 8) {
    throw new Error(`Unexpected image dimensions: ${info.width}x${info.height}`);
  }

  let hash = BigInt(0);
  const one = BigInt(1);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const leftPixel = data[row * 9 + col];
      const rightPixel = data[row * 9 + col + 1];

      hash <<= one;
      if (leftPixel > rightPixel) {
        hash |= one;
      }
    }
  }

  return hash;
}

/**
 * Computes SHA-256 hex string of a buffer
 */
export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Verifies JPEG magic bytes (FF D8 FF)
 */
export function isJpegBuffer(buffer: Buffer): boolean {
  if (buffer.length < 3) return false;
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

/**
 * Strips all EXIF metadata and auto-rotates by orientation tag
 */
export async function stripExifAndNormalize(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .rotate() // auto-rotates based on EXIF orientation before stripping
    .withMetadata({}) // drops all EXIF/IPTC/XMP metadata
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();
}
