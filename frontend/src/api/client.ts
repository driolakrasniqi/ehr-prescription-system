import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getAccessToken, notifyAuthExpired, setAccessToken } from "../auth/tokenStore";

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

// Attach the in-memory access token to every outgoing request.
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }

  return config;
});

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface RefreshResponseBody {
  success: true;
  data: { accessToken: string };
}

// De-dupes concurrent 401s into a single in-flight refresh call
// instead of firing one refresh request per failed request.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      // A bare axios call, not apiClient — this must never go
      // through the response interceptor below, or a failed refresh
      // would recurse into itself. The refresh token itself is an
      // HttpOnly cookie; it is never read or sent by JavaScript.
      .post<RefreshResponseBody>(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((response) => response.data.data.accessToken)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const isUnauthorized = error.response?.status === 401;
    const alreadyRetried = originalRequest?._retry === true;

    if (!isUnauthorized || !originalRequest || alreadyRetried) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const newAccessToken = await refreshAccessToken();

    if (!newAccessToken) {
      // Refresh token is missing, expired, or revoked — the session
      // cannot be recovered. Clear auth state; ProtectedRoute will
      // redirect to /login on the next render.
      notifyAuthExpired();
      return Promise.reject(error);
    }

    setAccessToken(newAccessToken);
    originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);

    return apiClient(originalRequest);
  }
);
