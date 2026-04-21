import { getApiBaseUrl } from '@/config/env'
import { getApiAuthHeaders } from '@/lib/api-auth-headers'

function apiV1Base(): string {
  const root = getApiBaseUrl()
  if (!root) {
    throw new Error('Set VITE_TAILS_API_URL in .env (API origin, no trailing slash).')
  }
  return `${root}/api/v1`
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const data = JSON.parse(text) as { detail?: unknown }
    if (data?.detail != null) {
      return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    }
  } catch {
    /* not JSON */
  }
  return text || `${res.status} ${res.statusText}`
}

/** GET/POST JSON to Tails API with Okta Bearer when signed in. */
export async function apiFetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${apiV1Base()}${path.startsWith('/') ? path : `/${path}`}`
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  const auth = await getApiAuthHeaders()
  for (const [k, v] of Object.entries(auth)) {
    if (!headers.has(k)) headers.set(k, v)
  }
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(url, { ...init, headers })
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    throw new Error(await readErrorMessage(res))
  }
  return res.json() as Promise<T>
}

export function getClassicUiReportUrl(reportId: string): string | null {
  const origin = (import.meta.env.VITE_TAILS_CLASSIC_UI_ORIGIN || '').replace(/\/$/, '')
  if (!origin) return null
  return `${origin}/report/${encodeURIComponent(reportId)}`
}

export function getClassicUiMetricUrl(metricVersionId: string): string | null {
  const origin = (import.meta.env.VITE_TAILS_CLASSIC_UI_ORIGIN || '').replace(/\/$/, '')
  if (!origin) return null
  return `${origin}/metric/${encodeURIComponent(metricVersionId)}`
}

export function getClassicUiMetricsPageUrl(): string | null {
  const origin = (import.meta.env.VITE_TAILS_CLASSIC_UI_ORIGIN || '').replace(/\/$/, '')
  if (!origin) return null
  return `${origin}/metrics`
}

export function getClassicUiExploreUrl(): string | null {
  const origin = (import.meta.env.VITE_TAILS_CLASSIC_UI_ORIGIN || '').replace(/\/$/, '')
  if (!origin) return null
  return `${origin}/explore`
}
