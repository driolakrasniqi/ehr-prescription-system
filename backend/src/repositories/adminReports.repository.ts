import type { RowDataPacket } from "mysql2/promise";
import { databasePool } from "../config/database.js";

export type ReportPeriod = "30d" | "90d" | "12m" | "all";

type Pair = { label: string; count: number };

function periodStart(period: ReportPeriod): string | null {
  if (period === "all") return null;
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 365;
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
}

function since(column: string, start: string | null): string {
  return start ? `AND ${column} >= ?` : "";
}

function args(start: string | null, extra: unknown[] = []): unknown[] {
  return start ? [start, ...extra] : extra;
}

async function scalar(sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await databasePool.query<RowDataPacket[]>(sql, params);
  const first = rows[0];
  if (!first) return 0;
  return Number(Object.values(first)[0] ?? 0);
}

async function pairs(sql: string, params: unknown[] = []): Promise<Pair[]> {
  const [rows] = await databasePool.query<RowDataPacket[]>(sql, params);
  return rows.map((row) => ({
    label: String(row.label ?? "Unknown"),
    count: Number(row.count ?? 0)
  }));
}

function readableLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export async function getAdminReports(period: ReportPeriod) {
  const start = periodStart(period);

  const [
    overview,
    users,
    doctors,
    doctorPerformance,
    encounters,
    patients,
    clinical,
    prescriptions,
    organizations,
    security
  ] = await Promise.all([
    overviewStats(start),
    userStats(start),
    doctorStats(start),
    doctorPerformanceStats(start),
    encounterStats(start),
    patientStats(start),
    clinicalStats(start),
    prescriptionStats(start),
    organizationStats(start),
    securityStats(start)
  ]);

  return {
    period,
    generatedAt: new Date().toISOString(),
    overview,
    users,
    doctors,
    doctorPerformance,
    encounters,
    patients,
    clinical,
    prescriptions,
    organizations,
    security
  };
}

async function overviewStats(start: string | null) {
  const [
    totalUsers,
    totalDoctors,
    activeDoctors,
    totalPatients,
    activePatients,
    totalOrganizations,
    totalEncounters,
    completedEncounters,
    totalPrescriptions,
    activePrescriptions,
    totalDiagnoses,
    totalAllergies,
    activeMedications,
    failedOrDenied
  ] = await Promise.all([
    scalar(`SELECT COUNT(*) AS n FROM users`),
    scalar(
      `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'DOCTOR'`
    ),
    scalar(
      `SELECT COUNT(DISTINCT p.id) AS n FROM practitioners p
        JOIN practitioner_organizations po ON po.practitioner_id = p.id
       WHERE po.professional_role = 'DOCTOR' AND p.is_active = TRUE AND po.status = 'ACTIVE'
         AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())`
    ),
    scalar(`SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'PATIENT'`),
    scalar(`SELECT COUNT(*) AS n FROM patients WHERE status = 'ACTIVE'`),
    scalar(`SELECT COUNT(*) AS n FROM organizations`),
    scalar(`SELECT COUNT(*) AS n FROM encounters WHERE status <> 'ENTERED_IN_ERROR' ${since("started_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM encounters WHERE status = 'COMPLETED' ${since("started_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM prescriptions WHERE status <> 'ENTERED_IN_ERROR' ${since("COALESCE(issued_at, created_at)", start)}`, args(start)),
    scalar(
      `SELECT COUNT(*) AS n FROM prescriptions
        WHERE status = 'ISSUED' AND (valid_until IS NULL OR valid_until >= UTC_TIMESTAMP())
          ${since("COALESCE(issued_at, created_at)", start)}`,
      args(start)
    ),
    scalar(`SELECT COUNT(*) AS n FROM conditions WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM allergies WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM medications WHERE is_active = TRUE`),
    scalar(`SELECT COUNT(*) AS n FROM audit_events WHERE result IN ('FAILED','DENIED') ${since("event_at", start)}`, args(start))
  ]);

  return {
    totalUsers,
    totalDoctors,
    activeDoctors,
    totalPatients,
    activePatients,
    totalOrganizations,
    totalEncounters,
    completedEncounters,
    totalPrescriptions,
    activePrescriptions,
    totalDiagnoses,
    totalAllergies,
    activeMedications,
    failedOrDenied
  };
}

