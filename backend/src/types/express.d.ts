import type { AuthenticatedUser } from "./auth.types.js";

declare global {
  namespace Express {
    interface Request {
      /**
       * Populated by the `authenticate` middleware after a valid access
       * token has been verified. Absent on unauthenticated requests.
       */
      user?: AuthenticatedUser;
    }
  }
}

export {};
