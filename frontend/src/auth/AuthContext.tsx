import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { fetchCurrentUser, loginRequest, logoutRequest, type LoginCredentials } from "./authApi";
import { onAuthExpired, setAccessToken } from "./tokenStore";
import type { AuthenticatedUser } from "./types";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuthentication: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  // True until the initial session-restore attempt (see bootstrap
  // effect below) has finished, so ProtectedRoute can show a loading
  // state instead of bouncing straight to /login on page load.
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Re-validates the current session against the backend. Relies on
  // the Axios interceptor to silently refresh the access token via
  // the HttpOnly cookie if it is missing or expired.
  const refreshAuthentication = useCallback(async () => {
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    // Single app-wide listener: fires when the Axios refresh
    // interceptor exhausts its refresh attempt (invalid/expired/
    // revoked refresh token), so local state stays in sync.
    onAuthExpired(() => {
      setUser(null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      try {
        const currentUser = await fetchCurrentUser();

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const result = await loginRequest(credentials);
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      // Always clear local state, even if the request itself failed
      // (e.g. session already invalid server-side) — logout must be
      // safe to call unconditionally.
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      refreshAuthentication
    }),
    [user, isLoading, login, logout, refreshAuthentication]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The provider and its companion hook intentionally share this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
