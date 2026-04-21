/** Base URL of the Tails API (no trailing slash). Set `VITE_TAILS_API_URL` in `.env`. */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_TAILS_API_URL
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/\/$/, '')
  }
  return ''
}

function trimEnv(key: keyof ImportMetaEnv): string {
  const v = import.meta.env[key]
  return typeof v === 'string' ? v.trim() : ''
}

/** ``true`` / ``1`` / ``yes`` / ``on`` → skip Okta client, route guards, and OIDC UI (local workaround). */
export function isUiAuthDisabled(): boolean {
  const v = trimEnv('VITE_TAILS_AUTH_DISABLED').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/** True when SPA should enable Okta sign-in (issuer + client id). */
export function isOktaBrowserConfigured(): boolean {
  return Boolean(trimEnv('VITE_OKTA_ISSUER') && trimEnv('VITE_OKTA_CLIENT_ID'))
}

/**
 * OAuth redirect URI for PKCE (must match Okta app Sign-in redirect URIs exactly).
 * If ``VITE_OKTA_REDIRECT_URI`` is set, it is used as-is after trim (including a trailing ``/`` on the root).
 * Otherwise defaults to ``${origin}/login/callback``.
 */
export function getOktaRedirectUri(): string {
  const custom = trimEnv('VITE_OKTA_REDIRECT_URI')
  if (custom) return custom
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/login/callback`
  }
  return ''
}

/** Default scopes; override with ``VITE_OKTA_SCOPES`` (space- or comma-separated). Add API scopes your auth server exposes. */
export function getOktaScopesList(): string[] {
  const raw = trimEnv('VITE_OKTA_SCOPES')
  const fallback = 'openid profile email groups'
  const s = raw || fallback
  return s.split(/[\s,]+/).filter(Boolean)
}
