import { loader } from '@monaco-editor/react'

/** Same Monaco build as classic `tails_ui` report builder (cdnjs 0.52.2). */
const MONACO_VS_PATH = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs'

let configured = false

export function configureMonacoLoader(): void {
  if (configured) return
  configured = true
  loader.config({ paths: { vs: MONACO_VS_PATH } })
}
