import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { databasePool } from "../config/database.js";
import * as authRepository from "../repositories/auth.repository.js";
import * as adminService from "../services/adminUser.service.js";
import {
  createOrganizationSchema,
  createPatientSchema,
  createStaffSchema,
  type CreateOrganizationInput
} from "../validators/adminUser.validator.js";

const ADMIN_EMAIL = "admin@ehr.local";

const DEMO_DOCTOR_EMAIL = "demo.doctor@example.com";
const DEMO_PHARMACIST_EMAIL = "demo.pharmacist@example.com";
const DEMO_PATIENT_EMAIL = "demo.patient@example.com";

const DEMO_DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD ?? "DemoDoctor123!";

const DEMO_PHARMACIST_PASSWORD = process.env.DEMO_PHARMACIST_PASSWORD ?? "DemoPharmacist123!";

const DEMO_PATIENT_PASSWORD = process.env.DEMO_PATIENT_PASSWORD ?? "DemoPatient123!";

const seedMeta = {
  ipAddress: null,
  userAgent: "demo-seed"
};

interface OrganizationSeedRow extends RowDataPacket {
  id: number;
  organization_type: string;
  status: string;
}

interface DemoPatientRow extends RowDataPacket {
  id: number;
}

interface DemoDoctorRow extends RowDataPacket {
  id: number;
}

interface DemoEncounterRow extends RowDataPacket {
  id: number;
}

interface DemoMedicationRow extends RowDataPacket {
  id: number;
  genericName?: string;
  brandName?: string | null;
  strength?: string;
  dosageForm?: string;
}

interface MedicationSeed {
  code: string;
  generic: string;
  brand: string | null;
  ingredient: string;
  strength: string;
  form: string;
  route: string;
  atc: string;
}