async function userStats(start: string | null) {
  const [
    byRole,
    byStatus,
    byMonth,
    lockedAccounts,
    pendingActivation,
    loggedInRecently,
    neverLoggedIn,
    failedLoginAttempts,
    activityByRole
  ] = await Promise.all([
    pairs(
      `SELECT r.code AS label, COUNT(*) AS count
         FROM users u JOIN roles r ON r.id = u.role_id
        GROUP BY r.code ORDER BY count DESC`
    ),
    pairs(`SELECT status AS label, COUNT(*) AS count FROM users GROUP BY status`),
    pairs(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS label, COUNT(*) AS count
         FROM users WHERE 1=1 ${since("created_at", start)}
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY label`,
      args(start)
    ),
    scalar(`SELECT COUNT(*) AS n FROM users WHERE status = 'LOCKED'`),
    scalar(`SELECT COUNT(*) AS n FROM users WHERE status = 'PENDING'`),
    scalar(`SELECT COUNT(*) AS n FROM users WHERE last_login_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)`),
    scalar(`SELECT COUNT(*) AS n FROM users WHERE last_login_at IS NULL`),
    scalar(`SELECT COALESCE(SUM(failed_login_count), 0) AS n FROM users`),
    pairs(
      `SELECT COALESCE(actor_role_code, 'UNKNOWN') AS label, COUNT(*) AS count
         FROM audit_events WHERE 1=1 ${since("event_at", start)}
        GROUP BY actor_role_code ORDER BY count DESC`,
      args(start)
    )
  ]);

  return {
    byRole: byRole.map((item) => ({ ...item, label: readableLabel(item.label) })),
    byStatus: byStatus.map((item) => ({ ...item, label: readableLabel(item.label) })),
    registeredByMonth: byMonth,
    lockedAccounts,
    pendingActivation,
    loggedInRecently,
    neverLoggedIn,
    failedLoginAttempts,
    activityByRole: activityByRole.map((item) => ({ ...item, label: readableLabel(item.label) }))
  };
}

async function doctorStats(start: string | null) {
  const [
    total,
    active,
    inactive,
    bySpecialty,
    byClinic,
    byAccountStatus,
    withActiveOrg,
    withoutActiveOrg,
    withPrimaryOrg,
    byPosition,
    addedByMonth,
    recentlyActive,
    inactiveInPeriod
  ] = await Promise.all([
    scalar(
      `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'DOCTOR'`
    ),
    scalar(
      `SELECT COUNT(DISTINCT p.id) AS n FROM practitioners p
        JOIN practitioner_organizations po ON po.practitioner_id = p.id
       WHERE po.professional_role = 'DOCTOR' AND p.is_active = TRUE`
    ),
    scalar(
      `SELECT COUNT(DISTINCT p.id) AS n FROM practitioners p
        JOIN practitioner_organizations po ON po.practitioner_id = p.id
       WHERE po.professional_role = 'DOCTOR' AND p.is_active = FALSE`
    ),
    pairs(
      `SELECT COALESCE(NULLIF(p.specialty, ''), 'Unspecified') AS label, COUNT(DISTINCT p.id) AS count
         FROM practitioners p
         JOIN practitioner_organizations po ON po.practitioner_id = p.id
        WHERE po.professional_role = 'DOCTOR'
        GROUP BY COALESCE(NULLIF(p.specialty, ''), 'Unspecified')
        ORDER BY count DESC`
    ),
    pairs(
      `SELECT o.name AS label, COUNT(DISTINCT p.id) AS count
         FROM practitioners p
         JOIN practitioner_organizations po ON po.practitioner_id = p.id
         JOIN organizations o ON o.id = po.organization_id
        WHERE po.professional_role = 'DOCTOR'
        GROUP BY o.id, o.name
        ORDER BY count DESC`
    ),
    pairs(
      `SELECT u.status AS label, COUNT(DISTINCT p.id) AS count
         FROM practitioners p
         JOIN users u ON u.id = p.user_id
         JOIN practitioner_organizations po ON po.practitioner_id = p.id
        WHERE po.professional_role = 'DOCTOR'
        GROUP BY u.status`
    ),
    scalar(
      `SELECT COUNT(DISTINCT p.id) AS n FROM practitioners p
        JOIN practitioner_organizations po ON po.practitioner_id = p.id
       WHERE po.professional_role = 'DOCTOR' AND po.status = 'ACTIVE'
         AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())`
    ),
    scalar(
      `SELECT COUNT(DISTINCT p.id) AS n FROM practitioners p
        JOIN practitioner_organizations po ON po.practitioner_id = p.id
       WHERE po.professional_role = 'DOCTOR'
         AND p.id NOT IN (
           SELECT practitioner_id FROM practitioner_organizations
            WHERE professional_role = 'DOCTOR' AND status = 'ACTIVE'
              AND (ended_on IS NULL OR ended_on >= UTC_DATE())
         )`
    ),
    scalar(
      `SELECT COUNT(DISTINCT p.id) AS n FROM practitioners p
        JOIN practitioner_organizations po ON po.practitioner_id = p.id
       WHERE po.professional_role = 'DOCTOR' AND po.is_primary = TRUE`
    ),
    pairs(
      `SELECT COALESCE(NULLIF(po.position_title, ''), 'Unspecified') AS label, COUNT(DISTINCT p.id) AS count
         FROM practitioners p
         JOIN practitioner_organizations po ON po.practitioner_id = p.id
        WHERE po.professional_role = 'DOCTOR'
        GROUP BY COALESCE(NULLIF(po.position_title, ''), 'Unspecified')
        ORDER BY count DESC`
    ),
    pairs(
      `SELECT DATE_FORMAT(p.created_at, '%Y-%m') AS label, COUNT(DISTINCT p.id) AS count
         FROM practitioners p
         JOIN practitioner_organizations po ON po.practitioner_id = p.id
        WHERE po.professional_role = 'DOCTOR' ${since("p.created_at", start)}
        GROUP BY DATE_FORMAT(p.created_at, '%Y-%m')
        ORDER BY label`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(DISTINCT doctor_id) AS n FROM encounters
        WHERE status <> 'ENTERED_IN_ERROR' ${since("started_at", start)}`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(DISTINCT p.id) AS n FROM practitioners p
        JOIN practitioner_organizations po ON po.practitioner_id = p.id
       WHERE po.professional_role = 'DOCTOR'
         AND p.id NOT IN (
           SELECT doctor_id FROM encounters
            WHERE status <> 'ENTERED_IN_ERROR' ${since("started_at", start)}
         )`,
      args(start)
    )
  ]);

  return {
    total,
    active,
    inactive,
    bySpecialty,
    byClinic,
    byAccountStatus: byAccountStatus.map((item) => ({ ...item, label: readableLabel(item.label) })),
    withActiveOrg,
    withoutActiveOrg,
    withPrimaryOrg,
    byPosition,
    addedByMonth,
    recentlyActive,
    inactiveInPeriod
  };
}

async function doctorPerformanceStats(start: string | null) {
  const [rows] = await databasePool.query<RowDataPacket[]>(
    `SELECT p.id,
            CONCAT(p.first_name, ' ', p.last_name) AS doctorName,
            COALESCE(p.specialty, 'Unspecified') AS specialty,
            COUNT(DISTINCT e.patient_id) AS uniquePatients,
            COUNT(e.id) AS encounters,
            SUM(e.status = 'COMPLETED') AS completed,
            SUM(e.status = 'IN_PROGRESS') AS inProgress,
            SUM(e.status = 'PLANNED') AS planned,
            SUM(e.status = 'CANCELLED') AS cancelled,
            SUM(e.status = 'ENTERED_IN_ERROR') AS enteredInError,
            COUNT(DISTINCT DATE(e.started_at)) AS activeDays,
            MAX(e.started_at) AS lastActivity
       FROM practitioners p
       JOIN practitioner_organizations po ON po.practitioner_id = p.id
       LEFT JOIN encounters e
         ON e.doctor_id = p.id ${start ? "AND e.started_at >= ?" : ""}
      WHERE po.professional_role = 'DOCTOR'
      GROUP BY p.id, p.first_name, p.last_name, p.specialty
      ORDER BY encounters DESC, doctorName
      LIMIT 50`,
    start ? [start] : []
  );

  const [rxRows] = await databasePool.query<RowDataPacket[]>(
    `SELECT doctor_id AS doctorId,
            COUNT(*) AS prescriptions,
            SUM(status = 'CANCELLED') AS cancelledPrescriptions
       FROM prescriptions
      WHERE status <> 'ENTERED_IN_ERROR' ${since("COALESCE(issued_at, created_at)", start)}
      GROUP BY doctor_id`,
    args(start)
  );
  const [conditionRows] = await databasePool.query<RowDataPacket[]>(
    `SELECT recorded_by_practitioner_id AS doctorId, COUNT(*) AS diagnoses
       FROM conditions
      WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)}
      GROUP BY recorded_by_practitioner_id`,
    args(start)
  );
  const [allergyRows] = await databasePool.query<RowDataPacket[]>(
    `SELECT recorded_by_practitioner_id AS doctorId, COUNT(*) AS allergies
       FROM allergies
      WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)}
      GROUP BY recorded_by_practitioner_id`,
    args(start)
  );
  const [clinicRows] = await databasePool.query<RowDataPacket[]>(
    `SELECT e.doctor_id AS doctorId, o.name AS clinicName, COUNT(*) AS count
       FROM encounters e
       JOIN organizations o ON o.id = e.organization_id
      WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}
      GROUP BY e.doctor_id, o.id, o.name`,
    args(start)
  );

  const rxMap = new Map(rxRows.map((row) => [Number(row.doctorId), row]));
  const diagnosisMap = new Map(conditionRows.map((row) => [Number(row.doctorId), Number(row.diagnoses)]));
  const allergyMap = new Map(allergyRows.map((row) => [Number(row.doctorId), Number(row.allergies)]));

  return rows.map((row) => {
    const id = Number(row.id);
    const encounters = Number(row.encounters ?? 0);
    const completed = Number(row.completed ?? 0);
    const rx = rxMap.get(id);
    const prescriptions = Number(rx?.prescriptions ?? 0);
    const cancelledPrescriptions = Number(rx?.cancelledPrescriptions ?? 0);
    return {
      doctorName: String(row.doctorName),
      specialty: String(row.specialty),
      uniquePatients: Number(row.uniquePatients ?? 0),
      encounters,
      completed,
      inProgress: Number(row.inProgress ?? 0),
      planned: Number(row.planned ?? 0),
      cancelled: Number(row.cancelled ?? 0),
      enteredInError: Number(row.enteredInError ?? 0),
      completedRate: encounters ? Math.round((completed / encounters) * 100) : 0,
      averagePerDay: Number(row.activeDays) ? Number((encounters / Number(row.activeDays)).toFixed(1)) : 0,
      prescriptions,
      cancelledPrescriptions,
      cancelledPrescriptionRate: prescriptions
        ? Math.round((cancelledPrescriptions / prescriptions) * 100)
        : 0,
      prescriptionsPerEncounter: encounters ? Number((prescriptions / encounters).toFixed(2)) : 0,
      diagnoses: diagnosisMap.get(id) ?? 0,
      allergies: allergyMap.get(id) ?? 0,
      activeDays: Number(row.activeDays ?? 0),
      lastActivity: row.lastActivity ? String(row.lastActivity) : null,
      byClinic: clinicRows
        .filter((item) => Number(item.doctorId) === id)
        .map((item) => ({ label: String(item.clinicName), count: Number(item.count) }))
    };
  });
}

async function encounterStats(start: string | null) {
  const encounterWhere = `status <> 'ENTERED_IN_ERROR' ${since("started_at", start)}`;
  const [
    total,
    byStatus,
    byType,
    byDoctor,
    byClinic,
    byMonth,
    uniquePatients,
    newPatients,
    returningPatients,
    completed,
    cancelled,
    withPrescription,
    withoutPrescription,
    withDiagnosis,
    withoutDiagnosis,
    withAllergy,
    byAge,
    bySex
  ] = await Promise.all([
    scalar(`SELECT COUNT(*) AS n FROM encounters WHERE ${encounterWhere}`, args(start)),
    pairs(`SELECT status AS label, COUNT(*) AS count FROM encounters ${start ? "WHERE started_at >= ?" : ""} GROUP BY status`, args(start)),
    pairs(
      `SELECT encounter_type AS label, COUNT(*) AS count FROM encounters WHERE ${encounterWhere} GROUP BY encounter_type`,
      args(start)
    ),
    pairs(
      `SELECT CONCAT(p.first_name, ' ', p.last_name) AS label, COUNT(*) AS count
         FROM encounters e JOIN practitioners p ON p.id = e.doctor_id
        WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}
        GROUP BY e.doctor_id, p.first_name, p.last_name
        ORDER BY count DESC LIMIT 20`,
      args(start)
    ),
    pairs(
      `SELECT o.name AS label, COUNT(*) AS count
         FROM encounters e JOIN organizations o ON o.id = e.organization_id
        WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}
        GROUP BY o.id, o.name ORDER BY count DESC`,
      args(start)
    ),
    pairs(
      `SELECT DATE_FORMAT(started_at, '%Y-%m') AS label, COUNT(*) AS count
         FROM encounters WHERE ${encounterWhere}
        GROUP BY DATE_FORMAT(started_at, '%Y-%m') ORDER BY label`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(DISTINCT patient_id) AS n FROM encounters WHERE ${encounterWhere}`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM (
         SELECT patient_id FROM encounters
          WHERE status <> 'ENTERED_IN_ERROR'
          GROUP BY patient_id
         HAVING COUNT(*) = 1
       ) t`
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM (
         SELECT patient_id FROM encounters
          WHERE status <> 'ENTERED_IN_ERROR'
          GROUP BY patient_id
         HAVING COUNT(*) > 1
       ) t`
    ),
    scalar(`SELECT COUNT(*) AS n FROM encounters WHERE status = 'COMPLETED' ${since("started_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM encounters WHERE status = 'CANCELLED' ${since("started_at", start)}`, args(start)),
    scalar(
      `SELECT COUNT(DISTINCT e.id) AS n FROM encounters e
        JOIN prescriptions rx ON rx.encounter_id = e.id AND rx.status <> 'ENTERED_IN_ERROR'
       WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM encounters e
        WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}
          AND NOT EXISTS (
            SELECT 1 FROM prescriptions rx
             WHERE rx.encounter_id = e.id AND rx.status <> 'ENTERED_IN_ERROR'
          )`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(DISTINCT e.id) AS n FROM encounters e
        JOIN conditions c ON c.encounter_id = e.id AND c.verification_status <> 'ENTERED_IN_ERROR'
       WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM encounters e
        WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}
          AND NOT EXISTS (
            SELECT 1 FROM conditions c
             WHERE c.encounter_id = e.id AND c.verification_status <> 'ENTERED_IN_ERROR'
          )`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(DISTINCT e.id) AS n FROM encounters e
        JOIN allergies a ON a.encounter_id = e.id AND a.verification_status <> 'ENTERED_IN_ERROR'
       WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}`,
      args(start)
    ),
    pairs(
      `SELECT CASE
            WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, UTC_DATE()) < 18 THEN '0–17'
            WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, UTC_DATE()) < 30 THEN '18–29'
            WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, UTC_DATE()) < 45 THEN '30–44'
            WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, UTC_DATE()) < 60 THEN '45–59'
            WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, UTC_DATE()) < 75 THEN '60–74'
            ELSE '75+'
          END AS label,
          COUNT(*) AS count
         FROM encounters e JOIN patients p ON p.id = e.patient_id
        WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}
        GROUP BY label ORDER BY label`,
      args(start)
    ),
    pairs(
      `SELECT p.sex AS label, COUNT(*) AS count
         FROM encounters e JOIN patients p ON p.id = e.patient_id
        WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}
        GROUP BY p.sex`,
      args(start)
    )
  ]);

  return {
    total,
    byStatus: byStatus.map((item) => ({ ...item, label: readableLabel(item.label) })),
    byType: byType.map((item) => ({ ...item, label: readableLabel(item.label) })),
    byDoctor,
    byClinic,
    byMonth,
    uniquePatients,
    newPatients,
    returningPatients,
    completedRate: total ? Math.round((completed / total) * 100) : 0,
    cancelledRate: total ? Math.round((cancelled / total) * 100) : 0,
    withPrescription,
    withoutPrescription,
    withDiagnosis,
    withoutDiagnosis,
    withAllergy,
    byAge,
    bySex: bySex.map((item) => ({ ...item, label: readableLabel(item.label) }))
  };
}

