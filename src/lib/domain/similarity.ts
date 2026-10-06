/**
 * Pure similarity scoring functions for duplicate civic reports
 */

export function calculateGeoSimilarity(distanceMeters: number, maxRadiusMeters = 75): number {
  return Math.max(0, Math.min(1, 1 - distanceMeters / maxRadiusMeters));
}

export function extractTrigrams(str: string): Set<string> {
  const normalized = `  ${str.toLowerCase().trim()}  `;
  const trigrams = new Set<string>();
  for (let i = 0; i < normalized.length - 2; i++) {
    trigrams.add(normalized.slice(i, i + 3));
  }
  return trigrams;
}

export function calculateTitleSimilarity(titleA: string, titleB: string): number {
  if (!titleA || !titleB) return 0;
  if (titleA.trim().toLowerCase() === titleB.trim().toLowerCase()) return 1;

  const triA = extractTrigrams(titleA);
  const triB = extractTrigrams(titleB);
  if (triA.size === 0 || triB.size === 0) return 0;

  let intersection = 0;
  for (const tri of triA) {
    if (triB.has(tri)) intersection++;
  }

  const union = triA.size + triB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function calculatePhashHammingDistance(hashA: bigint, hashB: bigint): number {
  let xor = hashA ^ hashB;
  let count = 0;
  const zero = BigInt(0);
  const one = BigInt(1);
  while (xor > zero) {
    count += Number(xor & one);
    xor >>= one;
  }
  return count;
}

export function calculatePhashSimilarity(hammingDistance: number): number {
  return Math.max(0, Math.min(1, 1 - hammingDistance / 64));
}

export interface DuplicateScoreParams {
  distanceMeters: number;
  titleA: string;
  titleB: string;
  sameCategory: boolean;
  phashA?: bigint | null;
  phashB?: bigint | null;
}

export function calculateDuplicateScore({
  distanceMeters,
  titleA,
  titleB,
  sameCategory,
  phashA,
  phashB,
}: DuplicateScoreParams): {
  score: number;
  geoSim: number;
  titleSim: number;
  phashSim: number;
  hammingDistance: number | null;
} {
  if (!sameCategory || distanceMeters > 75) {
    return {
      score: 0,
      geoSim: 0,
      titleSim: 0,
      phashSim: 0,
      hammingDistance: null,
    };
  }

  const geoSim = calculateGeoSimilarity(distanceMeters, 75);
  const titleSim = calculateTitleSimilarity(titleA, titleB);

  let phashSim = 0.5; // neutral fallback when one image is missing
  let hammingDistance: number | null = null;

  if (phashA != null && phashB != null) {
    hammingDistance = calculatePhashHammingDistance(phashA, phashB);
    phashSim = calculatePhashSimilarity(hammingDistance);
  }

  const score = 0.4 * geoSim + 0.3 * titleSim + 0.3 * phashSim;

  return {
    score,
    geoSim,
    titleSim,
    phashSim,
    hammingDistance,
  };
}

export function similarityScore(distanceMeters: number, sameCategory: boolean, titleSimilarity: number): number {
  const distanceScore = Math.max(0, 1 - distanceMeters / 75);
  return 0.5 * distanceScore + 0.2 * Number(sameCategory) + 0.2 * Math.max(0, Math.min(1, titleSimilarity));
}