const MEDICATION_CATALOG: MedicationSeed[] = [
  { code: "DEMO-PARA-500", generic: "Paracetamol", brand: null, ingredient: "Paracetamol", strength: "500 mg", form: "Tablet", route: "Oral", atc: "N02BE01" },
  { code: "MED-PARA-1000", generic: "Paracetamol", brand: null, ingredient: "Paracetamol", strength: "1000 mg", form: "Tablet", route: "Oral", atc: "N02BE01" },
  { code: "MED-IBU-400", generic: "Ibuprofen", brand: "Brufen", ingredient: "Ibuprofen", strength: "400 mg", form: "Tablet", route: "Oral", atc: "M01AE01" },
  { code: "MED-IBU-600", generic: "Ibuprofen", brand: "Brufen", ingredient: "Ibuprofen", strength: "600 mg", form: "Tablet", route: "Oral", atc: "M01AE01" },
  { code: "MED-DICLO-50", generic: "Diclofenac", brand: "Voltaren", ingredient: "Diclofenac sodium", strength: "50 mg", form: "Tablet", route: "Oral", atc: "M01AB05" },
  { code: "MED-NAPRO-500", generic: "Naproxen", brand: null, ingredient: "Naproxen", strength: "500 mg", form: "Tablet", route: "Oral", atc: "M01AE02" },
  { code: "MED-METAM-500", generic: "Metamizole", brand: "Novalgin", ingredient: "Metamizole sodium", strength: "500 mg", form: "Tablet", route: "Oral", atc: "N02BB02" },
  { code: "MED-TRAM-50", generic: "Tramadol", brand: null, ingredient: "Tramadol hydrochloride", strength: "50 mg", form: "Capsule", route: "Oral", atc: "N02AX02" },
  { code: "MED-AMOX-500", generic: "Amoxicillin", brand: null, ingredient: "Amoxicillin", strength: "500 mg", form: "Capsule", route: "Oral", atc: "J01CA04" },
  { code: "MED-AMOXCLAV-875", generic: "Amoxicillin / clavulanic acid", brand: "Augmentin", ingredient: "Amoxicillin and clavulanic acid", strength: "875 mg / 125 mg", form: "Tablet", route: "Oral", atc: "J01CR02" },
  { code: "MED-AZITH-500", generic: "Azithromycin", brand: "Sumamed", ingredient: "Azithromycin", strength: "500 mg", form: "Tablet", route: "Oral", atc: "J01FA10" },
  { code: "MED-CIPRO-500", generic: "Ciprofloxacin", brand: null, ingredient: "Ciprofloxacin", strength: "500 mg", form: "Tablet", route: "Oral", atc: "J01MA02" },
  { code: "MED-CEFAL-500", generic: "Cefalexin", brand: null, ingredient: "Cefalexin", strength: "500 mg", form: "Capsule", route: "Oral", atc: "J01DB01" },
  { code: "MED-DOXY-100", generic: "Doxycycline", brand: null, ingredient: "Doxycycline", strength: "100 mg", form: "Capsule", route: "Oral", atc: "J01AA02" },
  { code: "MED-CLARITH-500", generic: "Clarithromycin", brand: null, ingredient: "Clarithromycin", strength: "500 mg", form: "Tablet", route: "Oral", atc: "J01FA09" },
  { code: "MED-METRO-400", generic: "Metronidazole", brand: null, ingredient: "Metronidazole", strength: "400 mg", form: "Tablet", route: "Oral", atc: "J01XD01" },
  { code: "MED-CEFUR-500", generic: "Cefuroxime", brand: "Zinnat", ingredient: "Cefuroxime axetil", strength: "500 mg", form: "Tablet", route: "Oral", atc: "J01DC02" },
  { code: "MED-NITROF-100", generic: "Nitrofurantoin", brand: null, ingredient: "Nitrofurantoin", strength: "100 mg", form: "Capsule", route: "Oral", atc: "J01XE01" },
  { code: "MED-OMEP-20", generic: "Omeprazole", brand: null, ingredient: "Omeprazole", strength: "20 mg", form: "Capsule", route: "Oral", atc: "A02BC01" },
  { code: "MED-PANT-40", generic: "Pantoprazole", brand: "Controloc", ingredient: "Pantoprazole", strength: "40 mg", form: "Tablet", route: "Oral", atc: "A02BC02" },
  { code: "MED-FAMOT-20", generic: "Famotidine", brand: null, ingredient: "Famotidine", strength: "20 mg", form: "Tablet", route: "Oral", atc: "A02BA03" },
  { code: "MED-DOMP-10", generic: "Domperidone", brand: null, ingredient: "Domperidone", strength: "10 mg", form: "Tablet", route: "Oral", atc: "A03FA03" },
  { code: "MED-LOPE-2", generic: "Loperamide", brand: "Imodium", ingredient: "Loperamide hydrochloride", strength: "2 mg", form: "Capsule", route: "Oral", atc: "A07DA03" },
  { code: "MED-HYOSC-10", generic: "Hyoscine butylbromide", brand: "Buscopan", ingredient: "Hyoscine butylbromide", strength: "10 mg", form: "Tablet", route: "Oral", atc: "A03BB01" },
  { code: "MED-AMLO-5", generic: "Amlodipine", brand: "Norvasc", ingredient: "Amlodipine", strength: "5 mg", form: "Tablet", route: "Oral", atc: "C08CA01" },
  { code: "MED-AMLO-10", generic: "Amlodipine", brand: "Norvasc", ingredient: "Amlodipine", strength: "10 mg", form: "Tablet", route: "Oral", atc: "C08CA01" },
  { code: "MED-ENAL-10", generic: "Enalapril", brand: null, ingredient: "Enalapril maleate", strength: "10 mg", form: "Tablet", route: "Oral", atc: "C09AA02" },
  { code: "MED-RAMI-5", generic: "Ramipril", brand: null, ingredient: "Ramipril", strength: "5 mg", form: "Tablet", route: "Oral", atc: "C09AA05" },
  { code: "MED-LOSA-50", generic: "Losartan", brand: null, ingredient: "Losartan potassium", strength: "50 mg", form: "Tablet", route: "Oral", atc: "C09CA01" },
  { code: "MED-BISO-5", generic: "Bisoprolol", brand: "Concor", ingredient: "Bisoprolol fumarate", strength: "5 mg", form: "Tablet", route: "Oral", atc: "C07AB07" },
  { code: "MED-ATEN-50", generic: "Atenolol", brand: null, ingredient: "Atenolol", strength: "50 mg", form: "Tablet", route: "Oral", atc: "C07AB03" },
  { code: "MED-FURO-40", generic: "Furosemide", brand: "Lasix", ingredient: "Furosemide", strength: "40 mg", form: "Tablet", route: "Oral", atc: "C03CA01" },
  { code: "MED-HCTZ-25", generic: "Hydrochlorothiazide", brand: null, ingredient: "Hydrochlorothiazide", strength: "25 mg", form: "Tablet", route: "Oral", atc: "C03AA03" },
  { code: "MED-ATOR-20", generic: "Atorvastatin", brand: "Sortis", ingredient: "Atorvastatin", strength: "20 mg", form: "Tablet", route: "Oral", atc: "C10AA05" },
  { code: "MED-SIMVA-20", generic: "Simvastatin", brand: null, ingredient: "Simvastatin", strength: "20 mg", form: "Tablet", route: "Oral", atc: "C10AA01" },
  { code: "MED-ASA-100", generic: "Acetylsalicylic acid", brand: "Aspirin Cardio", ingredient: "Acetylsalicylic acid", strength: "100 mg", form: "Tablet", route: "Oral", atc: "B01AC06" },
  { code: "MED-CLOP-75", generic: "Clopidogrel", brand: "Plavix", ingredient: "Clopidogrel", strength: "75 mg", form: "Tablet", route: "Oral", atc: "B01AC04" },
  { code: "MED-METF-500", generic: "Metformin", brand: "Glucophage", ingredient: "Metformin hydrochloride", strength: "500 mg", form: "Tablet", route: "Oral", atc: "A10BA02" },
  { code: "MED-METF-850", generic: "Metformin", brand: "Glucophage", ingredient: "Metformin hydrochloride", strength: "850 mg", form: "Tablet", route: "Oral", atc: "A10BA02" },
  { code: "MED-GLIC-80", generic: "Gliclazide", brand: "Diamicron", ingredient: "Gliclazide", strength: "80 mg", form: "Tablet", route: "Oral", atc: "A10BB09" },
  { code: "MED-LEVO-50", generic: "Levothyroxine", brand: "Euthyrox", ingredient: "Levothyroxine sodium", strength: "50 mcg", form: "Tablet", route: "Oral", atc: "H03AA01" },
  { code: "MED-LEVO-100", generic: "Levothyroxine", brand: "Euthyrox", ingredient: "Levothyroxine sodium", strength: "100 mcg", form: "Tablet", route: "Oral", atc: "H03AA01" },
  { code: "MED-SALB-100", generic: "Salbutamol", brand: "Ventolin", ingredient: "Salbutamol", strength: "100 mcg", form: "Inhaler", route: "Inhalation", atc: "R03AC02" },
  { code: "MED-BUDE-200", generic: "Budesonide", brand: "Pulmicort", ingredient: "Budesonide", strength: "200 mcg", form: "Inhaler", route: "Inhalation", atc: "R03BA02" },
  { code: "MED-MONT-10", generic: "Montelukast", brand: "Singulair", ingredient: "Montelukast", strength: "10 mg", form: "Tablet", route: "Oral", atc: "R03DC03" },
  { code: "MED-CETI-10", generic: "Cetirizine", brand: "Zyrtec", ingredient: "Cetirizine dihydrochloride", strength: "10 mg", form: "Tablet", route: "Oral", atc: "R06AE07" },
  { code: "MED-LORA-10", generic: "Loratadine", brand: "Claritin", ingredient: "Loratadine", strength: "10 mg", form: "Tablet", route: "Oral", atc: "R06AX13" },
  { code: "MED-DESLO-5", generic: "Desloratadine", brand: "Aerius", ingredient: "Desloratadine", strength: "5 mg", form: "Tablet", route: "Oral", atc: "R06AX27" },
  { code: "MED-AMBRO-30", generic: "Ambroxol", brand: "Mucosolvan", ingredient: "Ambroxol hydrochloride", strength: "30 mg", form: "Tablet", route: "Oral", atc: "R05CB06" },
  { code: "MED-ACC-200", generic: "Acetylcysteine", brand: "ACC", ingredient: "Acetylcysteine", strength: "200 mg", form: "Sachet", route: "Oral", atc: "R05CB01" },
  { code: "MED-PRED-5", generic: "Prednisolone", brand: null, ingredient: "Prednisolone", strength: "5 mg", form: "Tablet", route: "Oral", atc: "H02AB06" },
  { code: "MED-DEXA-4", generic: "Dexamethasone", brand: null, ingredient: "Dexamethasone", strength: "4 mg", form: "Tablet", route: "Oral", atc: "H02AB02" },
  { code: "MED-SERT-50", generic: "Sertraline", brand: "Zoloft", ingredient: "Sertraline", strength: "50 mg", form: "Tablet", route: "Oral", atc: "N06AB06" },
  { code: "MED-FLUOX-20", generic: "Fluoxetine", brand: "Prozac", ingredient: "Fluoxetine", strength: "20 mg", form: "Capsule", route: "Oral", atc: "N06AB03" },
  { code: "MED-DIAZ-5", generic: "Diazepam", brand: "Valium", ingredient: "Diazepam", strength: "5 mg", form: "Tablet", route: "Oral", atc: "N05BA01" },
  { code: "MED-ALPRA-05", generic: "Alprazolam", brand: "Xanax", ingredient: "Alprazolam", strength: "0.5 mg", form: "Tablet", route: "Oral", atc: "N05BA12" },
  { code: "MED-PREGA-75", generic: "Pregabalin", brand: "Lyrica", ingredient: "Pregabalin", strength: "75 mg", form: "Capsule", route: "Oral", atc: "N03AX16" },
  { code: "MED-GABA-300", generic: "Gabapentin", brand: null, ingredient: "Gabapentin", strength: "300 mg", form: "Capsule", route: "Oral", atc: "N03AX12" },
  { code: "MED-CARBA-200", generic: "Carbamazepine", brand: "Tegretol", ingredient: "Carbamazepine", strength: "200 mg", form: "Tablet", route: "Oral", atc: "N03AF01" },
  { code: "MED-ALLOP-100", generic: "Allopurinol", brand: "Zyloric", ingredient: "Allopurinol", strength: "100 mg", form: "Tablet", route: "Oral", atc: "M04AA01" },
  { code: "MED-TAMS-04", generic: "Tamsulosin", brand: "Omnic", ingredient: "Tamsulosin hydrochloride", strength: "0.4 mg", form: "Capsule", route: "Oral", atc: "G04CA02" },
  { code: "MED-FOLIC-5", generic: "Folic acid", brand: null, ingredient: "Folic acid", strength: "5 mg", form: "Tablet", route: "Oral", atc: "B03BB01" },
  { code: "MED-FERRO-80", generic: "Ferrous sulfate", brand: null, ingredient: "Ferrous sulfate", strength: "80 mg", form: "Tablet", route: "Oral", atc: "B03AA07" },
  { code: "MED-VITD-1000", generic: "Cholecalciferol", brand: "Vitamin D3", ingredient: "Cholecalciferol", strength: "1000 IU", form: "Capsule", route: "Oral", atc: "A11CC05" },
  { code: "MED-OSMO-300", generic: "Lactulose", brand: "Duphalac", ingredient: "Lactulose", strength: "670 mg/ml", form: "Syrup", route: "Oral", atc: "A06AD11" },
  { code: "MED-ONDAN-8", generic: "Ondansetron", brand: null, ingredient: "Ondansetron", strength: "8 mg", form: "Tablet", route: "Oral", atc: "A04AA01" },
  { code: "MED-WARF-5", generic: "Warfarin", brand: null, ingredient: "Warfarin sodium", strength: "5 mg", form: "Tablet", route: "Oral", atc: "B01AA03" },
  { code: "MED-ENOX-40", generic: "Enoxaparin", brand: "Clexane", ingredient: "Enoxaparin sodium", strength: "40 mg / 0.4 ml", form: "Injection", route: "Subcutaneous", atc: "B01AB05" },
  { code: "MED-INSGL-100", generic: "Insulin glargine", brand: "Lantus", ingredient: "Insulin glargine", strength: "100 IU/ml", form: "Injection", route: "Subcutaneous", atc: "A10AE04" },
  { code: "MED-AMLOX-500", generic: "Amoxicillin", brand: null, ingredient: "Amoxicillin", strength: "250 mg / 5 ml", form: "Suspension", route: "Oral", atc: "J01CA04" },
  { code: "MED-IBUSYR-100", generic: "Ibuprofen", brand: "Nurofen", ingredient: "Ibuprofen", strength: "100 mg / 5 ml", form: "Suspension", route: "Oral", atc: "M01AE01" },
  { code: "MED-XYLO-01", generic: "Xylometazoline", brand: "Otrivin", ingredient: "Xylometazoline hydrochloride", strength: "0.1%", form: "Nasal spray", route: "Nasal", atc: "R01AA07" },
  { code: "MED-CHLOR-5", generic: "Chloramphenicol", brand: null, ingredient: "Chloramphenicol", strength: "0.5%", form: "Eye drops", route: "Ophthalmic", atc: "S01AA01" },
  { code: "MED-DEXAEYE", generic: "Dexamethasone", brand: "Maxidex", ingredient: "Dexamethasone", strength: "0.1%", form: "Eye drops", route: "Ophthalmic", atc: "S01BA01" },
  { code: "MED-CLOTRI-1", generic: "Clotrimazole", brand: "Canesten", ingredient: "Clotrimazole", strength: "1%", form: "Cream", route: "Topical", atc: "D01AC01" },
  { code: "MED-HYDRO-1", generic: "Hydrocortisone", brand: null, ingredient: "Hydrocortisone", strength: "1%", form: "Cream", route: "Topical", atc: "D07AA02" },
  { code: "MED-KETO-200", generic: "Ketoconazole", brand: "Nizoral", ingredient: "Ketoconazole", strength: "200 mg", form: "Tablet", route: "Oral", atc: "J02AB02" },
  { code: "MED-FLUCO-150", generic: "Fluconazole", brand: "Diflucan", ingredient: "Fluconazole", strength: "150 mg", form: "Capsule", route: "Oral", atc: "J02AC01" },
  { code: "MED-ACYC-400", generic: "Aciclovir", brand: "Zovirax", ingredient: "Aciclovir", strength: "400 mg", form: "Tablet", route: "Oral", atc: "J05AB01" },
  { code: "MED-OSLT-75", generic: "Oseltamivir", brand: "Tamiflu", ingredient: "Oseltamivir", strength: "75 mg", form: "Capsule", route: "Oral", atc: "J05AH02" }
];

