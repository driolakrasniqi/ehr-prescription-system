import {
  Router
} from "express";

import * as controller
  from "../controllers/adminUser.controller.js";

import {
  authenticate
} from "../middleware/authenticate.js";

import {
  requireRole
} from "../middleware/requireRole.js";

export const adminUserRouter =
  Router();

adminUserRouter.use(
  authenticate,
  requireRole("ADMIN")
);

adminUserRouter.get(
  "/users",
  controller.listUsers
);

adminUserRouter.get(
  "/roles",
  controller.listRoles
);

adminUserRouter.patch(
  "/users/:userId/role",
  controller.updateRole
);

adminUserRouter.patch("/users/:userId/status", controller.updateStatus);
adminUserRouter.post("/users/:userId/unlock", controller.unlockUser);
adminUserRouter.post("/staff", controller.createStaff);
