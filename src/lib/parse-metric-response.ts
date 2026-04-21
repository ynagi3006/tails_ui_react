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

/** Parse JSON body from ``GET /metrics`` list endpoints (array or empty). */
export function parseMetricsList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  return []
}
