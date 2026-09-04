import type { CorsOptions } from "cors";
import { env } from "./env.js";

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return isLocalHost && (url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  if (origin === env.FRONTEND_URL) {
    return true;
  }

  return env.NODE_ENV !== "production" && isLocalDevOrigin(origin);
}

export const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  }
};