async function ensureMedications(): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const item of MEDICATION_CATALOG) {
    const [rows] = await databasePool.query<DemoMedicationRow[]>(
      `SELECT id FROM medications WHERE medication_code = ? LIMIT 1`,
      [item.code]
    );
    if (rows[0]) {
      skipped += 1;
      continue;
    }
    await databasePool.query(
      `INSERT INTO medications
        (medication_code, generic_name, brand_name, active_ingredient_text,
         strength, dosage_form, default_route, atc_code, prescription_only, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)`,
      [
        item.code,
        item.generic,
        item.brand,
        item.ingredient,
        item.strength,
        item.form,
        item.route,
        item.atc
      ]
    );
    created += 1;
  }

  console.log(`Medications: ${created} created, ${skipped} already present (${MEDICATION_CATALOG.length} total).`);
}

async function ensureOrganization(
  input: CreateOrganizationInput,
  adminUserId: number
): Promise<number> {
  const [rows] = await databasePool.query<OrganizationSeedRow[]>(
    `
        SELECT
          id,
          organization_type,
          status
        FROM organizations
        WHERE organization_code = ?
        LIMIT 1
      `,
    [input.organizationCode]
  );

  const existing = rows[0];

  if (existing) {
    if (existing.organization_type !== input.organizationType || existing.status !== "ACTIVE") {
      throw new Error(
        `Organization '${input.organizationCode}' already exists, but its type or status does not match the demo configuration.`
      );
    }

    console.log(`Skipped organization (already exists): ${input.name}`);

    return existing.id;
  }

  const organizationId = await adminService.createOrganization(input, adminUserId, seedMeta);

  console.log(`Created organization: ${input.name}`);

  return organizationId;
}

