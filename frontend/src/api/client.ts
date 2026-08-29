import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig
} from "axios";

import {
  getAccessToken,
  notifyAuthExpired,
  setAccessToken
} from "../auth/tokenStore";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  "http://localhost:5000/api/v1";

export const apiClient =
  axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true
  });

const refreshClient =
  axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true
  });

apiClient.interceptors.request.use(
  (
    config:
      InternalAxiosRequestConfig
  ) => {
    const token = getAccessToken();

    if (token) {
      config.headers.set(
        "Authorization",
        `Bearer ${token}`
      );
    }

    return config;
  }
);

interface RetriableRequestConfig
  extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface RefreshResponseBody {
  success: true;

  data: {
    accessToken: string;
  };
}

let refreshPromise:
  Promise<string | null> | null =
  null;

function isAuthenticationRequest(
  url: string | undefined
): boolean {
  if (!url) {
    return false;
  }

  return (
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/auth/refresh")
  );
}

async function requestNewAccessToken():
Promise<string | null> {
  try {
    const response =
      await refreshClient.post<
        RefreshResponseBody
      >(
        "/auth/refresh",
        {}
      );

    return response
      .data
      .data
      .accessToken;
  } catch {
    return null;
  }
}

function refreshAccessToken():
Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise =
      requestNewAccessToken()
        .finally(() => {
          refreshPromise = null;
        });
  }

  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest =
      error.config as
        | RetriableRequestConfig
        | undefined;

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      isAuthenticationRequest(
        originalRequest.url
      )
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const newAccessToken =
      await refreshAccessToken();

    if (!newAccessToken) {
      setAccessToken(null);
      notifyAuthExpired();

      return Promise.reject(error);
    }

    setAccessToken(newAccessToken);

    originalRequest.headers.set(
      "Authorization",
      `Bearer ${newAccessToken}`
    );

    return apiClient(originalRequest);
  }
);