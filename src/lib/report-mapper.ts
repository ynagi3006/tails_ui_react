import { formatDate, formatDateOnly } from '@/lib/format-date'

export type ReportCardModel = {
  id: string
  title: string
  description: string
  statusLabel: string
  subtitle: string
  created_at: string | null
  latestEditionCommonDate: string | null
  latestEditionCreatedAt: string | null
}

export function normalizeReportStatus(raw: unknown): string {
  const cleaned = String(raw ?? '').trim()
  if (!cleaned) return 'Unknown'
  return cleaned
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export function mapApiReportToCard(row: Record<string, unknown>): ReportCardModel {
  const id = String(row.id ?? row.report_id ?? row.reportId ?? '')
  const title = String(row.report_name ?? row.title ?? 'Untitled report')
  const description = String(row.description ?? row.summary ?? '')
  const statusLabel = normalizeReportStatus(
    row.status ?? row.report_status ?? row.lifecycle_status ?? row.publication_status,
  )
  const latestEditionCommonDate =
    (row.latest_edition_common_date as string | null | undefined) ??
    (row.latestEditionCommonDate as string | null | undefined) ??
    null
  const latestEditionCreatedAt =
    (row.latest_edition_created_at as string | null | undefined) ??
    (row.latestEditionCreatedAt as string | null | undefined) ??
    null
  const subtitle =
    latestEditionCommonDate || latestEditionCreatedAt
      ? `Edition ${latestEditionCommonDate ? formatDateOnly(String(latestEditionCommonDate)) : '—'} · uploaded ${latestEditionCreatedAt ? formatDate(String(latestEditionCreatedAt)) : '—'}`
      : 'No saved edition yet'
  const created_at = (row.created_at as string | null | undefined) ?? null
  return {
    id,
    title,
    description,
    statusLabel,
    subtitle,
    created_at,
    latestEditionCommonDate: latestEditionCommonDate ? String(latestEditionCommonDate) : null,
    latestEditionCreatedAt: latestEditionCreatedAt ? String(latestEditionCreatedAt) : null,
  }
}

export function parseReportsResponse(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (data && typeof data === 'object' && 'items' in data && Array.isArray((data as { items: unknown }).items)) {
    return (data as { items: Record<string, unknown>[] }).items
  }
  return []
}