async function ensureDoctor(adminUserId: number, clinicId: number): Promise<boolean> {
  const existing = await authRepository.findUserByEmail(DEMO_DOCTOR_EMAIL);

  if (existing) {
    if (existing.role_code !== "DOCTOR") {
      throw new Error(
        `${DEMO_DOCTOR_EMAIL} already exists with role ${existing.role_code}, not DOCTOR.`
      );
    }

    console.log(`Skipped doctor (already exists): ${DEMO_DOCTOR_EMAIL}`);

    return false;
  }

  const input = createStaffSchema.parse({
    email: DEMO_DOCTOR_EMAIL,
    password: DEMO_DOCTOR_PASSWORD,
    firstName: "Elira",
    lastName: "Berisha",
    role: "DOCTOR",
    licenseNumber: "DEMO-DOC-LIC-001",
    specialty: "General Medicine",
    phone: "+38344111001",
    organizationId: clinicId,
    positionTitle: "General Practitioner"
  });

  await adminService.createStaff(input, adminUserId, seedMeta);

  console.log(`Created doctor: ${DEMO_DOCTOR_EMAIL}`);

  return true;
}

async function ensurePharmacist(adminUserId: number, pharmacyId: number): Promise<boolean> {
  const existing = await authRepository.findUserByEmail(DEMO_PHARMACIST_EMAIL);

  if (existing) {
    if (existing.role_code !== "PHARMACIST") {
      throw new Error(
        `${DEMO_PHARMACIST_EMAIL} already exists with role ${existing.role_code}, not PHARMACIST.`
      );
    }

    console.log(`Skipped pharmacist (already exists): ${DEMO_PHARMACIST_EMAIL}`);

    return false;
  }

  const input = createStaffSchema.parse({
    email: DEMO_PHARMACIST_EMAIL,
    password: DEMO_PHARMACIST_PASSWORD,
    firstName: "Arben",
    lastName: "Krasniqi",
    role: "PHARMACIST",
    licenseNumber: "DEMO-PHARM-LIC-001",
    specialty: "Community Pharmacy",
    phone: "+38344111002",
    organizationId: pharmacyId,
    positionTitle: "Pharmacist"
  });

  await adminService.createStaff(input, adminUserId, seedMeta);

  console.log(`Created pharmacist: ${DEMO_PHARMACIST_EMAIL}`);

  return true;
}

