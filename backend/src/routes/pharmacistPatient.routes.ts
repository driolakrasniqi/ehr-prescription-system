import { Router } from "express";
import * as controller from "../controllers/pharmacistPatient.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

export const pharmacistPatientRouter = Router();

pharmacistPatientRouter.use(authenticate, requireRole("PHARMACIST"));
pharmacistPatientRouter.get("/patients", controller.listPatients);
pharmacistPatientRouter.get("/patients/:patientId", controller.getPatientRecord);
