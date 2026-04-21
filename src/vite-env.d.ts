/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TAILS_API_URL?: string
  /** Origin of the Jinja `tails_ui` (no trailing slash) for deep links to /report/:id and /metric/:versionId */
  readonly VITE_TAILS_CLASSIC_UI_ORIGIN?: string
  /** Custom auth server issuer (must match access token ``iss``), e.g. ``https://org.okta.com/oauth2/aus...`` */
  readonly VITE_OKTA_ISSUER?: string
  /** SPA application client id from Okta (public). */
  readonly VITE_OKTA_CLIENT_ID?: string
  /** Optional; defaults to ``${window.location.origin}/login/callback``. Must match an Okta sign-in redirect URI. */
  readonly VITE_OKTA_REDIRECT_URI?: string
  /** Optional; defaults to ``openid profile email groups``. Add scopes your API expects (e.g. custom API scopes). */
  readonly VITE_OKTA_SCOPES?: string
  /** Optional post-logout redirect; defaults to app origin. */
  readonly VITE_OKTA_POST_LOGOUT_REDIRECT_URI?: string
  /**
   * When ``true`` / ``1`` / ``yes`` / ``on``, Okta is not loaded and route guards are off (use with API
   * ``TAILS_AUTH_MODE=off`` or ``dev_headers`` for local work).
   */
  readonly VITE_TAILS_AUTH_DISABLED?: string
  /** With ``VITE_TAILS_AUTH_DISABLED`` + ``dev_headers`` API: Dynamo user id if email is not set. */
  readonly VITE_DEV_TAILS_USER_ID?: string
  /** With ``VITE_TAILS_AUTH_DISABLED`` + ``dev_headers`` API: email only (API resolves user id). */
  readonly VITE_DEV_TAILS_PROFILE_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
