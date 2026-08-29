import * as repository from "../repositories/patientPortal.repository.js";
import { AppError } from "../utils/errors.js";

export async function getDashboard(userId: number) {
  const dashboard = await repository.getPatientDashboard(userId);
  if (!dashboard) {
    throw new AppError(404, "NOT_FOUND", "Patient profile not found for this account.");
  }
  return dashboard;
}
