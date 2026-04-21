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
 * In dev, warn when issuer looks like a bare org URL. Okta token/authorize endpoints are tied to an
 * authorization server (`/oauth2/default` or `/oauth2/aus…`); a wrong issuer often yields
 * ``Client authentication failed`` at the token step even when ``/authorize`` seemed to work.
 */
export function warnOktaIssuerShapeInDev(): void {
  if (!import.meta.env.DEV) return
  const issuer = trimEnv('VITE_OKTA_ISSUER')
  if (!issuer) return
  if (issuer.toLowerCase().includes('/oauth2')) return
  console.warn(
    '[tails] VITE_OKTA_ISSUER has no `/oauth2/...` path. Use your authorization server issuer, e.g. ' +
      '`https://YOUR.okta.com/oauth2/default` or `https://YOUR.okta.com/oauth2/ausxxxxxxxx` (from Okta Admin → ' +
      'Security → API → Authorization servers). A bare org URL often breaks the token exchange.',
  )
}

/**
 * OAuth redirect URI for PKCE (must match Okta app Sign-in redirect URIs exactly).
 * Default when unset: ``${origin}/login/callback``. Set ``VITE_OKTA_REDIRECT_URI`` to override
 * (e.g. another port or ``http://127.0.0.1:5173/login/callback``). Trailing slashes and path matter.
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
