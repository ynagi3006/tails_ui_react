/** One FastAPI validation issue (422 ``detail`` array item). */
export type FastApiIssue = { loc?: unknown[]; msg?: string }

export function parseFastApiIssuesFromErrorMessage(message: string): FastApiIssue[] {
  const trimmed = message.trim()
  if (!trimmed) return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed as FastApiIssue[]
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { detail?: unknown }).detail)) {
      return (parsed as { detail: FastApiIssue[] }).detail
    }
  } catch {
    /* plain string or non-JSON */
  }
  return []
}

/** Last path segment after ``body`` when present, else last segment (e.g. ``source_sql``). */
export function bodyFieldKeyFromLoc(loc: unknown[] | undefined): string | null {
  if (!Array.isArray(loc) || loc.length === 0) return null
  const parts = loc.map((x) => String(x))
  const bodyIdx = parts.findIndex((p) => p.toLowerCase() === 'body')
  if (bodyIdx >= 0 && parts[bodyIdx + 1] != null) {
    return parts[bodyIdx + 1]
  }
  return parts[parts.length - 1] ?? null
}

/** Merge messages by first body field key in each issue's ``loc``. */
export function issuesByBodyField(issues: FastApiIssue[]): Record<string, string> {
  const acc: Record<string, string> = {}
  for (const issue of issues) {
    const key = bodyFieldKeyFromLoc(issue.loc)
    if (!key) continue
    const msg = (typeof issue.msg === 'string' ? issue.msg : 'Invalid').trim()
    if (!msg) continue
    acc[key] = acc[key] ? `${acc[key]} ${msg}` : msg
  }
  return acc
}