async function ensurePatient(adminUserId: number): Promise<boolean> {
  const existing = await authRepository.findUserByEmail(DEMO_PATIENT_EMAIL);

  if (existing) {
    if (existing.role_code !== "PATIENT") {
      throw new Error(
        `${DEMO_PATIENT_EMAIL} already exists with role ${existing.role_code}, not PATIENT.`
      );
    }

    console.log(`Skipped patient (already exists): ${DEMO_PATIENT_EMAIL}`);

    return false;
  }

  const input = createPatientSchema.parse({
    email: DEMO_PATIENT_EMAIL,
    password: DEMO_PATIENT_PASSWORD,
    firstName: "Mira",
    lastName: "Gashi",
    dateOfBirth: "1992-05-14",
    sex: "FEMALE",
    bloodType: "A+",
    maritalStatus: "SINGLE",
    smokingStatus: "NEVER",
    occupation: "Teacher",
    phone: "+38344111003",
    addressLine1: "Demo Street 10",
    addressLine2: "",
    city: "Prishtina",
    postalCode: "10000",
    countryCode: "XK"
  });

  await adminService.createPatient(input, adminUserId, seedMeta);

  console.log(`Created patient: ${DEMO_PATIENT_EMAIL}`);

  return true;
}

async function ensureDemoEncounter(clinicId: number): Promise<number> {
  const encounterNumber = "DEMO-ENC-001";

  const [existingRows] = await databasePool.query<DemoEncounterRow[]>(
    `SELECT id
         FROM encounters
        WHERE encounter_number = ?
        LIMIT 1`,
    [encounterNumber]
  );

  const existingEncounter = existingRows[0];

  if (existingEncounter) {
    console.log(`Skipped encounter (already exists): ${encounterNumber}`);

    return existingEncounter.id;
  }

  const [patientRows] = await databasePool.query<DemoPatientRow[]>(
    `SELECT p.id
         FROM patients p
         JOIN users u
           ON u.id = p.user_id
        WHERE u.email = ?
          AND p.status = 'ACTIVE'
        LIMIT 1`,
    [DEMO_PATIENT_EMAIL]
  );

  const patient = patientRows[0];

  if (!patient) {
    throw new Error(`The demo patient profile for '${DEMO_PATIENT_EMAIL}' was not found.`);
  }

  const [doctorRows] = await databasePool.query<DemoDoctorRow[]>(
    `SELECT p.id
         FROM practitioners p
         JOIN users u
           ON u.id = p.user_id
        WHERE u.email = ?
          AND p.is_active = TRUE
        LIMIT 1`,
    [DEMO_DOCTOR_EMAIL]
  );

  const doctor = doctorRows[0];

  if (!doctor) {
    throw new Error(`The demo doctor profile for '${DEMO_DOCTOR_EMAIL}' was not found.`);
  }

  const [result] = await databasePool.query<ResultSetHeader>(
    `INSERT INTO encounters (
         encounter_number,
         patient_id,
         doctor_id,
         organization_id,
         encounter_type,
         started_at,
         ended_at,
         chief_complaint,
         symptoms,
         examination_findings,
         assessment_summary,
         plan_summary,
         status
       )
       VALUES (
         ?,
         ?,
         ?,
         ?,
         'CONSULTATION',
         DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY),
         DATE_ADD(
           DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY),
           INTERVAL 30 MINUTE
         ),
         'Routine health consultation',
         'Patient attended a scheduled routine consultation.',
         'General examination completed.',
         'No urgent clinical concerns identified.',
         'Continue routine follow-up as needed.',
         'COMPLETED'
       )`,
    [encounterNumber, patient.id, doctor.id, clinicId]
  );

  console.log(`Created encounter: ${encounterNumber}`);

  return result.insertId;
}

