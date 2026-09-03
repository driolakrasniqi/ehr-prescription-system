import { Router } from "express";
import * as controller from "../controllers/doctor.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

export const doctorRouter = Router();

doctorRouter.use(authenticate, requireRole("DOCTOR"));
doctorRouter.get("/workspace", controller.getWorkspace);
doctorRouter.get("/patients", controller.listPatients);
doctorRouter.get("/patients/:patientId", controller.getPatient);
doctorRouter.post("/encounters", controller.createEncounter);
doctorRouter.post("/conditions", controller.createCondition);
doctorRouter.post("/allergies", controller.createAllergy);
doctorRouter.post("/prescriptions", controller.createPrescription);
