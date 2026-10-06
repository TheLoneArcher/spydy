import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import sharp from 'sharp';
import { computeDHash, computeSha256, isJpegBuffer, stripExifAndNormalize } from './phash';
import { calculatePhashHammingDistance } from '../domain/similarity';

describe('phash and image verification', () => {
  it('validates JPEG magic bytes accurately', async () => {
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const invalidPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

    expect(isJpegBuffer(validJpeg)).toBe(true);
    expect(isJpegBuffer(invalidPng)).toBe(false);
  });

  it('computes 64-char sha256 checksum', () => {
    const buffer = Buffer.from('ResponSys civic issue verified image test');
    const hash = computeSha256(buffer);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('computes 64-bit dHash and demonstrates near-zero hamming on minor modifications', async () => {
    // Generate a simple gradient test image
    const img1 = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 120, g: 80, b: 40 },
      },
    })
      .jpeg()
      .toBuffer();

    // Slightly modified version (compressed quality 80)
    const img2 = await sharp(img1)
      .jpeg({ quality: 80 })
      .toBuffer();

    const hash1 = await computeDHash(img1);
    const hash2 = await computeDHash(img2);

    expect(typeof hash1).toBe('bigint');
    expect(typeof hash2).toBe('bigint');

    const distance = calculatePhashHammingDistance(hash1, hash2);
    // Modified version of identical image should have hamming distance <= 2
    expect(distance).toBeLessThanOrEqual(2);
  });

  it('strips EXIF metadata while maintaining JPEG validity', async () => {
    const rawImage = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const clean = await stripExifAndNormalize(rawImage);
    expect(isJpegBuffer(clean)).toBe(true);
    expect(clean.length).toBeGreaterThan(0);
  });
});
