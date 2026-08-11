import { isAxiosError } from "axios";
import { apiClient } from "../api/client";
import type { AuthenticatedUser } from "./types";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResponseData {
  accessToken: string;
  user: AuthenticatedUser;
}

interface MeResponseData {
  user: AuthenticatedUser;
}

export async function loginRequest(credentials: LoginCredentials): Promise<LoginResponseData> {
  const response = await apiClient.post<ApiSuccess<LoginResponseData>>("/auth/login", credentials);
  return response.data.data;
}

export async function logoutRequest(): Promise<void> {
  await apiClient.post<ApiSuccess<null>>("/auth/logout");
}

export async function fetchCurrentUser(): Promise<AuthenticatedUser> {
  const response = await apiClient.get<ApiSuccess<MeResponseData>>("/auth/me");
  return response.data.data.user;
}

/**
 * Extracts the backend's { error: { message } } out of a failed
 * request, falling back to a generic message for network errors or
 * unexpected shapes.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;

    if (body?.error?.message) {
      return body.error.message;
    }
  }

  return fallback;
}