async function patientStats(start: string | null) {
  const [
    total,
    byStatus,
    bySex,
    byAge,
    byBlood,
    byMarital,
    bySmoking,
    byCity,
    byCountry,
    registeredByMonth,
    withEncounters,
    withoutEncounters,
    withActivePrescriptions,
    withActiveDiagnoses,
    withActiveAllergies,
    uniqueByDoctor,
    returning
  ] = await Promise.all([
    scalar(`SELECT COUNT(*) AS n FROM patients`),
    pairs(`SELECT status AS label, COUNT(*) AS count FROM patients GROUP BY status`),
    pairs(`SELECT sex AS label, COUNT(*) AS count FROM patients GROUP BY sex`),
    pairs(
      `SELECT CASE
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, UTC_DATE()) < 18 THEN '0–17'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, UTC_DATE()) < 30 THEN '18–29'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, UTC_DATE()) < 45 THEN '30–44'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, UTC_DATE()) < 60 THEN '45–59'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, UTC_DATE()) < 75 THEN '60–74'
            ELSE '75+'
          END AS label,
          COUNT(*) AS count
         FROM patients GROUP BY label ORDER BY label`
    ),
    pairs(`SELECT blood_type AS label, COUNT(*) AS count FROM patients GROUP BY blood_type`),
    pairs(`SELECT marital_status AS label, COUNT(*) AS count FROM patients GROUP BY marital_status`),
    pairs(`SELECT smoking_status AS label, COUNT(*) AS count FROM patients GROUP BY smoking_status`),
    pairs(
      `SELECT COALESCE(NULLIF(city, ''), 'Unspecified') AS label, COUNT(*) AS count
         FROM patients GROUP BY COALESCE(NULLIF(city, ''), 'Unspecified')
        ORDER BY count DESC LIMIT 20`
    ),
    pairs(`SELECT country_code AS label, COUNT(*) AS count FROM patients GROUP BY country_code`),
    pairs(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS label, COUNT(*) AS count
         FROM patients WHERE 1=1 ${since("created_at", start)}
        GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY label`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(DISTINCT patient_id) AS n FROM encounters WHERE status <> 'ENTERED_IN_ERROR'`
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM patients p
        WHERE NOT EXISTS (
          SELECT 1 FROM encounters e WHERE e.patient_id = p.id AND e.status <> 'ENTERED_IN_ERROR'
        )`
    ),
    scalar(
      `SELECT COUNT(DISTINCT patient_id) AS n FROM prescriptions
        WHERE status = 'ISSUED' AND (valid_until IS NULL OR valid_until >= UTC_TIMESTAMP())`
    ),
    scalar(
      `SELECT COUNT(DISTINCT patient_id) AS n FROM conditions
        WHERE clinical_status IN ('ACTIVE','RECURRENCE','RELAPSE')
          AND verification_status <> 'ENTERED_IN_ERROR'`
    ),
    scalar(
      `SELECT COUNT(DISTINCT patient_id) AS n FROM allergies
        WHERE clinical_status = 'ACTIVE' AND verification_status <> 'ENTERED_IN_ERROR'`
    ),
    pairs(
      `SELECT CONCAT(d.first_name, ' ', d.last_name) AS label, COUNT(DISTINCT e.patient_id) AS count
         FROM encounters e JOIN practitioners d ON d.id = e.doctor_id
        WHERE e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}
        GROUP BY e.doctor_id, d.first_name, d.last_name
        ORDER BY count DESC LIMIT 20`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM (
         SELECT patient_id FROM encounters WHERE status <> 'ENTERED_IN_ERROR'
          GROUP BY patient_id HAVING COUNT(*) > 1
       ) t`
    )
  ]);

  return {
    total,
    byStatus: byStatus.map((item) => ({ ...item, label: readableLabel(item.label) })),
    bySex: bySex.map((item) => ({ ...item, label: readableLabel(item.label) })),
    byAge,
    byBlood,
    byMarital: byMarital.map((item) => ({ ...item, label: readableLabel(item.label) })),
    bySmoking: bySmoking.map((item) => ({ ...item, label: readableLabel(item.label) })),
    byCity,
    byCountry,
    registeredByMonth,
    withEncounters,
    withoutEncounters,
    withActivePrescriptions,
    withActiveDiagnoses,
    withActiveAllergies,
    uniqueByDoctor,
    returning
  };
}

