import { Router } from "express";
import * as controller from "../controllers/patientPortal.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

export const patientPortalRouter = Router();

patientPortalRouter.use(authenticate, requireRole("PATIENT"));
patientPortalRouter.get("/dashboard", controller.getDashboard);
patientPortalRouter.get("/profile", controller.getProfile);
patientPortalRouter.patch("/profile", controller.updateProfile);
