import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { corsOptions } from "./config/cors.js";
import { checkDatabaseConnection } from "./config/database.js";
import { authRouter } from "./routes/auth.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { adminUserRouter } from "./routes/adminUser.routes.js";
import { patientPortalRouter } from "./routes/patientPortal.routes.js";
import { doctorRouter } from "./routes/doctor.routes.js";
import { pharmacistRouter } from "./routes/pharmacist.routes.js";
import { pharmacistPatientRouter } from "./routes/pharmacistPatient.routes.js";
import { patientPrescriptionsRouter } from "./routes/patientPrescriptions.routes.js";

export const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(cors(corsOptions));

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
app.use("/api/v1/admin", adminUserRouter);
app.use("/api/v1/patient", patientPortalRouter);
app.use("/api/v1/patient", patientPrescriptionsRouter);
app.use("/api/v1/doctor", doctorRouter);
app.use("/api/v1/pharmacist", pharmacistRouter);
app.use("/api/v1/pharmacist", pharmacistPatientRouter);

app.use(notFoundHandler);
app.use(errorHandler);
