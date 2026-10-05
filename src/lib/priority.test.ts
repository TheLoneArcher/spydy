import { describe, expect, it } from 'vitest';
import { canTransitionReport, isInsideServiceArea, priorityScore, similarityScore } from './priority';

describe('priority scoring', () => {
  it('weights critical reports above low reports', () => {
    expect(priorityScore('critical', 0, 0, 0, 0)).toBeGreaterThan(priorityScore('low', 0, 0, 0, 0));
  });
  it('includes votes, duplicates, and age', () => {
    expect(priorityScore('moderate', 2, 0, 1, 12)).toBe(11);
  });
});

describe('report workflow', () => {
  it('allows only legal transitions', () => {
    expect(canTransitionReport('pending', 'triaged')).toBe(true);
    expect(canTransitionReport('pending', 'closed')).toBe(false);
  });
});

describe('similarity and geography', () => {
  it('scores nearby same-category reports', () => {
    expect(similarityScore(0, true, 1)).toBeCloseTo(0.9);
  });
  it('bounds reports to the service area', () => {
    expect(isInsideServiceArea(13.6288, 79.4192)).toBe(true);
    expect(isInsideServiceArea(19.076, 72.8777)).toBe(false);
  });
});