async function clinicalStats(start: string | null) {
  const [
    totalDiagnoses,
    topDiagnoses,
    byCategory,
    byClinicalStatus,
    activeDiagnoses,
    resolvedDiagnoses,
    activeChronic,
    bySeverity,
    byVerification,
    byDoctor,
    byClinic,
    byMonth,
    withEncounter,
    withoutEncounter,
    encountersWithDiagnosis,
    totalAllergies,
    topSubstances,
    allergyByCategory,
    allergyByType,
    allergyBySeverity,
    allergyByCriticality,
    activeAllergies,
    resolvedAllergies,
    allergyByVerification,
    allergyByDoctor,
    allergyByMonth,
    allergyWithEncounter,
    allergyWithoutEncounter,
    medicationAllergies,
    patientsWithActiveAllergy,
    totalPatients
  ] = await Promise.all([
    scalar(`SELECT COUNT(*) AS n FROM conditions WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)}`, args(start)),
    pairs(
      `SELECT condition_name AS label, COUNT(*) AS count FROM conditions
        WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)}
        GROUP BY condition_name ORDER BY count DESC LIMIT 15`,
      args(start)
    ),
    pairs(
      `SELECT category AS label, COUNT(*) AS count FROM conditions
        WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)} GROUP BY category`,
      args(start)
    ),
    pairs(
      `SELECT clinical_status AS label, COUNT(*) AS count FROM conditions
        WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)} GROUP BY clinical_status`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM conditions
        WHERE clinical_status IN ('ACTIVE','RECURRENCE','RELAPSE') AND verification_status <> 'ENTERED_IN_ERROR'`
    ),
    scalar(`SELECT COUNT(*) AS n FROM conditions WHERE clinical_status = 'RESOLVED'`),
    scalar(
      `SELECT COUNT(*) AS n FROM conditions
        WHERE category = 'CHRONIC_CONDITION' AND clinical_status IN ('ACTIVE','RECURRENCE','RELAPSE')
          AND verification_status <> 'ENTERED_IN_ERROR'`
    ),
    pairs(
      `SELECT severity AS label, COUNT(*) AS count FROM conditions
        WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)} GROUP BY severity`,
      args(start)
    ),
    pairs(
      `SELECT verification_status AS label, COUNT(*) AS count FROM conditions
        WHERE 1=1 ${since("diagnosed_at", start)} GROUP BY verification_status`,
      args(start)
    ),
    pairs(
      `SELECT CONCAT(p.first_name, ' ', p.last_name) AS label, COUNT(*) AS count
         FROM conditions c JOIN practitioners p ON p.id = c.recorded_by_practitioner_id
        WHERE c.verification_status <> 'ENTERED_IN_ERROR' ${since("c.diagnosed_at", start)}
        GROUP BY p.id, p.first_name, p.last_name ORDER BY count DESC LIMIT 15`,
      args(start)
    ),
    pairs(
      `SELECT o.name AS label, COUNT(*) AS count
         FROM conditions c
         JOIN encounters e ON e.id = c.encounter_id
         JOIN organizations o ON o.id = e.organization_id
        WHERE c.verification_status <> 'ENTERED_IN_ERROR' ${since("c.diagnosed_at", start)}
        GROUP BY o.id, o.name ORDER BY count DESC`,
      args(start)
    ),
    pairs(
      `SELECT DATE_FORMAT(diagnosed_at, '%Y-%m') AS label, COUNT(*) AS count
         FROM conditions WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)}
        GROUP BY DATE_FORMAT(diagnosed_at, '%Y-%m') ORDER BY label`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM conditions
        WHERE encounter_id IS NOT NULL AND verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)}`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM conditions
        WHERE encounter_id IS NULL AND verification_status <> 'ENTERED_IN_ERROR' ${since("diagnosed_at", start)}`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(DISTINCT encounter_id) AS n FROM conditions
        WHERE encounter_id IS NOT NULL AND verification_status <> 'ENTERED_IN_ERROR'`
    ),
    scalar(`SELECT COUNT(*) AS n FROM allergies WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)}`, args(start)),
    pairs(
      `SELECT substance AS label, COUNT(*) AS count FROM allergies
        WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)}
        GROUP BY substance ORDER BY count DESC LIMIT 15`,
      args(start)
    ),
    pairs(
      `SELECT category AS label, COUNT(*) AS count FROM allergies
        WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)} GROUP BY category`,
      args(start)
    ),
    pairs(
      `SELECT allergy_type AS label, COUNT(*) AS count FROM allergies
        WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)} GROUP BY allergy_type`,
      args(start)
    ),
    pairs(
      `SELECT severity AS label, COUNT(*) AS count FROM allergies
        WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)} GROUP BY severity`,
      args(start)
    ),
    pairs(
      `SELECT criticality AS label, COUNT(*) AS count FROM allergies
        WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)} GROUP BY criticality`,
      args(start)
    ),
    scalar(`SELECT COUNT(*) AS n FROM allergies WHERE clinical_status = 'ACTIVE' AND verification_status <> 'ENTERED_IN_ERROR'`),
    scalar(`SELECT COUNT(*) AS n FROM allergies WHERE clinical_status = 'RESOLVED'`),
    pairs(
      `SELECT verification_status AS label, COUNT(*) AS count FROM allergies
        WHERE 1=1 ${since("created_at", start)} GROUP BY verification_status`,
      args(start)
    ),
    pairs(
      `SELECT CONCAT(p.first_name, ' ', p.last_name) AS label, COUNT(*) AS count
         FROM allergies a JOIN practitioners p ON p.id = a.recorded_by_practitioner_id
        WHERE a.verification_status <> 'ENTERED_IN_ERROR' ${since("a.created_at", start)}
        GROUP BY p.id, p.first_name, p.last_name ORDER BY count DESC LIMIT 15`,
      args(start)
    ),
    pairs(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS label, COUNT(*) AS count
         FROM allergies WHERE verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)}
        GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY label`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM allergies
        WHERE encounter_id IS NOT NULL AND verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)}`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM allergies
        WHERE encounter_id IS NULL AND verification_status <> 'ENTERED_IN_ERROR' ${since("created_at", start)}`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(DISTINCT patient_id) AS n FROM allergies
        WHERE category = 'MEDICATION' AND verification_status <> 'ENTERED_IN_ERROR'`
    ),
    scalar(
      `SELECT COUNT(DISTINCT patient_id) AS n FROM allergies
        WHERE clinical_status = 'ACTIVE' AND verification_status <> 'ENTERED_IN_ERROR'`
    ),
    scalar(`SELECT COUNT(*) AS n FROM patients WHERE status = 'ACTIVE'`)
  ]);

  const encounterTotal = await scalar(
    `SELECT COUNT(*) AS n FROM encounters WHERE status <> 'ENTERED_IN_ERROR' ${since("started_at", start)}`,
    args(start)
  );

  return {
    diagnoses: {
      total: totalDiagnoses,
      top: topDiagnoses,
      byCategory: byCategory.map((item) => ({ ...item, label: readableLabel(item.label) })),
      byClinicalStatus: byClinicalStatus.map((item) => ({ ...item, label: readableLabel(item.label) })),
      active: activeDiagnoses,
      resolved: resolvedDiagnoses,
      activeChronic,
      bySeverity: bySeverity.map((item) => ({ ...item, label: readableLabel(item.label) })),
      byVerification: byVerification.map((item) => ({ ...item, label: readableLabel(item.label) })),
      byDoctor,
      byClinic,
      byMonth,
      withEncounter,
      withoutEncounter,
      encounterWithDiagnosisRate: encounterTotal
        ? Math.round((encountersWithDiagnosis / encounterTotal) * 100)
        : 0
    },
    allergies: {
      total: totalAllergies,
      topSubstances,
      byCategory: allergyByCategory.map((item) => ({ ...item, label: readableLabel(item.label) })),
      byType: allergyByType.map((item) => ({ ...item, label: readableLabel(item.label) })),
      bySeverity: allergyBySeverity.map((item) => ({ ...item, label: readableLabel(item.label) })),
      byCriticality: allergyByCriticality.map((item) => ({ ...item, label: readableLabel(item.label) })),
      active: activeAllergies,
      resolved: resolvedAllergies,
      byVerification: allergyByVerification.map((item) => ({ ...item, label: readableLabel(item.label) })),
      byDoctor: allergyByDoctor,
      byMonth: allergyByMonth,
      withEncounter: allergyWithEncounter,
      withoutEncounter: allergyWithoutEncounter,
      medicationAllergyPatients: medicationAllergies,
      activeAllergyPatientRate: totalPatients
        ? Math.round((patientsWithActiveAllergy / totalPatients) * 100)
        : 0
    }
  };
}

