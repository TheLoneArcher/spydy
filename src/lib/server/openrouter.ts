import 'server-only';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import type { CivicCategory, ReportSeverity } from '@/lib/domain/status';

export interface ClassificationResult {
  category: CivicCategory;
  confidence: number;
  severity: ReportSeverity;
  suggested_title: string;
  suggested_description: string;
  reasoning: string;
  model_used: string;
  source: 'ai' | 'heuristic';
}

export const classificationOutputSchema = z.object({
  category: z.enum(['pothole', 'streetlight', 'garbage', 'water_leak', 'other']),
  confidence: z.number().min(0).max(1),
  severity: z.enum(['critical', 'moderate', 'low']),
  suggested_title: z.string().max(100),
  suggested_description: z.string().max(400),
  reasoning: z.string().max(300),
});

const PREFERRED_FREE_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-2.0-flash-thinking-exp:free',
  'google/gemini-exp-1206:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'qwen/qwen-2-vl-72b-instruct:free',
  'google/gemini-2.0-flash-001',
];

let cachedFreeModels: string[] = [];
let cacheTimestamp = 0;

/**
 * Discovers available free-tier vision models from OpenRouter with 1-hour cache
 */
export async function getBestVisionModel(): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return PREFERRED_FREE_MODELS[0];

  const now = Date.now();
  if (cachedFreeModels.length > 0 && now - cacheTimestamp < 60 * 60 * 1000) {
    return cachedFreeModels[0];
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      const freeVisionSlugs = new Set<string>();

      for (const m of data.data || []) {
        const isFree = m.pricing?.prompt === '0' && m.pricing?.completion === '0';
        const isMultimodal = m.architecture?.modality?.includes('image->text');
        if (isFree && isMultimodal && m.id) {
          freeVisionSlugs.add(m.id);
        }
      }

      // Order according to preference
      const ordered = PREFERRED_FREE_MODELS.filter(id => freeVisionSlugs.has(id));
      for (const slug of freeVisionSlugs) {
        if (!ordered.includes(slug)) ordered.push(slug);
      }

      if (ordered.length > 0) {
        cachedFreeModels = ordered;
        cacheTimestamp = now;
        return ordered[0];
      }
    }
  } catch {
    // OpenRouter models endpoint unavailable, use fallback
  }

  return process.env.OPENROUTER_MODEL || PREFERRED_FREE_MODELS[0];
}

/**
 * Deterministic keyword + regex heuristic classifier (zero downtime fallback)
 */
export function classifyHeuristic(text: string): ClassificationResult {
  const normalized = text.toLowerCase();

  let category: CivicCategory = 'other';
  let severity: ReportSeverity = 'moderate';
  let confidence = 0.72;

  // Category detection patterns
  if (/\b(pothole|crater|asphalt|pavement|road damage|bump|rut|trench)\b/.test(normalized)) {
    category = 'pothole';
  } else if (/\b(streetlight|street light|light|lamp|pole|dark|wire|outage|luminaire)\b/.test(normalized)) {
    category = 'streetlight';
  } else if (/\b(garbage|trash|waste|bin|dump|rubbish|debris|refuse|litter|plastic)\b/.test(normalized)) {
    category = 'garbage';
  } else if (/\b(water|pipe|leak|flood|burst|drain|drainage|valve|seepage|overflow)\b/.test(normalized)) {
    category = 'water_leak';
  }

  // Severity detection patterns
  if (/\b(hazard|danger|deep crater|huge|burst|flooding|exposed|spark|critical|emergency|high pressure)\b/.test(normalized)) {
    severity = 'critical';
    confidence = Math.min(1.0, confidence + 0.15);
  } else if (/\b(minor|flicker|small|low|cosmetic|slow)\b/.test(normalized)) {
    severity = 'low';
  }

  const categoryName = category.replace('_', ' ');
  const title = `Reported ${categoryName} incident`;
  const desc = `Citizen reported ${categoryName} requiring municipal response in this area.`;

  logger.info(`[Classifier: Heuristic] Category: ${category}, Severity: ${severity}`);

  return {
    category,
    confidence,
    severity,
    suggested_title: title.slice(0, 80),
    suggested_description: desc.slice(0, 300),
    reasoning: `Rule-based municipal heuristic matched patterns for ${categoryName}.`,
    model_used: 'rule-heuristic-engine',
    source: 'heuristic',
  };
}

/**
 * Extracts and cleans JSON from AI model text (handles markdown ```json blocks)
 */
export function extractJsonFromResponse(raw: string): any {
  let cleaned = raw.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  // Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}