async function ensureDemoPrescription(clinicId: number): Promise<void> {
  const prescriptionNumber = "DEMO-RX-001";
  const [existing] = await databasePool.query<DemoEncounterRow[]>(
    `SELECT id FROM prescriptions WHERE prescription_number = ? LIMIT 1`,
    [prescriptionNumber]
  );
  if (existing[0]) {
    console.log(`Skipped prescription (already exists): ${prescriptionNumber}`);
    return;
  }

  const [patientRows] = await databasePool.query<DemoPatientRow[]>(
    `SELECT p.id FROM patients p JOIN users u ON u.id = p.user_id
      WHERE u.email = ? AND p.status = 'ACTIVE' LIMIT 1`,
    [DEMO_PATIENT_EMAIL]
  );
  const [doctorRows] = await databasePool.query<DemoDoctorRow[]>(
    `SELECT p.id FROM practitioners p JOIN users u ON u.id = p.user_id
      WHERE u.email = ? AND p.is_active = TRUE LIMIT 1`,
    [DEMO_DOCTOR_EMAIL]
  );
  const [medicationRows] = await databasePool.query<DemoMedicationRow[]>(
    `SELECT id, generic_name AS genericName, brand_name AS brandName,
            strength, dosage_form AS dosageForm
       FROM medications
      WHERE medication_code IN ('DEMO-PARA-500', 'MED-IBU-400')
      ORDER BY medication_code`
  );
  const patient = patientRows[0];
  const doctor = doctorRows[0];
  if (!patient || !doctor || medicationRows.length === 0) {
    console.log("Skipped demo prescription (patient, doctor, or medications missing).");
    return;
  }

  const [encounterRows] = await databasePool.query<DemoEncounterRow[]>(
    `SELECT id FROM encounters WHERE encounter_number = 'DEMO-ENC-001' LIMIT 1`
  );

  const [rx] = await databasePool.query<ResultSetHeader>(
    `INSERT INTO prescriptions
      (prescription_number, patient_id, doctor_id, encounter_id, organization_id,
       status, clinical_reason, valid_until, signature_method, signed_at, issued_at)
     VALUES (?, ?, ?, ?, ?, 'ISSUED', 'Routine pain relief after consultation',
             DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY),
             'ACCOUNT_CONFIRMATION', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [prescriptionNumber, patient.id, doctor.id, encounterRows[0]?.id ?? null, clinicId]
  );

  const frequencies = ["three times daily", "twice daily"];
  const quantities = [20, 10];
  for (const [index, medication] of medicationRows.entries()) {
    const displayName = medication.brandName
      ? `${medication.genericName} (${medication.brandName})`
      : medication.genericName;
    await databasePool.query(
      `INSERT INTO prescription_items
        (prescription_id, line_number, medication_id, medication_name_snapshot,
         strength_snapshot, dosage_form_snapshot, frequency_text,
         quantity_prescribed, quantity_unit, instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'tablets', 'Take after food')`,
      [
        rx.insertId,
        index + 1,
        medication.id,
        displayName,
        medication.strength,
        medication.dosageForm,
        frequencies[index] ?? "as directed",
        quantities[index] ?? 10
      ]
    );
  }

  console.log(`Created prescription: ${prescriptionNumber}`);
}

function printCredential(role: string, email: string, password: string, created: boolean): void {
  const passwordText = created ? password : "(existing account — password unchanged)";

  console.log(`${role.padEnd(12)} ${email.padEnd(32)} ${passwordText}`);
}

async function seedDemo(): Promise<void> {
  const admin = await authRepository.findUserByEmail(ADMIN_EMAIL);

  if (!admin || admin.role_code !== "ADMIN" || admin.status !== "ACTIVE") {
    throw new Error(
      `An active administrator '${ADMIN_EMAIL}' is required. Run 'npm run seed' first.`
    );
  }

  const clinic = createOrganizationSchema.parse({
    organizationCode: "DEMO-CLINIC",
    organizationType: "CLINIC",
    name: "Cliniq Demo Clinic",
    licenseNumber: "DEMO-CLINIC-LIC-001",
    phone: "+38338111001",
    email: "clinic.demo@example.com",
    addressLine1: "Health Street 1",
    addressLine2: "",
    city: "Prishtina",
    postalCode: "10000",
    countryCode: "XK",
    status: "ACTIVE"
  });

  const pharmacy = createOrganizationSchema.parse({
    organizationCode: "DEMO-PHARMACY",
    organizationType: "PHARMACY",
    name: "Cliniq Demo Pharmacy",
    licenseNumber: "DEMO-PHARM-LIC-001",
    phone: "+38338111002",
    email: "pharmacy.demo@example.com",
    addressLine1: "Health Street 2",
    addressLine2: "",
    city: "Prishtina",
    postalCode: "10000",
    countryCode: "XK",
    status: "ACTIVE"
  });

  const clinicId = await ensureOrganization(clinic, admin.id);

  const pharmacyId = await ensureOrganization(pharmacy, admin.id);

  const doctorCreated = await ensureDoctor(admin.id, clinicId);

  const pharmacistCreated = await ensurePharmacist(admin.id, pharmacyId);

  const patientCreated = await ensurePatient(admin.id);

  await ensureDemoEncounter(clinicId);
  await ensureMedications();
  await ensureDemoPrescription(clinicId);

  console.log("\n=== Demo credentials ===");

  printCredential("DOCTOR", DEMO_DOCTOR_EMAIL, DEMO_DOCTOR_PASSWORD, doctorCreated);

  printCredential("PHARMACIST", DEMO_PHARMACIST_EMAIL, DEMO_PHARMACIST_PASSWORD, pharmacistCreated);

  printCredential("PATIENT", DEMO_PATIENT_EMAIL, DEMO_PATIENT_PASSWORD, patientCreated);

  console.log(
    "\nAdministrator credentials use the password selected when 'npm run seed' was executed."
  );
}

seedDemo()
  .then(async () => {
    await databasePool.end();
  })
  .catch(async (error: unknown) => {
    console.error("Demo seeding failed:", error);

    await databasePool.end();
    process.exit(1);
  });
