export type MetricsMentionTrigger =
  | { kind: 'none' }
  | { kind: 'hint'; anchorStart: number }
  | { kind: 'search'; anchorStart: number; query: string }

/** Match classic ``tails_ui`` chat: ``@metrics`` or ``@metrics <keyword>`` before the cursor. */
export function detectMetricsMentionTrigger(text: string, cursor: number): MetricsMentionTrigger {
  const prefix = text.slice(0, cursor)
  const withQuery = prefix.match(/@metrics\s+(\S+)$/i)
  if (withQuery && withQuery.index !== undefined) {
    return { kind: 'search', anchorStart: withQuery.index, query: withQuery[1] }
  }
  const bare = prefix.match(/@metrics$/i)
  if (bare && bare.index !== undefined) {
    return { kind: 'hint', anchorStart: bare.index }
  }
  return { kind: 'none' }
}
