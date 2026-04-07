import type { ReactNode } from 'react'

export function renderInlineMarkdown(raw: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/
  let remaining = raw
  let key = 0
  while (remaining) {
    const match = re.exec(remaining)
    if (!match) {
      nodes.push(remaining)
      break
    }
    if (match.index > 0) nodes.push(remaining.slice(0, match.index))
    const [full, , boldItalic, bold, italic, code] = match
    if (boldItalic)
      nodes.push(<strong key={key} className="font-semibold"><em>{boldItalic}</em></strong>)
    else if (bold)
      nodes.push(<strong key={key} className="font-semibold">{bold}</strong>)
    else if (italic)
      nodes.push(<em key={key}>{italic}</em>)
    else if (code)
      nodes.push(<code key={key} className="rounded bg-black/5 dark:bg-white/10 px-1 py-0.5 font-mono text-xs">{code}</code>)
    key++
    remaining = remaining.slice(match.index + full.length)
  }
  return nodes
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'hr' }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'paragraph'; text: string }

export function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = []
  const paragraphs = raw.split(/\n{2,}/)

  for (const p of paragraphs) {
    const trimmed = p.trim()
    if (!trimmed) continue

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ type: 'hr' })
      continue
    }

    const hashHeading = /^(#{1,3})\s+(.+)/.exec(trimmed.split('\n')[0])
    if (hashHeading) {
      const level = Math.min(hashHeading[1].length, 3) as 1 | 2 | 3
      blocks.push({ type: 'heading', level, text: hashHeading[2].replace(/\*\*/g, '').trim() })
      const afterHeading = trimmed.slice(trimmed.indexOf('\n') + 1).trim()
      if (afterHeading && trimmed.includes('\n')) {
        blocks.push(...parseBlocks(afterHeading))
      }
      continue
    }

    const boldOnly = /^\*\*(.+?)\*\*\s*$/.exec(trimmed)
    if (boldOnly && !trimmed.includes('\n')) {
      blocks.push({ type: 'heading', level: 2, text: boldOnly[1] })
      continue
    }

    const lines = trimmed.split('\n')
    const nonEmpty = lines.filter((l) => l.trim())

    const allBullets = nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*[-*•]\s/.test(l))
    if (allBullets) {
      blocks.push({ type: 'bullets', items: nonEmpty.map((l) => l.replace(/^\s*[-*•]\s*/, '')) })
      continue
    }

    const allNumbered = nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*\d+[.)]\s/.test(l))
    if (allNumbered) {
      blocks.push({ type: 'numbered', items: nonEmpty.map((l) => l.replace(/^\s*\d+[.)]\s*/, '')) })
      continue
    }

    if (lines.length > 1) {
      const first = lines[0]
      const rest = lines.slice(1)
      const firstIsBoldHeader = /^\*\*(.+?)\*\*\s*$/.test(first.trim())

      if (firstIsBoldHeader) {
        const headerText = /^\*\*(.+?)\*\*/.exec(first.trim())![1]
        const restNonEmpty = rest.filter((l) => l.trim())
        const restAreBullets = restNonEmpty.length > 0 && restNonEmpty.every((l) => /^\s*[-*•]\s/.test(l))

        blocks.push({ type: 'heading', level: 2, text: headerText })
        if (restAreBullets) {
          blocks.push({
            type: 'bullets',
            items: restNonEmpty.map((l) => l.replace(/^\s*[-*•]\s*/, '')),
          })
        } else {
          blocks.push({ type: 'paragraph', text: rest.join('\n').trim() })
        }
        continue
      }
    }

    blocks.push({ type: 'paragraph', text: trimmed })
  }
  return blocks
}
