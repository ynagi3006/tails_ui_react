/** Match legacy tails_ui search: plain text or `#tag1,tag2` for tag-only filter. */
export function parseSearchInput(rawValue: string): { search: string; tags: string[] } {
  const value = String(rawValue || '').trim()
  if (!value) return { search: '', tags: [] }
  if (value.startsWith('#')) {
    const tags = value
      .slice(1)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
    return { search: '', tags }
  }
  return { search: value, tags: [] }
}
