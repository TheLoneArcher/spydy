import type { ReportSeverity } from './status';

const severityWeight: Record<ReportSeverity, number> = {
  critical: 3,
  moderate: 2,
  low: 1,
};

export function priorityScore(
  severity: string,
  urgentVotes: number,
  notUrgentVotes: number,
  duplicateCount: number,
  ageHours: number
): number {
  const weight = severityWeight[severity as ReportSeverity] ?? severityWeight.low;
  return weight * 3 + urgentVotes - notUrgentVotes + duplicateCount * 2 + ageHours / 12;
}
