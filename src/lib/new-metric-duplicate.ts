import { metricNameFromRow } from '@/lib/parse-metric-response'

/** Payload stashed in sessionStorage when duplicating a metric into the new-metric page. */
export type MetricDuplicatePrefill = {
  description: string
  defaultMetricFormat: string
  tagsCsv: string
  sourceSql: string
  sourceConnector: string
  collectionWindow: string
  /** Original name — shown as hint only; the name field stays empty. */
  sourceMetricName: string
}

const STASH_KEY = 'tails_ui_metric_duplicate_prefill'
const STASH_TTL_MS = 120_000

type StashedPayload = MetricDuplicatePrefill & { savedAt: number }

export function buildDuplicateMetricLocationState(
  metric: Record<string, unknown>,
  sourceSql: string,
): MetricDuplicatePrefill {
  const tags = Array.isArray(metric.tags) ? (metric.tags as unknown[]).map(String) : []
  return {
    description: String(metric.description ?? '').trim(),
    defaultMetricFormat: String(metric.default_metric_format ?? metric.unit ?? '').trim(),
    tagsCsv: tags.join(', '),
    sourceSql: String(sourceSql ?? '').trim(),
    sourceConnector: String(metric.source_connector ?? '').trim().toUpperCase(),
    collectionWindow: String(metric.collection_window ?? '').trim().toUpperCase(),
    sourceMetricName: metricNameFromRow(metric),
  }
}

/** Persist prefill so it survives React Strict Mode remounts (sessionStorage + delayed clear). */
export function stashMetricDuplicateForNewPage(payload: MetricDuplicatePrefill) {
  try {
    const stashed: StashedPayload = { ...payload, savedAt: Date.now() }
    sessionStorage.setItem(STASH_KEY, JSON.stringify(stashed))
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStashedMetricDuplicate(): MetricDuplicatePrefill | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as StashedPayload
    if (typeof o.savedAt !== 'number' || Date.now() - o.savedAt > STASH_TTL_MS) {
      sessionStorage.removeItem(STASH_KEY)
      return null
    }
    const { savedAt: _savedAt, ...rest } = o
    return rest
  } catch {
    try {
      sessionStorage.removeItem(STASH_KEY)
    } catch {
      /* ignore */
    }
    return null
  }
}

export function clearStashedMetricDuplicate() {
  try {
    sessionStorage.removeItem(STASH_KEY)
  } catch {
    /* ignore */
  }
}
