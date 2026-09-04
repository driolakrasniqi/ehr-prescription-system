import * as repository from "../repositories/pharmacist.repository.js";
import { AppError } from "../utils/errors.js";

async function requirePharmacist(
  userId: number
): Promise<[repository.PharmacistContextRow, ...repository.PharmacistContextRow[]]> {
  const contexts = await repository.getPharmacistContexts(userId);
  if (!contexts.length) {
    throw new AppError(403, "FORBIDDEN", "An active pharmacy assignment is required.");
  }
  return contexts as [repository.PharmacistContextRow, ...repository.PharmacistContextRow[]];
}

export async function getWorkspace(userId: number) {
  const contexts = await requirePharmacist(userId);
  return {
    pharmacist: {
      practitionerId: contexts[0].practitionerId,
      firstName: contexts[0].firstName,
      lastName: contexts[0].lastName
    },
    organizations: contexts.map(({ organizationId, organizationName }) => ({
      id: organizationId,
      name: organizationName
    }))
  };
}

export async function getOverview(userId: number) {
  const contexts = await requirePharmacist(userId);
  const pharmacist = contexts[0];
  const overview = await repository.getPharmacistOverview();
  return {
    profile: {
      firstName: pharmacist.firstName,
      lastName: pharmacist.lastName,
      licenseNumber: pharmacist.licenseNumber,
      phone: pharmacist.phone,
      practitionerNumber: pharmacist.practitionerNumber,
      pharmacies: contexts.map((item) => item.organizationName)
    },
    ...overview
  };
}
