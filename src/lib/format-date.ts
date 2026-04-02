/** Format a calendar date (YYYY-MM-DD or ISO) without forcing a midnight UTC shift for date-only strings. */
export function formatDateOnly(input: string | null | undefined): string {
  if (!input) return '—'
  const s = String(input).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }
  }
  return formatDate(s)
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  let str = String(dateString).trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str) && !/Z|[+-]\d{2}:\d{2}$/.test(str)) {
    str += 'Z'
  }
  const date = new Date(str)
  if (Number.isNaN(date.getTime())) return String(dateString)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
