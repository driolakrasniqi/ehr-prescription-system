import { Router } from "express";
import * as controller from "../controllers/pharmacistPatient.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

export const patientPrescriptionsRouter = Router();

patientPrescriptionsRouter.use(authenticate, requireRole("PATIENT"));
patientPrescriptionsRouter.get("/prescriptions", controller.getOwnPrescriptionRecord);
