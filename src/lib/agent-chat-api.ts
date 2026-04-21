import { apiFetchJson } from '@/lib/api'

/** Client model id (server uses configured LiteLLM model for the actual call). */
const DEFAULT_RESPONSES_MODEL = 'gpt-4o'

export type ResponsesHelpPayload = {
  title?: string
  intro?: string
  try_asking?: string[]
}

export async function postTailsAgentResponse(
  input: Array<{ role: string; content: string }>,
): Promise<unknown> {
  const model =
    (import.meta.env.VITE_TAILS_RESPONSES_MODEL as string | undefined)?.trim() || DEFAULT_RESPONSES_MODEL
  return apiFetchJson<unknown>('/responses', {
    method: 'POST',
    body: JSON.stringify({ model, input }),
  })
}

/** Dedicated Jinja2 template builder (Report Builder AI tab); same payload shape as ``postTailsAgentResponse``. */
export async function postJinjaBuilderAgentResponse(
  input: Array<{ role: string; content: string }>,
): Promise<unknown> {
  const model =
    (import.meta.env.VITE_TAILS_RESPONSES_MODEL as string | undefined)?.trim() || DEFAULT_RESPONSES_MODEL
  return apiFetchJson<unknown>('/responses/jinja-builder', {
    method: 'POST',
    body: JSON.stringify({ model, input }),
  })
}

export async function fetchResponsesHelp(): Promise<ResponsesHelpPayload | null> {
  try {
    return await apiFetchJson<ResponsesHelpPayload>('/responses/help')
  } catch {
    return null
  }
}

/** First fenced code block from assistant text (for applying Jinja/HTML to the editor). */
export function extractFirstFencedCode(text: string): string | null {
  const labeled = /```(?:html|jinja2?|htm|xml)?\s*\n?([\s\S]*?)```/i.exec(text)
  if (labeled?.[1]) return labeled[1].trim()
  const generic = /```\s*\n?([\s\S]*?)```/.exec(text)
  if (generic?.[1]) return generic[1].trim()
  return null
}

/** Remove the first markdown fenced block (same fence rules as ``extractFirstFencedCode``). */
export function stripFirstFencedCode(text: string): string {
  const labeled = /```(?:html|jinja2?|htm|xml)?\s*\n?[\s\S]*?```/i.exec(text)
  if (labeled?.[0]) {
    return (text.slice(0, labeled.index) + text.slice(labeled.index + labeled[0].length))
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  const generic = /```\s*\n?[\s\S]*?```/.exec(text)
  if (generic?.[0]) {
    return (text.slice(0, generic.index) + text.slice(generic.index + generic[0].length))
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  return text.trim()
}

/** Parse assistant-visible text from POST /responses JSON (OpenAI-style output array). */

export function extractAssistantText(data: unknown): string {
  const parts: string[] = []
  const d = data as {
    output?: Array<{
      type?: string
      content?: Array<{ type?: string; text?: string }>
    }>
  }
  const outputItems = Array.isArray(d?.output) ? d.output : []

  for (const item of outputItems) {
    if (!item || item.type !== 'message') continue
    const contentItems = Array.isArray(item.content) ? item.content : []
    for (const content of contentItems) {
      if (content && typeof content.text === 'string' && content.text.trim()) {
        parts.push(content.text)
      }
    }
  }

  if (!parts.length) {
    const fallback = d?.output?.[0]?.content?.[0]?.text
    if (typeof fallback === 'string' && fallback.trim()) return fallback.trim()
  }

  return parts.join('\n\n').trim()
}

export type MetricAnalysisPayload = {
  metric_name: string
  value: string
  record_dttm?: string
  cell_text?: string
  column_header?: string
  row_context?: string
  report_name?: string
  detailed?: boolean
  /** Column dates from the report table, used to infer cadence (daily/weekly). */
  column_dates?: string[]
  /** The metric's values from the row in the report, keyed by date. */
  row_values?: Array<{ date: string; value: string }>
}

export async function postMetricAnalysis(payload: MetricAnalysisPayload): Promise<unknown> {
  return apiFetchJson<unknown>('/responses/metric-analysis', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export type ReportAnalysisPayload = {
  report_id: string
  report_name?: string
  rendered_html?: string
  edition_id?: string
  report_version_id?: string
  metrics_used?: string[]
  force_refresh?: boolean
}

export async function postReportAnalysis(payload: ReportAnalysisPayload): Promise<unknown> {
  return apiFetchJson<unknown>('/responses/report-analysis', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function extractToolCallLabels(data: unknown): string[] {
  const labels: string[] = []
  const d = data as {
    output?: Array<{
      type?: string
      name?: string
      function?: { name?: string }
      content?: Array<{ type?: string; name?: string }>
    }>
  }
  const items = Array.isArray(d?.output) ? d.output : []
  for (const item of items) {
    if (!item) continue
    if (item.type === 'function_call' || item.type === 'tool_use') {
      labels.push(item.name || item.function?.name || 'tool')
    }
    if (Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === 'tool_use' && c.name) labels.push(c.name)
      }
    }
  }
  return [...new Set(labels)]
}
