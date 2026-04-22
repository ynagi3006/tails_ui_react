/** Single datapoint row for explorer tables (API list endpoints). */

export type DatapointDetailRow = {
  id: string
  value: number | null
  record_dttm: string
  created_at: string
  dimensions: Record<string, string>
  metadata: Record<string, string>
}

function formatJsonishValue(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}

/** Normalizes API dimensions/metadata: JSON strings, snake/camel keys, nested values → string values. */
export function parseKeyValueRecord(raw: unknown): Record<string, string> {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return {}
    try {
      return parseKeyValueRecord(JSON.parse(t) as unknown)
    } catch {
      return {}
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, formatJsonishValue(v)]),
  )
}

export function parseDatapointDetail(raw: Record<string, unknown>): DatapointDetailRow {
  const v = raw.value
  let value: number | null = null
  if (typeof v === 'number' && !Number.isNaN(v)) value = v
  else if (v != null && String(v).trim() !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) value = n
  }
  return {
    id: String(raw.id ?? ''),
    value,
    record_dttm: String(raw.record_dttm ?? raw.recordDttm ?? ''),
    created_at: String(raw.created_at ?? raw.createdAt ?? ''),
    dimensions: parseKeyValueRecord(raw.dimensions ?? raw.DIMENSIONS),
    metadata: parseKeyValueRecord(raw.metadata ?? raw.METADATA),
  }
}
