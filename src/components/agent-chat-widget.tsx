import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  EllipsisVerticalIcon,
  Loader2Icon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { getApiBaseUrl } from '@/config/env'
import {
  extractAssistantText,
  extractToolCallLabels,
  fetchResponsesHelp,
  postTailsAgentResponse,
} from '@/lib/agent-chat-api'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'tails_react_agent_chat_v1'
const MAX_STORED_MESSAGES = 40

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools?: string[]
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
      .slice(-MAX_STORED_MESSAGES)
  } catch {
    return []
  }
}

function saveMessages(messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)))
  } catch {
    /* quota */
  }
}

function buildApiInput(messages: ChatMessage[], pathname: string): Array<{ role: string; content: string }> {
  return messages.map((m, idx) => {
    const isLastUser = m.role === 'user' && idx === messages.length - 1
    const content = isLastUser
      ? `${m.content}\n\n—\nContext: viewing \`${pathname}\` in the Tails React UI.`
      : m.content
    return { role: m.role, content }
  })
}

export function AgentChatWidget() {
  const location = useLocation()
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages())
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const apiConfigured = Boolean(getApiBaseUrl())

  useEffect(() => {
    saveMessages(messages)
  }, [messages])

  useEffect(() => {
    if (!expanded || suggestions.length > 0) return
    void fetchResponsesHelp().then((h) => {
      if (h?.try_asking?.length) setSuggestions(h.try_asking.slice(0, 5))
    })
  }, [expanded, suggestions.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, expanded])

  useEffect(() => {
    if (expanded) {
      const t = window.setTimeout(() => textareaRef.current?.focus(), 100)
      return () => window.clearTimeout(t)
    }
  }, [expanded])

  const clearConversation = useCallback(() => {
    setMessages([])
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || !apiConfigured) return

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setLoading(true)

    try {
      const data = await postTailsAgentResponse(buildApiInput(history, location.pathname))
      const content = extractAssistantText(data) || 'No reply text returned.'
      const tools = extractToolCallLabels(data)
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          tools: tools.length ? tools : undefined,
        },
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${msg}` },
      ])
    } finally {
      setLoading(false)
    }
  }, [apiConfigured, input, loading, location.pathname, messages])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    void send()
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {expanded ? (
        <div
          className="border-border/70 bg-popover text-popover-foreground pointer-events-auto flex max-h-[min(100dvh-5rem,36rem)] w-[min(100vw-1.5rem,22rem)] flex-col overflow-hidden rounded-2xl border shadow-xl ring-1 ring-black/5 sm:w-[26rem]"
          role="dialog"
          aria-label="Tails assistant chat"
        >
          <header className="border-border/60 bg-muted/30 flex items-center gap-2 border-b px-3 py-2.5 pr-2">
            <span className="bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
              <SparklesIcon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-foreground truncate text-sm font-semibold tracking-tight">Tails assistant</h2>
              <p className="text-muted-foreground truncate text-[0.65rem]">Metrics &amp; reports</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 rounded-lg" aria-label="Chat menu">
                  <EllipsisVerticalIcon className="size-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-xl">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => clearConversation()}
                >
                  <Trash2Icon className="mr-2 size-3.5 opacity-80" aria-hidden />
                  Clear conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 rounded-lg"
              aria-label="Close chat"
              onClick={() => setExpanded(false)}
            >
              <XIcon className="size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {!apiConfigured ? (
              <p className="text-muted-foreground text-center text-xs">Set API URL in <code className="text-[0.65rem]">.env</code>.</p>
            ) : null}

            {apiConfigured && messages.length === 0 && !loading ? (
              <div className="space-y-3">
                <p className="text-muted-foreground text-xs">Ask in plain language.</p>
                {suggestions.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground text-[0.65rem] font-medium tracking-wide uppercase">
                      Try asking
                    </span>
                    <div className="flex flex-col gap-1">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="border-border/60 bg-muted/20 hover:bg-muted/40 text-foreground rounded-lg border px-2.5 py-2 text-left text-xs leading-snug transition-colors"
                          onClick={() => setInput(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn('flex flex-col gap-1', m.role === 'user' ? 'items-end' : 'items-start')}
                >
                  <div
                    className={cn(
                      'max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words',
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted text-foreground rounded-bl-md whitespace-pre-wrap',
                    )}
                  >
                    {m.content}
                  </div>
                  {m.role === 'assistant' && m.tools?.length ? (
                    <div className="text-muted-foreground flex flex-wrap gap-1 px-0.5 text-[0.65rem]">
                      {m.tools.map((t) => (
                        <span key={t} className="bg-muted/80 rounded-md px-1.5 py-0.5 font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {loading ? (
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  Thinking…
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          </div>

          <footer className="border-border/60 bg-muted/15 border-t p-3">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={apiConfigured ? 'Message…' : 'Configure API URL first'}
                disabled={!apiConfigured || loading}
                rows={2}
                className="min-h-[2.75rem] resize-none rounded-xl text-sm"
              />
              <Button
                type="button"
                size="icon"
                className="h-[2.75rem] w-11 shrink-0 rounded-xl"
                disabled={!apiConfigured || loading || !input.trim()}
                aria-label="Send message"
                onClick={() => void send()}
              >
                {loading ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
              </Button>
            </div>
            <p className="text-muted-foreground mt-2 text-[0.65rem] leading-snug">
              Enter to send · Shift+Enter for newline
            </p>
          </footer>
        </div>
      ) : null}

      <Button
        type="button"
        size="icon"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'pointer-events-auto size-14 shrink-0 rounded-full shadow-lg',
          expanded && 'ring-primary/40 ring-2 ring-offset-2 ring-offset-background',
        )}
        aria-expanded={expanded}
        aria-label={expanded ? 'Close AI assistant' : 'Open AI assistant'}
      >
        {expanded ? <XIcon className="size-6" /> : <SparklesIcon className="size-6" strokeWidth={1.75} aria-hidden />}
      </Button>
    </div>
  )
}
