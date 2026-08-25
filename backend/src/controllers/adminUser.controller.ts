import type {
  NextFunction,
  Request,
  Response
} from "express";

import * as service
  from "../services/adminUser.service.js";

import {
  updateUserRoleSchema,
  updateUserStatusSchema,
  createStaffSchema,
  userIdSchema
} from "../validators/adminUser.validator.js";

import {
  AppError
} from "../utils/errors.js";

export async function listUsers(
  _request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const users =
      await service.listUsers();

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

export async function listRoles(
  _request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const roles =
      await service.listRoles();

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
      throw new AppError(
        401,
        "UNAUTHENTICATED",
        "Authentication is required."
      );
    }

    const userId =
      userIdSchema.parse(
        request.params.userId
      );

    const input =
      updateUserRoleSchema.parse(
        request.body
      );

    await service.changeUserRole(
      userId,
      input.role,
      request.user.id,
      { ipAddress: request.ip ?? null, userAgent: request.get("user-agent") ?? null }
    );

    response.status(200).json({
      success: true,
      data: {
        message:
          "User role updated successfully."
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStatus(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const userId = userIdSchema.parse(request.params.userId);
    const input = updateUserStatusSchema.parse(request.body);
    await service.changeUserStatus(userId, input.status, request.user.id, { ipAddress: request.ip ?? null, userAgent: request.get("user-agent") ?? null });
    response.status(200).json({ success: true, data: { message: "User status updated successfully." } });
  } catch (error) { next(error); }
}

export async function unlockUser(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const userId = userIdSchema.parse(request.params.userId);
    await service.unlockUser(userId, request.user.id, { ipAddress: request.ip ?? null, userAgent: request.get("user-agent") ?? null });
    response.status(200).json({ success: true, data: { message: "User unlocked successfully." } });
  } catch (error) { next(error); }
}

export async function createStaff(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    const input = createStaffSchema.parse(request.body);
    const userId = await service.createStaff(input, request.user.id, { ipAddress: request.ip ?? null, userAgent: request.get("user-agent") ?? null });
    response.status(201).json({ success: true, data: { userId } });
  } catch (error) { next(error); }
}
