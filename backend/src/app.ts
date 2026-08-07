import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { checkDatabaseConnection } from "./config/database.js";

export const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get("/api/health", async (_request, response, next) => {
  try {
    const database = await checkDatabaseConnection();

    response.status(200).json({
      success: true,
      message: "EHR API is running.",
      database
    });
  } catch (error) {
    next(error);
  }
});

app.use((_request, response) => {
  response.status(404).json({
    success: false,
    message: "Endpoint not found."
  });
});

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction
  ) => {
    console.error(error);

    response.status(500).json({
      success: false,
      message: "An internal server error occurred."
    });
  }
);