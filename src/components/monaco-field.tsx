import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { configureMonacoLoader } from '@/lib/monaco-loader'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

configureMonacoLoader()

type Props = {
  value: string
  onChange?: (value: string) => void
  language: 'html' | 'sql'
  readOnly?: boolean
  className?: string
  /** Show a floating copy control (current editor text). */
  showCopyButton?: boolean
}

/** Monaco Editor (same CDN loader as Report Builder / classic UI). */
export function MonacoField({
  value,
  onChange,
  language,
  readOnly,
  className,
  showCopyButton,
}: Props) {
  const { resolved } = useTheme()
  const monacoTheme = resolved === 'dark' ? 'vs-dark' : 'light'
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [value])

  return (
    <div
      className={cn(
        'border-border/70 bg-background relative h-[min(48vh,520px)] min-h-[240px] w-full overflow-hidden rounded-xl border',
        className,
      )}
    >
      {showCopyButton ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="border-border/60 bg-background/90 absolute top-2 right-2 z-10 size-8 rounded-lg shadow-sm backdrop-blur-sm"
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
          title={copied ? 'Copied' : 'Copy'}
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        </Button>
      ) : null}
      <Editor
        height="100%"
        width="100%"
        language={language}
        theme={monacoTheme}
        value={value}
        onChange={(v) => onChange?.(v ?? '')}
        options={{
          readOnly,
          minimap: { enabled: false },
          lineNumbers: 'on',
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineHeight: 20,
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true,
          padding: { top: 10, bottom: 10 },
        }}
      />
    </div>
  )
}
