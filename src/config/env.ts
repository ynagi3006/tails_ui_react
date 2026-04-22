/** Base URL of the Tails API (no trailing slash). Set `VITE_TAILS_API_URL` in `.env`. */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_TAILS_API_URL
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/\/$/, '')
  }
  return ''
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0'])

/**
 * Web Okta stores the access token in an http-only cookie on the API host. With ``SameSite=Lax``,
 * browsers treat ``localhost`` and ``127.0.0.1`` as different sites, so ``fetch`` from a UI on one
 * loopback host to an API URL on the other often omits the cookie → ``/auth/okta/session`` returns 401.
 */
export function warnWebOktaLoopbackHostnameMismatchInDev(): void {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined') return
  if (!isWebOktaAuth()) return
  const base = getApiBaseUrl()
  if (!base) return
  let apiHost: string
  try {
    apiHost = new URL(base).hostname.toLowerCase()
  } catch {
    return
  }
  const pageHost = (window.location.hostname || '').toLowerCase()
  if (!LOOPBACK_HOSTNAMES.has(apiHost) || !LOOPBACK_HOSTNAMES.has(pageHost)) return
  if (apiHost === pageHost) return
  console.warn(
    `[tails] Web Okta: page hostname "${pageHost}" ≠ API hostname "${apiHost}" in VITE_TAILS_API_URL. ` +
      'Use the same loopback name as the UI (e.g. both `localhost` or both `127.0.0.1`) so the session cookie is sent on fetch.',
  )
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

/**
 * Use server-side Okta **Web** (confidential) OAuth: no ``client_secret`` in the bundle; the API exchanges
 * the code and sets an http-only session cookie. Requires ``VITE_TAILS_API_URL`` and matching server env.
 */
export function isWebOktaAuth(): boolean {
  const v = trimEnv('VITE_TAILS_USE_WEB_OKTA').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/** True when the browser should enable Okta sign-in (SPA: issuer + client id; Web: flag + API base URL). */
export function isOktaBrowserConfigured(): boolean {
  if (isWebOktaAuth()) {
    return Boolean(getApiBaseUrl())
  }
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

/** Must match auto-provision / IAM default group on the API (``TAILS_OKTA_AUTO_PROVISION_PERMISSION_GROUP``). */
export function getDefaultPermissionGroupName(): string {
  const v = trimEnv('VITE_TAILS_DEFAULT_PERMISSION_GROUP')
  return v || 'default'
}

/** Must match ``TAILS_ADMIN_PERMISSION_GROUP`` on the API. */
export function getAdminPermissionGroupName(): string {
  const v = trimEnv('VITE_TAILS_ADMIN_PERMISSION_GROUP')
  return v || 'admin'
}
