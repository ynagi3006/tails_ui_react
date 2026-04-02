/** Normalize metric JSON from GET /metrics/{id} or list rows (handles name / metric_name alias). */
export function metricIdFromRow(r: Record<string, unknown>): string {
  return String(r.id ?? r.metric_id ?? '')
}

export function metricNameFromRow(r: Record<string, unknown>): string {
  return String(r.metric_name ?? r.name ?? '')
}

export function metricVersionIdFromRow(r: Record<string, unknown>): string {
  return String(r.metric_version_id ?? '')
}
