import type { NextFunction, Request, Response } from "express";

import * as service from "../services/adminUser.service.js";

import {
  updateUserRoleSchema,
  updateUserStatusSchema,
  updateUserProfileSchema,
  createStaffSchema,
  createPatientSchema,
  createOrganizationSchema,
  organizationIdSchema,
  updateOrganizationSchema,
  updateOrganizationStatusSchema,
  userIdSchema
} from "../validators/adminUser.validator.js";

import { AppError } from "../utils/errors.js";

export async function listUsers(
  _request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const users = await service.listUsers();

    response.status(200).json({
      success: true,
      data: {
        users
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserDetails(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = userIdSchema.parse(request.params.userId);
    const details = await service.getUserDetails(userId);
    response.status(200).json({ success: true, data: details });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    }
    const userId = userIdSchema.parse(request.params.userId);
    const input = updateUserProfileSchema.parse(request.body);
    const details = await service.updateProfile(userId, input, request.user.id, {
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null
    });
    response.status(200).json({ success: true, data: details });
  } catch (error) {
    next(error);
  }
}

export async function listOrganizations(
  _request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizations = await service.listOrganizations();

    response.status(200).json({
      success: true,
      data: {
        organizations
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function listRoles(
  _request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const roles = await service.listRoles();

    response.status(200).json({
      success: true,
      data: {
        roles
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateRole(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    }

    const userId = userIdSchema.parse(request.params.userId);

    const input = updateUserRoleSchema.parse(request.body);

    await service.changeUserRole(userId, input.role, request.user.id, {
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null
    });

    response.status(200).json({
      success: true,
      data: {
        message: "User role updated successfully."
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStatus(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const userId = userIdSchema.parse(request.params.userId);
    const input = updateUserStatusSchema.parse(request.body);
    await service.changeUserStatus(userId, input.status, request.user.id, {
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null
    });
    response
      .status(200)
      .json({ success: true, data: { message: "User status updated successfully." } });
  } catch (error) {
    next(error);
  }
}

export async function unlockUser(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const userId = userIdSchema.parse(request.params.userId);
    await service.unlockUser(userId, request.user.id, {
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null
    });
    response.status(200).json({ success: true, data: { message: "User unlocked successfully." } });
  } catch (error) {
    next(error);
  }
}

export async function createStaff(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const input = createStaffSchema.parse(request.body);
    const userId = await service.createStaff(input, request.user.id, {
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null
    });
    response.status(201).json({ success: true, data: { userId } });
  } catch (error) {
    next(error);
  }
}

export async function listManagedOrganizations(
  _request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizations = await service.listManagedOrganizations();
    response.status(200).json({ success: true, data: { organizations } });
  } catch (error) {
    next(error);
  }
}

export async function createOrganization(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const input = createOrganizationSchema.parse(request.body);
    const organizationId = await service.createOrganization(input, request.user.id, {
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null
    });
    response.status(201).json({ success: true, data: { organizationId } });
  } catch (error) {
    next(error);
  }
}

export async function updateOrganization(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const organizationId = organizationIdSchema.parse(request.params.organizationId);
    const input = updateOrganizationSchema.parse(request.body);
    const organization = await service.updateOrganization(organizationId, input, request.user.id, {
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null
    });
    response.status(200).json({ success: true, data: { organization } });
  } catch (error) {
    next(error);
  }
}

export async function updateOrganizationStatus(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const organizationId = organizationIdSchema.parse(request.params.organizationId);
    const { status } = updateOrganizationStatusSchema.parse(request.body);
    const organization = await service.changeOrganizationStatus(
      organizationId,
      status,
      request.user.id,
      {
        ipAddress: request.ip ?? null,
        userAgent: request.get("user-agent") ?? null
      }
    );
    response.status(200).json({ success: true, data: { organization } });
  } catch (error) {
    next(error);
  }
}

export async function createPatient(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const input = createPatientSchema.parse(request.body);
    const userId = await service.createPatient(input, request.user.id, {
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null
    });
    response.status(201).json({ success: true, data: { userId } });
  } catch (error) {
    next(error);
  }
}
