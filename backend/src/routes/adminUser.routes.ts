import { Router } from "express";

import * as controller from "../controllers/adminUser.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

export const adminUserRouter = Router();

adminUserRouter.use(
  authenticate,
  requireRole("ADMIN")
);

// Directory and reference data
adminUserRouter.get(
  "/users",
  controller.listUsers
);

adminUserRouter.get(
  "/roles",
  controller.listRoles
);

adminUserRouter.get(
  "/organizations",
  controller.listOrganizations
);

adminUserRouter.get(
  "/organizations/manage",
  controller.listManagedOrganizations
);

adminUserRouter.post(
  "/organizations",
  controller.createOrganization
);

adminUserRouter.patch(
  "/organizations/:organizationId",
  controller.updateOrganization
);

adminUserRouter.patch(
  "/organizations/:organizationId/status",
  controller.updateOrganizationStatus
);

// Individual user details and profile editing
adminUserRouter.get(
  "/users/:userId",
  controller.getUserDetails
);

adminUserRouter.patch(
  "/users/:userId/profile",
  controller.updateProfile
);

// Security and access management
adminUserRouter.patch(
  "/users/:userId/role",
  controller.updateRole
);

adminUserRouter.patch(
  "/users/:userId/status",
  controller.updateStatus
);

adminUserRouter.post(
  "/users/:userId/unlock",
  controller.unlockUser
);

// Staff creation
adminUserRouter.post(
  "/staff",
  controller.createStaff
);

adminUserRouter.post(
  "/patients",
  controller.createPatient
);
