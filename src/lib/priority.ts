export type ReportSeverity = 'critical' | 'moderate' | 'low';

const severityWeight: Record<ReportSeverity, number> = { critical: 3, moderate: 2, low: 1 };

export function priorityScore(severity: string, urgentVotes: number, notUrgentVotes: number, duplicateCount: number, ageHours: number) {
  const weight = severityWeight[severity as ReportSeverity] ?? severityWeight.low;
  return weight * 3 + urgentVotes - notUrgentVotes + duplicateCount * 2 + ageHours / 12;
}

export function canTransitionReport(from: string, to: string) {
  return new Set(['pending:triaged', 'triaged:assigned', 'assigned:in_progress', 'in_progress:resolved_pending_confirmation', 'resolved_pending_confirmation:closed', 'disputed:reopened', 'reopened:assigned']).has(`${from}:${to}`);
}

export function similarityScore(distanceMeters: number, sameCategory: boolean, titleSimilarity: number) {
  const distanceScore = Math.max(0, 1 - distanceMeters / 75);
  return 0.5 * distanceScore + 0.2 * Number(sameCategory) + 0.2 * Math.max(0, Math.min(1, titleSimilarity));
}

export function isInsideServiceArea(lat: number, lon: number) {
  return lat >= 13.55 && lat <= 13.72 && lon >= 79.33 && lon <= 79.58;
}
