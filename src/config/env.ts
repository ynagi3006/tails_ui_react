/** Base URL of the Tails API (no trailing slash). Set `VITE_TAILS_API_URL` in `.env`. */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_TAILS_API_URL
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/\/$/, '')
  }
  return ''
}
