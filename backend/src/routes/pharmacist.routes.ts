import { Router } from "express";
import * as controller from "../controllers/pharmacist.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

export const pharmacistRouter = Router();

pharmacistRouter.use(authenticate, requireRole("PHARMACIST"));
pharmacistRouter.get("/workspace", controller.getWorkspace);
pharmacistRouter.get("/overview", controller.getOverview);
