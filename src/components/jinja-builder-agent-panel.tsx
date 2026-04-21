import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, CopyIcon, Loader2Icon, SendIcon, SparklesIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ChatTextareaWithMetricsMentions } from '@/components/chat-textarea-with-metrics-mentions'
import {
  extractAssistantText,
  extractFirstFencedCode,
  extractToolCallLabels,
  postJinjaBuilderAgentResponse,
  stripFirstFencedCode,
} from '@/lib/agent-chat-api'
import { parseBlocks, renderInlineMarkdown } from '@/lib/markdown-render'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

const STORAGE_KEY = 'tails_jinja_builder_chat_v1'
const MAX_STORED = 60

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools?: string[]
}

function ChatMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  const rendered: ReactNode[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    switch (b.type) {
      case 'heading':
        rendered.push(
          <p key={i} className="mt-2 font-semibold first:mt-0">
            {b.text}
          </p>,
        )
        break
      case 'hr':
        rendered.push(<hr key={i} className="my-1.5 border-foreground/10" />)
        break
      case 'bullets':
        rendered.push(
          <ul key={i} className="my-1 list-disc space-y-0.5 pl-4">
            {b.items.map((item, j) => (
              <li key={j}>{renderInlineMarkdown(item)}</li>
            ))}
          </ul>,
        )
        break
      case 'numbered':
        rendered.push(
          <ol key={i} className="my-1 list-decimal space-y-0.5 pl-4">
            {b.items.map((item, j) => (
              <li key={j}>{renderInlineMarkdown(item)}</li>
            ))}
          </ol>,
        )
        break
      case 'paragraph':
        rendered.push(
          <p key={i} className="my-1 first:mt-0 last:mb-0">
            {renderInlineMarkdown(b.text)}
          </p>,
        )
        break
    }
  }
  return <div className="space-y-0.5 text-sm">{rendered}</div>
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (x): x is ChatMessage =>
          x != null &&
          typeof x === 'object' &&
          typeof (x as ChatMessage).id === 'string' &&
          ((x as ChatMessage).role === 'user' || (x as ChatMessage).role === 'assistant') &&
          typeof (x as ChatMessage).content === 'string',
      )
      .slice(-MAX_STORED)
  } catch {
    return []
  }
}

function saveMessages(messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)))
  } catch {
    /* quota */
  }
}

function formatChatForCopy(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const role = m.role === 'user' ? 'You' : 'Builder'
      let block = `${role}:\n${m.content}`
      if (m.tools?.length) {
        block += `\nTools: ${m.tools.join(', ')}`
      }
      return block
    })
    .join('\n\n---\n\n')
}

type Props = {
  /** Current editor draft — appended as context on each send (not stored in visible message). */
  templateDraft: string
  onApplyToEditor: (html: string) => void
  /** Extra classes on the root (e.g. ``min-h-0 h-full`` when inside a CSS grid). */
  className?: string
  /** When set, shows a control to collapse the panel (parent hides this column). */
  onCollapse?: () => void
}

export function JinjaBuilderAgentPanel({ templateDraft, onApplyToEditor, className, onCollapse }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages())
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedChat, setCopiedChat] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const copiedTimerRef = useRef<number | null>(null)

  useEffect(() => {
    saveMessages(messages)
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current)
      }
    }
  }, [])

  const copyChat = useCallback(async () => {
    const text = formatChatForCopy(messages)
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedChat(true)
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current)
      }
      copiedTimerRef.current = window.setTimeout(() => {
        copiedTimerRef.current = null
        setCopiedChat(false)
      }, 2000)
    } catch {
      /* clipboard denied */
    }
  }, [messages])

  const clearChat = useCallback(() => {
    setMessages([])
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const send = useCallback(async () => {
    const trimmed = draft.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    }
    const history: ChatMessage[] = [...messages, userMsg]
    setDraft('')
    setMessages(history)
    setLoading(true)
    const tpl = templateDraft.trim()
    const contextNote =
      tpl.length > 0
        ? `\n\n—\nCurrent template in the editor (${tpl.length} chars):\n\`\`\`\n${tpl.slice(0, 120_000)}${tpl.length > 120_000 ? '\n…(truncated)' : ''}\n\`\`\``
        : ''
    const input = history.map((m, idx) => {
      const isLast = idx === history.length - 1 && m.role === 'user'
      return {
        role: m.role,
        content: isLast ? `${m.content}${contextNote}` : m.content,
      }
    })

    try {
      const data = await postJinjaBuilderAgentResponse(input)
      const text = extractAssistantText(data) || 'No reply text returned.'
      const tools = extractToolCallLabels(data)
      const fenced = extractFirstFencedCode(text)
      let chatContent = text
      if (fenced) {
        onApplyToEditor(fenced)
        chatContent = stripFirstFencedCode(text)
        if (!chatContent.trim()) {
          chatContent =
            'Template was applied to the Jinja editor. Use **Render** in the header to refresh the preview.'
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: chatContent,
          tools: tools.length ? tools : undefined,
        },
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `**Error:** ${msg}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }, [draft, loading, messages, onApplyToEditor, templateDraft])

  return (
    <div
      className={cn(
        'border-border/70 flex h-full max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm',
        className,
      )}
    >
      <div className="border-border/60 bg-muted/25 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold tracking-tight">AI Jinja builder</h2>
        <div className="flex flex-wrap items-center gap-2">
          {onCollapse ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-8 shrink-0 rounded-lg"
              aria-label="Collapse AI builder"
              onClick={onCollapse}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={messages.length === 0}
            onClick={() => void copyChat()}
          >
            <CopyIcon className="mr-1 size-3.5" />
            {copiedChat ? 'Copied' : 'Copy chat'}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={clearChat}>
            <Trash2Icon className="mr-1 size-3.5" />
            Clear chat
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4">
        {messages.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12 text-center text-sm">
            <SparklesIcon className="size-8 opacity-40" />
            <p className="max-w-md">
              Ask for templates in a markdown code block; the block is copied into the editor automatically. Your
              current draft is still sent as hidden context each time.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'rounded-xl px-3 py-2',
                m.role === 'user' ? 'bg-muted/60 ml-6' : 'bg-background border-border/60 mr-4 border',
              )}
            >
              <p className="text-muted-foreground mb-1 text-[0.65rem] font-medium uppercase">
                {m.role === 'user' ? 'You' : 'Builder'}
              </p>
              {m.role === 'assistant' ? (
                <ChatMarkdown text={m.content} />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              )}
              {m.tools?.length ? (
                <p className="text-muted-foreground mt-1 text-[0.65rem]">Tools: {m.tools.join(', ')}</p>
              ) : null}
            </div>
          ))
        )}
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Thinking…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="border-border/60 bg-muted/10 shrink-0 space-y-2 border-t p-3">
        <ChatTextareaWithMetricsMentions
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Weekly table for @metrics shipped … (⌘/Ctrl+Enter to send)"
          className="min-h-[88px] max-h-48 resize-y rounded-xl text-sm"
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={loading || !draft.trim()} onClick={() => void send()}>
            {loading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <>
                <SendIcon className="mr-1.5 size-3.5" />
                Send
              </>
            )}
          </Button>
        </div>
        <p className="text-muted-foreground text-[0.65rem]">
          ⌘/Ctrl + Enter to send · @metrics + keyword (↑↓ Space, Insert) like the main assistant
        </p>
      </div>
    </div>
  )
}
