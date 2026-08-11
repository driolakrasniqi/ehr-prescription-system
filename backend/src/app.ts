import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { checkDatabaseConnection } from "./config/database.js";
import { authRouter } from "./routes/auth.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

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

// Unversioned: infrastructure/ops endpoint, not part of the business API.
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

app.use("/api/v1/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);