async function prescriptionStats(start: string | null) {
  const rxWhere = `status <> 'ENTERED_IN_ERROR' ${since("COALESCE(issued_at, created_at)", start)}`;
  const [
    total,
    byStatus,
    byDoctor,
    byClinic,
    byMonth,
    activeValid,
    expired,
    expiringSoon,
    cancelled,
    withEncounter,
    withoutEncounter,
    uniquePatients,
    multiItem,
    avgItems,
    bySignature,
    totalMedications,
    activeMeds,
    inactiveMeds,
    mostPrescribed,
    leastPrescribed,
    neverPrescribed,
    byForm,
    byRoute,
    byManufacturer,
    byAtc,
    asNeeded,
    withRepeats,
    substitutionAllowed,
    byDoctorMed,
    byClinicMed,
    medByMonth
  ] = await Promise.all([
    scalar(`SELECT COUNT(*) AS n FROM prescriptions WHERE ${rxWhere}`, args(start)),
    pairs(`SELECT status AS label, COUNT(*) AS count FROM prescriptions GROUP BY status`),
    pairs(
      `SELECT CONCAT(p.first_name, ' ', p.last_name) AS label, COUNT(*) AS count
         FROM prescriptions rx JOIN practitioners p ON p.id = rx.doctor_id
        WHERE rx.status <> 'ENTERED_IN_ERROR' ${since("COALESCE(rx.issued_at, rx.created_at)", start)}
        GROUP BY rx.doctor_id, p.first_name, p.last_name ORDER BY count DESC LIMIT 15`,
      args(start)
    ),
    pairs(
      `SELECT o.name AS label, COUNT(*) AS count
         FROM prescriptions rx JOIN organizations o ON o.id = rx.organization_id
        WHERE rx.status <> 'ENTERED_IN_ERROR' ${since("COALESCE(rx.issued_at, rx.created_at)", start)}
        GROUP BY o.id, o.name ORDER BY count DESC`,
      args(start)
    ),
    pairs(
      `SELECT DATE_FORMAT(COALESCE(issued_at, created_at), '%Y-%m') AS label, COUNT(*) AS count
         FROM prescriptions WHERE ${rxWhere}
        GROUP BY DATE_FORMAT(COALESCE(issued_at, created_at), '%Y-%m') ORDER BY label`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM prescriptions
        WHERE status = 'ISSUED' AND (valid_until IS NULL OR valid_until >= UTC_TIMESTAMP())`
    ),
    scalar(`SELECT COUNT(*) AS n FROM prescriptions WHERE status = 'EXPIRED' OR (valid_until IS NOT NULL AND valid_until < UTC_TIMESTAMP() AND status = 'ISSUED')`),
    scalar(
      `SELECT COUNT(*) AS n FROM prescriptions
        WHERE status = 'ISSUED' AND valid_until IS NOT NULL
          AND valid_until BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)`
    ),
    scalar(`SELECT COUNT(*) AS n FROM prescriptions WHERE status = 'CANCELLED' ${since("COALESCE(cancelled_at, created_at)", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM prescriptions WHERE encounter_id IS NOT NULL AND ${rxWhere}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM prescriptions WHERE encounter_id IS NULL AND ${rxWhere}`, args(start)),
    scalar(`SELECT COUNT(DISTINCT patient_id) AS n FROM prescriptions WHERE ${rxWhere}`, args(start)),
    scalar(
      `SELECT COUNT(*) AS n FROM (
         SELECT prescription_id FROM prescription_items GROUP BY prescription_id HAVING COUNT(*) > 1
       ) t`
    ),
    scalar(
      `SELECT ROUND(AVG(n), 2) AS n FROM (
         SELECT COUNT(*) AS n FROM prescription_items GROUP BY prescription_id
       ) t`
    ),
    pairs(
      `SELECT COALESCE(signature_method, 'UNSPECIFIED') AS label, COUNT(*) AS count
         FROM prescriptions WHERE ${rxWhere} GROUP BY signature_method`,
      args(start)
    ),
    scalar(`SELECT COUNT(*) AS n FROM medications`),
    scalar(`SELECT COUNT(*) AS n FROM medications WHERE is_active = TRUE`),
    scalar(`SELECT COUNT(*) AS n FROM medications WHERE is_active = FALSE`),
    pairs(
      `SELECT item.medication_name_snapshot AS label, COUNT(*) AS count
         FROM prescription_items item
         JOIN prescriptions rx ON rx.id = item.prescription_id
        WHERE rx.status <> 'ENTERED_IN_ERROR' ${since("COALESCE(rx.issued_at, rx.created_at)", start)}
        GROUP BY item.medication_name_snapshot ORDER BY count DESC LIMIT 15`,
      args(start)
    ),
    pairs(
      `SELECT item.medication_name_snapshot AS label, COUNT(*) AS count
         FROM prescription_items item
         JOIN prescriptions rx ON rx.id = item.prescription_id
        WHERE rx.status <> 'ENTERED_IN_ERROR' ${since("COALESCE(rx.issued_at, rx.created_at)", start)}
        GROUP BY item.medication_name_snapshot ORDER BY count ASC LIMIT 10`,
      args(start)
    ),
    scalar(
      `SELECT COUNT(*) AS n FROM medications m
        WHERE NOT EXISTS (
          SELECT 1 FROM prescription_items i WHERE i.medication_id = m.id
        )`
    ),
    pairs(
      `SELECT dosage_form AS label, COUNT(*) AS count FROM medications GROUP BY dosage_form ORDER BY count DESC`
    ),
    pairs(
      `SELECT COALESCE(default_route, 'Unspecified') AS label, COUNT(*) AS count
         FROM medications GROUP BY COALESCE(default_route, 'Unspecified') ORDER BY count DESC`
    ),
    pairs(
      `SELECT COALESCE(NULLIF(manufacturer, ''), 'Unspecified') AS label, COUNT(*) AS count
         FROM medications GROUP BY COALESCE(NULLIF(manufacturer, ''), 'Unspecified') ORDER BY count DESC LIMIT 15`
    ),
    pairs(
      `SELECT COALESCE(NULLIF(atc_code, ''), 'Unspecified') AS label, COUNT(*) AS count
         FROM medications GROUP BY COALESCE(NULLIF(atc_code, ''), 'Unspecified') ORDER BY count DESC LIMIT 15`
    ),
    scalar(`SELECT COUNT(*) AS n FROM prescription_items WHERE as_needed = TRUE`),
    scalar(`SELECT COUNT(*) AS n FROM prescription_items WHERE repeats_allowed > 0`),
    scalar(`SELECT COUNT(*) AS n FROM prescription_items WHERE substitution_allowed = TRUE`),
    pairs(
      `SELECT CONCAT(p.first_name, ' ', p.last_name, ' · ', item.medication_name_snapshot) AS label, COUNT(*) AS count
         FROM prescription_items item
         JOIN prescriptions rx ON rx.id = item.prescription_id
         JOIN practitioners p ON p.id = rx.doctor_id
        WHERE rx.status <> 'ENTERED_IN_ERROR' ${since("COALESCE(rx.issued_at, rx.created_at)", start)}
        GROUP BY rx.doctor_id, p.first_name, p.last_name, item.medication_name_snapshot
        ORDER BY count DESC LIMIT 15`,
      args(start)
    ),
    pairs(
      `SELECT CONCAT(o.name, ' · ', item.medication_name_snapshot) AS label, COUNT(*) AS count
         FROM prescription_items item
         JOIN prescriptions rx ON rx.id = item.prescription_id
         JOIN organizations o ON o.id = rx.organization_id
        WHERE rx.status <> 'ENTERED_IN_ERROR' ${since("COALESCE(rx.issued_at, rx.created_at)", start)}
        GROUP BY o.id, o.name, item.medication_name_snapshot
        ORDER BY count DESC LIMIT 15`,
      args(start)
    ),
    pairs(
      `SELECT DATE_FORMAT(COALESCE(rx.issued_at, rx.created_at), '%Y-%m') AS label, COUNT(*) AS count
         FROM prescription_items item
         JOIN prescriptions rx ON rx.id = item.prescription_id
        WHERE rx.status <> 'ENTERED_IN_ERROR' ${since("COALESCE(rx.issued_at, rx.created_at)", start)}
        GROUP BY DATE_FORMAT(COALESCE(rx.issued_at, rx.created_at), '%Y-%m') ORDER BY label`,
      args(start)
    )
  ]);

  const encounterTotal = await scalar(
    `SELECT COUNT(*) AS n FROM encounters WHERE status <> 'ENTERED_IN_ERROR' ${since("started_at", start)}`,
    args(start)
  );

  return {
    total,
    byStatus: byStatus.map((item) => ({ ...item, label: readableLabel(item.label) })),
    byDoctor,
    byClinic,
    byMonth,
    activeValid,
    expired,
    expiringSoon,
    cancelled,
    cancelledRate: total ? Math.round((cancelled / total) * 100) : 0,
    withEncounter,
    withoutEncounter,
    averagePerEncounter: encounterTotal ? Number((total / encounterTotal).toFixed(2)) : 0,
    uniquePatients,
    withMultipleMedications: multiItem,
    averageItems: avgItems,
    bySignature: bySignature.map((item) => ({ ...item, label: readableLabel(item.label) })),
    medications: {
      total: totalMedications,
      active: activeMeds,
      inactive: inactiveMeds,
      mostPrescribed,
      leastPrescribed,
      neverPrescribed,
      byForm,
      byRoute,
      byManufacturer,
      byAtc,
      asNeeded,
      withRepeats,
      substitutionAllowed,
      topByDoctor: byDoctorMed,
      topByClinic: byClinicMed,
      trendByMonth: medByMonth
    }
  };
}

async function organizationStats(start: string | null) {
  const [total, byType, byStatus, byCity, staff, activity, withoutStaff, withoutActivity, pharmacists] =
    await Promise.all([
      scalar(`SELECT COUNT(*) AS n FROM organizations`),
      pairs(`SELECT organization_type AS label, COUNT(*) AS count FROM organizations GROUP BY organization_type`),
      pairs(`SELECT status AS label, COUNT(*) AS count FROM organizations GROUP BY status`),
      pairs(
        `SELECT COALESCE(NULLIF(city, ''), 'Unspecified') AS label, COUNT(*) AS count
           FROM organizations GROUP BY COALESCE(NULLIF(city, ''), 'Unspecified') ORDER BY count DESC`
      ),
      databasePool
        .query<RowDataPacket[]>(
          `SELECT o.id, o.name, o.organization_type AS organizationType,
                  SUM(po.professional_role = 'DOCTOR' AND po.status = 'ACTIVE') AS doctors,
                  SUM(po.professional_role = 'PHARMACIST' AND po.status = 'ACTIVE') AS pharmacists,
                  SUM(po.status = 'ACTIVE') AS activeStaff
             FROM organizations o
             LEFT JOIN practitioner_organizations po ON po.organization_id = o.id
            GROUP BY o.id, o.name, o.organization_type
            ORDER BY o.name`
        )
        .then(([rows]) =>
          rows.map((row) => ({
            name: String(row.name),
            type: String(row.organizationType ?? ""),
            doctors: Number(row.doctors ?? 0),
            pharmacists: Number(row.pharmacists ?? 0),
            activeStaff: Number(row.activeStaff ?? 0)
          }))
        ),
      databasePool
        .query<RowDataPacket[]>(
          `SELECT o.name, o.organization_type AS organizationType,
                  COUNT(DISTINCT e.id) AS encounters,
                  COUNT(DISTINCT e.patient_id) AS uniquePatients,
                  COUNT(DISTINCT rx.id) AS prescriptions,
                  COUNT(DISTINCT c.id) AS diagnoses
             FROM organizations o
             LEFT JOIN encounters e
               ON e.organization_id = o.id AND e.status <> 'ENTERED_IN_ERROR' ${start ? "AND e.started_at >= ?" : ""}
             LEFT JOIN prescriptions rx
               ON rx.organization_id = o.id AND rx.status <> 'ENTERED_IN_ERROR' ${start ? "AND COALESCE(rx.issued_at, rx.created_at) >= ?" : ""}
             LEFT JOIN conditions c
               ON c.encounter_id = e.id AND c.verification_status <> 'ENTERED_IN_ERROR'
            GROUP BY o.id, o.name, o.organization_type
            ORDER BY uniquePatients DESC, encounters DESC`,
          start ? [start, start] : []
        )
        .then(([rows]) =>
          rows.map((row) => ({
            name: String(row.name),
            type: String(row.organizationType ?? ""),
            encounters: Number(row.encounters ?? 0),
            uniquePatients: Number(row.uniquePatients ?? 0),
            prescriptions: Number(row.prescriptions ?? 0),
            diagnoses: Number(row.diagnoses ?? 0)
          }))
        ),
      scalar(
        `SELECT COUNT(*) AS n FROM organizations o
          WHERE NOT EXISTS (
            SELECT 1 FROM practitioner_organizations po
             WHERE po.organization_id = o.id AND po.status = 'ACTIVE'
          )`
      ),
      scalar(
        `SELECT COUNT(*) AS n FROM organizations o
          WHERE NOT EXISTS (
            SELECT 1 FROM encounters e
             WHERE e.organization_id = o.id AND e.status <> 'ENTERED_IN_ERROR' ${since("e.started_at", start)}
          )`,
        args(start)
      ),
      databasePool
        .query<RowDataPacket[]>(
          `SELECT CONCAT(p.first_name, ' ', p.last_name) AS name,
                  o.name AS pharmacy,
                  u.status AS status,
                  u.last_login_at AS lastLogin
             FROM practitioners p
             JOIN practitioner_organizations po ON po.practitioner_id = p.id
             JOIN organizations o ON o.id = po.organization_id
             JOIN users u ON u.id = p.user_id
            WHERE po.professional_role = 'PHARMACIST'
              AND po.status = 'ACTIVE'
              AND (po.ended_on IS NULL OR po.ended_on >= UTC_DATE())
            ORDER BY o.name, p.last_name, p.first_name`
        )
        .then(([rows]) =>
          rows.map((row) => ({
            name: String(row.name),
            pharmacy: String(row.pharmacy),
            status: String(row.status ?? ""),
            lastLogin: row.lastLogin ? String(row.lastLogin) : null
          }))
        )
    ]);

  return {
    total,
    byType: byType.map((item) => ({ ...item, label: readableLabel(item.label) })),
    byStatus: byStatus.map((item) => ({ ...item, label: readableLabel(item.label) })),
    byCity,
    staff,
    activity,
    pharmacists,
    withoutActiveStaff: withoutStaff,
    withoutActivity
  };
}

async function securityStats(start: string | null) {
  const [
    totalEvents,
    successful,
    denied,
    failed,
    byRole,
    topActions,
    byMonth,
    doctorActivity,
    adminActivity,
    failedLogins,
    lockedAccounts,
    loggedInRecently,
    neverLoggedIn,
    activeSessions,
    revokedSessions,
    expiredSessions,
    devices,
    failedIps,
    recentSecurity
  ] = await Promise.all([
    scalar(`SELECT COUNT(*) AS n FROM audit_events WHERE 1=1 ${since("event_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM audit_events WHERE result = 'SUCCESS' ${since("event_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM audit_events WHERE result = 'DENIED' ${since("event_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM audit_events WHERE result IN ('FAILED','DENIED') ${since("event_at", start)}`, args(start)),
    pairs(
      `SELECT COALESCE(actor_role_code, 'UNKNOWN') AS label, COUNT(*) AS count
         FROM audit_events WHERE 1=1 ${since("event_at", start)}
        GROUP BY actor_role_code ORDER BY count DESC`,
      args(start)
    ),
    pairs(
      `SELECT action AS label, COUNT(*) AS count FROM audit_events
        WHERE 1=1 ${since("event_at", start)}
        GROUP BY action ORDER BY count DESC LIMIT 15`,
      args(start)
    ),
    pairs(
      `SELECT DATE_FORMAT(event_at, '%Y-%m') AS label, COUNT(*) AS count
         FROM audit_events WHERE 1=1 ${since("event_at", start)}
        GROUP BY DATE_FORMAT(event_at, '%Y-%m') ORDER BY label`,
      args(start)
    ),
    scalar(`SELECT COUNT(*) AS n FROM audit_events WHERE actor_role_code = 'DOCTOR' ${since("event_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM audit_events WHERE actor_role_code = 'ADMIN' ${since("event_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'LOGIN_FAILED' ${since("event_at", start)}`, args(start)),
    scalar(`SELECT COUNT(*) AS n FROM users WHERE status = 'LOCKED'`),
    scalar(`SELECT COUNT(*) AS n FROM users WHERE last_login_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)`),
    scalar(`SELECT COUNT(*) AS n FROM users WHERE last_login_at IS NULL`),
    scalar(`SELECT COUNT(*) AS n FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`),
    scalar(`SELECT COUNT(*) AS n FROM refresh_tokens WHERE revoked_at IS NOT NULL`),
    scalar(`SELECT COUNT(*) AS n FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at <= UTC_TIMESTAMP()`),
    pairs(
      `SELECT COALESCE(NULLIF(device_name, ''), 'Unknown device') AS label, COUNT(*) AS count
         FROM refresh_tokens GROUP BY COALESCE(NULLIF(device_name, ''), 'Unknown device')
        ORDER BY count DESC LIMIT 10`
    ),
    pairs(
      `SELECT COALESCE(ip_address, 'Unknown') AS label, COUNT(*) AS count
         FROM audit_events WHERE result IN ('FAILED','DENIED') ${since("event_at", start)}
        GROUP BY ip_address ORDER BY count DESC LIMIT 10`,
      args(start)
    ),
    databasePool
      .query<RowDataPacket[]>(
        `SELECT action, result, DATE_FORMAT(event_at, '%Y-%m-%d %H:%i') AS eventAt
           FROM audit_events
          WHERE result IN ('FAILED','DENIED')
          ORDER BY event_at DESC LIMIT 12`
      )
      .then(([rows]) =>
        rows.map((row) => ({
          action: String(row.action),
          result: String(row.result),
          eventAt: String(row.eventAt)
        }))
      )
  ]);

  return {
    totalEvents,
    successful,
    denied,
    failed,
    byRole: byRole.map((item) => ({ ...item, label: readableLabel(item.label) })),
    topActions,
    byMonth,
    doctorActivity,
    adminActivity,
    failedLogins,
    lockedAccounts,
    loggedInRecently,
    neverLoggedIn,
    activeSessions,
    revokedSessions,
    expiredSessions,
    devices,
    failedIps,
    recentSecurity
  };
}
