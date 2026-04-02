/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TAILS_API_URL?: string
  /** Origin of the Jinja `tails_ui` (no trailing slash) for deep links to /report/:id and /metric/:versionId */
  readonly VITE_TAILS_CLASSIC_UI_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
