import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ThemeProvider } from '@/components/theme-provider'

import './index.css'
import App from './App.tsx'

/** Force tab icon to Tails PNG (avoids SVG priority quirks and stale /vite.svg cache from older builds). */
{
  const base = import.meta.env.BASE_URL || '/'
  const png = `${base.endsWith('/') ? base : `${base}/`}tails-logo.png?v=3`
  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((el) => el.remove())
  for (const rel of ['icon', 'shortcut icon'] as const) {
    const link = document.createElement('link')
    link.rel = rel
    link.type = 'image/png'
    link.href = png
    document.head.appendChild(link)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
