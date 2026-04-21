import { isUiAuthDisabled } from '@/config/env'

/** Dispatched after Okta login / logout / token renewal so hooks can refetch principal. */
export const TAILS_AUTH_CHANGED_EVENT = 'tails-auth-changed'

type OktaAccessTokenGetter = () => Promise<string | undefined>

let oktaAccessTokenGetter: OktaAccessTokenGetter | null = null

/** Registered by ``OktaAuthProvider`` when Okta env is configured. */
export function registerOktaAccessTokenGetter(getter: OktaAccessTokenGetter | null): void {
  oktaAccessTokenGetter = getter
}

export function emitAuthChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(TAILS_AUTH_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

/**
 * When ``VITE_TAILS_AUTH_DISABLED`` is set, send dev-headers for ``TAILS_AUTH_MODE=dev_headers``.
 * Prefer ``VITE_DEV_TAILS_PROFILE_EMAIL`` only; the API resolves the Dynamo user id from email.
 * If only ``VITE_DEV_TAILS_USER_ID`` is set (no email), send id headers as a fallback.
 * Use ``TAILS_AUTH_MODE=off`` on the API if you do not need a Dynamo-backed principal.
 */
function devHeadersWhenUiAuthDisabled(): Record<string, string> {
  if (!isUiAuthDisabled()) return {}
  const email = (import.meta.env.VITE_DEV_TAILS_PROFILE_EMAIL || '').trim()
  if (email) {
    return {
      'Tails-Profile-Email': email,
      'X-Tails-Email': email,
    }
  }
  const uid = (import.meta.env.VITE_DEV_TAILS_USER_ID || '').trim()
  if (uid) {
    return {
      'Tails-User-Id': uid,
      'X-Tails-Sub': uid,
    }
  }
  return {}
}

/** Headers for Tails API calls (Okta Bearer when signed in; dev headers when UI auth is disabled). */
export async function getApiAuthHeaders(): Promise<Record<string, string>> {
  const dev = devHeadersWhenUiAuthDisabled()
  const token = oktaAccessTokenGetter ? await oktaAccessTokenGetter() : undefined
  if (token) {
    const h: Record<string, string> = { ...dev }
    h.Authorization = `Bearer ${token}`
    return h
  }
  return dev
}
