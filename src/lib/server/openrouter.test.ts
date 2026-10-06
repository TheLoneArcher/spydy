import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  classificationOutputSchema,
  classifyHeuristic,
  extractJsonFromResponse,
} from './openrouter';

describe('openrouter classifier & zod schemas', () => {
  it('parses valid classification output schema', () => {
    const valid = {
      category: 'pothole',
      confidence: 0.95,
      severity: 'critical',
      suggested_title: 'Deep pothole at crossing',
      suggested_description: 'Dangerous asphalt crater on road',
      reasoning: 'Road surface crater observed clearly',
    };

    const parsed = classificationOutputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects output with out-of-range confidence (>1.0)', () => {
    const invalid = {
      category: 'streetlight',
      confidence: 1.25,
      severity: 'low',
      suggested_title: 'Lamp outage',
      suggested_description: 'Dark pole',
      reasoning: 'No light emitted',
    };

    const parsed = classificationOutputSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects output with missing required fields', () => {
    const missing = {
      category: 'garbage',
      confidence: 0.8,
    };

    const parsed = classificationOutputSchema.safeParse(missing);
    expect(parsed.success).toBe(false);
  });

  it('extracts JSON cleanly from markdown code blocks', () => {
    const markdownFenced = '```json\n{"category":"water_leak","confidence":0.88,"severity":"critical","suggested_title":"Pipe burst","suggested_description":"Flooding lane","reasoning":"Water spraying"}\n```';
    const json = extractJsonFromResponse(markdownFenced);
    expect(json.category).toBe('water_leak');
    expect(json.confidence).toBe(0.88);
  });

  it('heuristic classifies pothole keyword with critical severity for crater', () => {
    const res = classifyHeuristic('Huge asphalt crater and deep pothole causing vehicle hazard');
    expect(res.category).toBe('pothole');
    expect(res.severity).toBe('critical');
    expect(res.source).toBe('heuristic');
  });

  it('heuristic classifies streetlight outage', () => {
    const res = classifyHeuristic('Streetlight pole #12 is completely dark and broken');
    expect(res.category).toBe('streetlight');
    expect(res.source).toBe('heuristic');
  });

  it('heuristic classifies overflowing garbage', () => {
    const res = classifyHeuristic('Overflowing trash bin with municipal waste spilling');
    expect(res.category).toBe('garbage');
  });

  it('heuristic classifies water leak with pipe burst', () => {
    const res = classifyHeuristic('Water pipeline burst flooding the road');
    expect(res.category).toBe('water_leak');
    expect(res.severity).toBe('critical');
  });
});
