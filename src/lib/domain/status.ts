export const REPORT_STATUSES = [
  'pending',
  'triaged',
  'assigned',
  'in_progress',
  'resolved_pending_confirmation',
  'closed',
  'reopened',
  'rejected',
  'duplicate',
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const TASK_STATUSES = [
  'assigned',
  'accepted',
  'en_route',
  'on_site',
  'in_progress',
  'completed',
  'blocked',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pending Triage',
  triaged: 'Community Triaged',
  assigned: 'Assigned to Volunteer',
  in_progress: 'Field Work in Progress',
  resolved_pending_confirmation: 'Awaiting Citizen Confirmation',
  closed: 'Resolved & Closed',
  reopened: 'Reopened by Citizen',
  rejected: 'Rejected',
  duplicate: 'Duplicate Report',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  en_route: 'En Route',
  on_site: 'On Site',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

export const CIVIC_CATEGORIES = [
  'pothole',
  'streetlight',
  'garbage',
  'water_leak',
  'other',
] as const;

export type CivicCategory = (typeof CIVIC_CATEGORIES)[number];

export const CIVIC_CATEGORY_LABELS: Record<CivicCategory, string> = {
  pothole: 'Pothole & Pavement',
  streetlight: 'Streetlight Outage',
  garbage: 'Overflowing Waste',
  water_leak: 'Water Pipeline Leak',
  other: 'Other Civic Hazard',
};

export const REPORT_SEVERITIES = ['low', 'moderate', 'critical'] as const;
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

export const REPORT_SEVERITY_LABELS: Record<ReportSeverity, string> = {
  low: 'Low',
  moderate: 'Moderate',
  critical: 'Critical',
};

/**
 * Valid transitions for report statuses
 */
export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  const allowed = new Set([
    'pending:triaged',
    'pending:assigned',
    'pending:rejected',
    'pending:duplicate',
    'triaged:assigned',
    'triaged:rejected',
    'triaged:duplicate',
    'assigned:in_progress',
    'in_progress:resolved_pending_confirmation',
    'resolved_pending_confirmation:closed',
    'resolved_pending_confirmation:reopened',
    'reopened:assigned',
    'reopened:in_progress',
    'reopened:closed',
  ]);
  return allowed.has(`${from}:${to}`);
}

/**
 * Valid transitions for volunteer task execution
 */
export function canTransitionTask(from: TaskStatus, to: TaskStatus, isStaff = false): boolean {
  if (isStaff) return true;
  const volunteerAllowed = new Set([
    'assigned:accepted',
    'assigned:blocked',
    'accepted:en_route',
    'accepted:blocked',
    'en_route:on_site',
    'en_route:blocked',
    'on_site:in_progress',
    'on_site:blocked',
    'in_progress:completed',
    'in_progress:blocked',
    'blocked:accepted',
    'blocked:in_progress',
  ]);
  return volunteerAllowed.has(`${from}:${to}`);
}
