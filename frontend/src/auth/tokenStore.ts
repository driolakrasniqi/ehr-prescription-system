/**
 * The access token lives only in this module-level variable — never
 * in localStorage/sessionStorage. It is intentionally lost on a full
 * page reload; AuthContext re-establishes it on mount via the
 * HttpOnly refresh cookie (see AuthContext's bootstrap effect).
 *
 * This is a plain module rather than React state so that both
 * AuthContext (a React component) and the Axios client (a plain
 * module, outside the component tree) can read/write the same
 * value without prop-drilling or circular imports.
 */

type AuthExpiredListener = () => void;

let accessToken: string | null = null;
let authExpiredListener: AuthExpiredListener | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * AuthContext registers exactly one listener here on mount. The
 * Axios response interceptor calls `notifyAuthExpired` when a 401
 * survives a refresh attempt, so AuthContext can clear its user
 * state — which in turn makes ProtectedRoute redirect to /login.
 */
export function onAuthExpired(listener: AuthExpiredListener): void {
  authExpiredListener = listener;
}

export function notifyAuthExpired(): void {
  accessToken = null;
  authExpiredListener?.();
}
