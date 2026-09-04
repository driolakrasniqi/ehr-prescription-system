import { Router } from "express";
import * as controller from "../controllers/doctor.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

export const doctorRouter = Router();

doctorRouter.use(authenticate, requireRole("DOCTOR"));
doctorRouter.get("/workspace", controller.getWorkspace);
doctorRouter.get("/overview", controller.getOverview);
doctorRouter.get("/visits", controller.listVisits);
doctorRouter.get("/patients", controller.listPatients);
doctorRouter.get("/patients/:patientId", controller.getPatient);
doctorRouter.post("/encounters", controller.createEncounter);
doctorRouter.patch("/encounters/:encounterId", controller.updateEncounter);
doctorRouter.delete("/encounters/:encounterId", controller.deleteEncounter);
doctorRouter.post("/conditions", controller.createCondition);
doctorRouter.patch("/conditions/:conditionId", controller.updateCondition);
doctorRouter.delete("/conditions/:conditionId", controller.deleteCondition);
doctorRouter.post("/allergies", controller.createAllergy);
doctorRouter.patch("/allergies/:allergyId", controller.updateAllergy);
doctorRouter.delete("/allergies/:allergyId", controller.deleteAllergy);
doctorRouter.post("/prescriptions", controller.createPrescription);
doctorRouter.patch("/prescriptions/:prescriptionId", controller.updatePrescription);
doctorRouter.delete("/prescriptions/:prescriptionId", controller.deletePrescriptionRecord);
