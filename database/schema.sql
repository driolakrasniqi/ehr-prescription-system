-- ============================================================================
-- EHR AND ELECTRONIC-PRESCRIPTION SYSTEM — ACADEMIC CORE DATA MODEL
-- Target platform: MySQL 8.4+ / InnoDB / utf8mb4
-- Scope: Family doctor portal, pharmacy dispensing portal, patient portal,
--        appointments, longitudinal clinical record, e-prescriptions,
--        basic pharmacy inventory, documents, notifications, and audit trail.
--
-- Design principles:
--   * Normalized relational model (primarily Third Normal Form)
--   * Foreign-key integrity and CHECK constraints
--   * Immutable clinical history through statuses/amendments, not hard deletion
--   * Doctor prescription and pharmacist dispensing are separate records
--   * Sensitive identifiers are encrypted and searched via keyed hash
--   * All timestamps are stored in UTC
-- ============================================================================

CREATE DATABASE IF NOT EXISTS ehr_eprescription
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE ehr_eprescription;
SET time_zone = '+00:00';

-- --------------------------------------------------------------------------
-- 1. IDENTITY, AUTHENTICATION, AND ORGANIZATIONS
-- --------------------------------------------------------------------------

CREATE TABLE roles (
    id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code            VARCHAR(30) NOT NULL,
    name            VARCHAR(80) NOT NULL,
    description     VARCHAR(500) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_code (code),
    UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB;

INSERT INTO roles (code, name, description) VALUES
('ADMIN', 'Administrator', 'Manages accounts, organizations, and system configuration.'),
('DOCTOR', 'Doctor', 'Maintains patient clinical records and issues electronic prescriptions.'),
('PHARMACIST', 'Pharmacist', 'Retrieves valid prescriptions and records medication dispensing.'),
('PATIENT', 'Patient', 'Views their own health record, prescriptions, appointments, and access history.');

CREATE TABLE users (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    role_id             SMALLINT UNSIGNED NOT NULL,
    email               VARCHAR(254) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    display_name        VARCHAR(200) NULL,
    status              ENUM('PENDING','ACTIVE','LOCKED','DISABLED') NOT NULL DEFAULT 'PENDING',
    email_verified_at   DATETIME(3) NULL,
    failed_login_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until        DATETIME(3) NULL,
    last_login_at       DATETIME(3) NULL,
    password_changed_at DATETIME(3) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    KEY ix_users_role_status (role_id, status),
    CONSTRAINT fk_users_role
      FOREIGN KEY (role_id) REFERENCES roles(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    token_hash          BINARY(32) NOT NULL,
    device_name         VARCHAR(150) NULL,
    ip_address          VARCHAR(45) NULL,
    user_agent          VARCHAR(500) NULL,
    expires_at          DATETIME(3) NOT NULL,
    revoked_at          DATETIME(3) NULL,
    replaced_by_token_id BIGINT UNSIGNED NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_refresh_tokens_hash (token_hash),
    KEY ix_refresh_tokens_user_active (user_id, revoked_at, expires_at),
    CONSTRAINT ck_refresh_tokens_expiry CHECK (expires_at > created_at),
    CONSTRAINT fk_refresh_tokens_user
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE CASCADE,
    CONSTRAINT fk_refresh_tokens_replaced_by
      FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens(id)
      ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE organizations (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_code   VARCHAR(40) NOT NULL,
    organization_type   ENUM('CLINIC','PHARMACY','LABORATORY','OTHER') NOT NULL,
    name                VARCHAR(200) NOT NULL,
    license_number      VARCHAR(100) NULL,
    phone               VARCHAR(50) NULL,
    email               VARCHAR(254) NULL,
    address_line1       VARCHAR(250) NULL,
    address_line2       VARCHAR(250) NULL,
    city                VARCHAR(100) NULL,
    postal_code         VARCHAR(20) NULL,
    country_code        CHAR(2) NOT NULL DEFAULT 'XK',
    status              ENUM('PENDING','ACTIVE','SUSPENDED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_organizations_code (organization_code),
    UNIQUE KEY uq_organizations_license (license_number),
    KEY ix_organizations_type_status (organization_type, status)
) ENGINE=InnoDB;

CREATE TABLE practitioners (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    practitioner_number VARCHAR(50) NOT NULL,
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    license_number      VARCHAR(100) NOT NULL,
    specialty           VARCHAR(150) NULL,
    phone               VARCHAR(50) NULL,
    professional_email  VARCHAR(254) NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_practitioners_user (user_id),
    UNIQUE KEY uq_practitioners_number (practitioner_number),
    UNIQUE KEY uq_practitioners_license (license_number),
    KEY ix_practitioners_name (last_name, first_name),
    CONSTRAINT fk_practitioners_user
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE practitioner_organizations (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    practitioner_id     BIGINT UNSIGNED NOT NULL,
    organization_id     BIGINT UNSIGNED NOT NULL,
    professional_role   ENUM('DOCTOR','PHARMACIST') NOT NULL,
    position_title      VARCHAR(150) NULL,
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    started_on          DATE NOT NULL,
    ended_on            DATE NULL,
    status              ENUM('ACTIVE','SUSPENDED','ENDED') NOT NULL DEFAULT 'ACTIVE',
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_practitioner_org_period (practitioner_id, organization_id, started_on),
    KEY ix_practitioner_org_active (organization_id, professional_role, status),
    CONSTRAINT ck_practitioner_org_dates CHECK (ended_on IS NULL OR ended_on >= started_on),
    CONSTRAINT fk_practitioner_org_practitioner
      FOREIGN KEY (practitioner_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_practitioner_org_organization
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 2. PATIENT PROFILE, CARE RELATIONSHIPS, AND PRIVACY
-- --------------------------------------------------------------------------

CREATE TABLE patients (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id                 BIGINT UNSIGNED NULL,
    patient_number          VARCHAR(40) NOT NULL,
    national_id_ciphertext  VARBINARY(512) NULL,
    national_id_hash        BINARY(32) NULL,
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    date_of_birth           DATE NOT NULL,
    sex                     ENUM('FEMALE','MALE','OTHER','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    blood_type              ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    marital_status          ENUM('SINGLE','MARRIED','DIVORCED','WIDOWED','OTHER','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    occupation              VARCHAR(150) NULL,
    smoking_status          ENUM('NEVER','FORMER','CURRENT','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    phone                   VARCHAR(50) NULL,
    email                   VARCHAR(254) NULL,
    address_line1           VARCHAR(250) NULL,
    address_line2           VARCHAR(250) NULL,
    city                    VARCHAR(100) NULL,
    postal_code             VARCHAR(20) NULL,
    country_code            CHAR(2) NOT NULL DEFAULT 'XK',
    profile_photo_key       VARCHAR(500) NULL,
    status                  ENUM('ACTIVE','INACTIVE','DECEASED','MERGED') NOT NULL DEFAULT 'ACTIVE',
    created_by_user_id      BIGINT UNSIGNED NOT NULL,
    updated_by_user_id      BIGINT UNSIGNED NULL,
    created_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                          ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_patients_user (user_id),
    UNIQUE KEY uq_patients_number (patient_number),
    UNIQUE KEY uq_patients_national_hash (national_id_hash),
    KEY ix_patients_name_dob (last_name, first_name, date_of_birth),
    KEY ix_patients_status (status),
    CONSTRAINT fk_patients_user
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_patients_created_by
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_patients_updated_by
      FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE patient_care_assignments (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id          BIGINT UNSIGNED NOT NULL,
    practitioner_id     BIGINT UNSIGNED NOT NULL,
    organization_id     BIGINT UNSIGNED NOT NULL,
    assignment_type     ENUM('PRIMARY_CARE','CARE_TEAM') NOT NULL DEFAULT 'CARE_TEAM',
    started_on          DATE NOT NULL,
    ended_on            DATE NULL,
    status              ENUM('ACTIVE','ENDED') NOT NULL DEFAULT 'ACTIVE',
    assigned_by_user_id BIGINT UNSIGNED NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_patient_care_period (patient_id, practitioner_id, assignment_type, started_on),
    KEY ix_patient_care_current (patient_id, assignment_type, status, ended_on),
    CONSTRAINT ck_patient_care_dates CHECK (ended_on IS NULL OR ended_on >= started_on),
    CONSTRAINT fk_patient_care_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_patient_care_practitioner
      FOREIGN KEY (practitioner_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_patient_care_organization
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_patient_care_assigned_by
      FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE patient_access_grants (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id          BIGINT UNSIGNED NOT NULL,
    granted_to_user_id  BIGINT UNSIGNED NOT NULL,
    access_level        ENUM('SUMMARY','CLINICAL','PRESCRIPTIONS','FULL') NOT NULL,
    purpose             VARCHAR(500) NOT NULL,
    valid_from          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    valid_until         DATETIME(3) NULL,
    granted_by_user_id  BIGINT UNSIGNED NOT NULL,
    revoked_at          DATETIME(3) NULL,
    revoked_by_user_id  BIGINT UNSIGNED NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_access_grants_patient_active (patient_id, revoked_at, valid_until),
    KEY ix_access_grants_user_active (granted_to_user_id, revoked_at, valid_until),
    CONSTRAINT ck_access_grants_dates CHECK (valid_until IS NULL OR valid_until >= valid_from),
    CONSTRAINT fk_access_grants_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_access_grants_user
      FOREIGN KEY (granted_to_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_access_grants_granted_by
      FOREIGN KEY (granted_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_access_grants_revoked_by
      FOREIGN KEY (revoked_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE patient_consents (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id          BIGINT UNSIGNED NOT NULL,
    consent_type        ENUM('TREATMENT','DATA_SHARING','PATIENT_PORTAL','RESEARCH','OTHER') NOT NULL,
    status              ENUM('DRAFT','ACTIVE','REJECTED','REVOKED','EXPIRED') NOT NULL DEFAULT 'DRAFT',
    scope_json          JSON NULL,
    granted_at          DATETIME(3) NULL,
    valid_until         DATETIME(3) NULL,
    revoked_at          DATETIME(3) NULL,
    recorded_by_user_id BIGINT UNSIGNED NOT NULL,
    notes               VARCHAR(1000) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_patient_consents_active (patient_id, consent_type, status, valid_until),
    CONSTRAINT ck_patient_consents_dates CHECK (valid_until IS NULL OR granted_at IS NULL OR valid_until >= granted_at),
    CONSTRAINT fk_patient_consents_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_patient_consents_recorded_by
      FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 3. APPOINTMENTS AND LONGITUDINAL CLINICAL RECORD
-- --------------------------------------------------------------------------

CREATE TABLE appointments (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    appointment_number  VARCHAR(50) NOT NULL,
    patient_id          BIGINT UNSIGNED NOT NULL,
    practitioner_id     BIGINT UNSIGNED NOT NULL,
    organization_id     BIGINT UNSIGNED NOT NULL,
    scheduled_start     DATETIME(3) NOT NULL,
    scheduled_end       DATETIME(3) NOT NULL,
    appointment_type    ENUM('CONSULTATION','FOLLOW_UP','PREVENTIVE','OTHER') NOT NULL DEFAULT 'CONSULTATION',
    status              ENUM('BOOKED','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'BOOKED',
    reason              VARCHAR(1000) NULL,
    cancellation_reason VARCHAR(500) NULL,
    created_by_user_id  BIGINT UNSIGNED NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_appointments_number (appointment_number),
    KEY ix_appointments_patient_date (patient_id, scheduled_start),
    KEY ix_appointments_practitioner_date (practitioner_id, scheduled_start),
    CONSTRAINT ck_appointments_dates CHECK (scheduled_end > scheduled_start),
    CONSTRAINT fk_appointments_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_appointments_practitioner
      FOREIGN KEY (practitioner_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_appointments_organization
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_appointments_created_by
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE encounters (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    encounter_number    VARCHAR(50) NOT NULL,
    patient_id          BIGINT UNSIGNED NOT NULL,
    doctor_id           BIGINT UNSIGNED NOT NULL,
    organization_id     BIGINT UNSIGNED NOT NULL,
    appointment_id      BIGINT UNSIGNED NULL,
    encounter_type      ENUM('CONSULTATION','FOLLOW_UP','PREVENTIVE','EMERGENCY','OTHER') NOT NULL,
    started_at          DATETIME(3) NOT NULL,
    ended_at            DATETIME(3) NULL,
    chief_complaint     VARCHAR(1000) NULL,
    symptoms            TEXT NULL,
    examination_findings TEXT NULL,
    assessment_summary  TEXT NULL,
    plan_summary        TEXT NULL,
    status              ENUM('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED','ENTERED_IN_ERROR') NOT NULL DEFAULT 'IN_PROGRESS',
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_encounters_number (encounter_number),
    UNIQUE KEY uq_encounters_appointment (appointment_id),
    KEY ix_encounters_patient_date (patient_id, started_at),
    KEY ix_encounters_doctor_date (doctor_id, started_at),
    CONSTRAINT ck_encounters_dates CHECK (ended_at IS NULL OR ended_at >= started_at),
    CONSTRAINT fk_encounters_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_encounters_doctor
      FOREIGN KEY (doctor_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_encounters_organization
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_encounters_appointment
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
      ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE patient_history_entries (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id          BIGINT UNSIGNED NOT NULL,
    encounter_id        BIGINT UNSIGNED NULL,
    history_type        ENUM('MEDICAL','SURGICAL','FAMILY','SOCIAL','IMMUNIZATION','OTHER') NOT NULL,
    title               VARCHAR(200) NOT NULL,
    description         TEXT NOT NULL,
    occurred_on         DATE NULL,
    status              ENUM('ACTIVE','RESOLVED','HISTORICAL','ENTERED_IN_ERROR') NOT NULL DEFAULT 'HISTORICAL',
    recorded_by_practitioner_id BIGINT UNSIGNED NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_history_patient_type_date (patient_id, history_type, occurred_on),
    CONSTRAINT fk_history_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_history_encounter
      FOREIGN KEY (encounter_id) REFERENCES encounters(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_history_recorded_by
      FOREIGN KEY (recorded_by_practitioner_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE conditions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id          BIGINT UNSIGNED NOT NULL,
    encounter_id        BIGINT UNSIGNED NULL,
    recorded_by_practitioner_id BIGINT UNSIGNED NOT NULL,
    code_system         VARCHAR(80) NULL,
    condition_code      VARCHAR(80) NULL,
    condition_name      VARCHAR(200) NOT NULL,
    category            ENUM('DIAGNOSIS','PROBLEM','CHRONIC_CONDITION') NOT NULL DEFAULT 'DIAGNOSIS',
    clinical_status     ENUM('ACTIVE','RECURRENCE','RELAPSE','INACTIVE','REMISSION','RESOLVED') NOT NULL DEFAULT 'ACTIVE',
    verification_status ENUM('PROVISIONAL','DIFFERENTIAL','CONFIRMED','REFUTED','ENTERED_IN_ERROR') NOT NULL DEFAULT 'CONFIRMED',
    severity            ENUM('MILD','MODERATE','SEVERE','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    onset_date          DATE NULL,
    resolved_date       DATE NULL,
    diagnosed_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    notes               TEXT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_conditions_patient_status (patient_id, clinical_status, diagnosed_at),
    KEY ix_conditions_code (code_system, condition_code),
    CONSTRAINT ck_conditions_dates CHECK (resolved_date IS NULL OR onset_date IS NULL OR resolved_date >= onset_date),
    CONSTRAINT fk_conditions_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_conditions_encounter
      FOREIGN KEY (encounter_id) REFERENCES encounters(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_conditions_recorded_by
      FOREIGN KEY (recorded_by_practitioner_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE allergies (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id          BIGINT UNSIGNED NOT NULL,
    encounter_id        BIGINT UNSIGNED NULL,
    recorded_by_practitioner_id BIGINT UNSIGNED NOT NULL,
    substance           VARCHAR(200) NOT NULL,
    allergy_type        ENUM('ALLERGY','INTOLERANCE','UNKNOWN') NOT NULL DEFAULT 'ALLERGY',
    category            ENUM('MEDICATION','FOOD','ENVIRONMENT','BIOLOGIC','OTHER') NOT NULL,
    criticality         ENUM('LOW','HIGH','UNABLE_TO_ASSESS') NOT NULL DEFAULT 'UNABLE_TO_ASSESS',
    severity            ENUM('MILD','MODERATE','SEVERE','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    reaction_description VARCHAR(500) NULL,
    clinical_status     ENUM('ACTIVE','INACTIVE','RESOLVED','ENTERED_IN_ERROR') NOT NULL DEFAULT 'ACTIVE',
    verification_status ENUM('UNCONFIRMED','PRESUMED','CONFIRMED','REFUTED','ENTERED_IN_ERROR') NOT NULL DEFAULT 'UNCONFIRMED',
    onset_date          DATE NULL,
    notes               TEXT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_allergies_patient_status (patient_id, clinical_status),
    KEY ix_allergies_substance (substance),
    CONSTRAINT fk_allergies_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_allergies_encounter
      FOREIGN KEY (encounter_id) REFERENCES encounters(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_allergies_recorded_by
      FOREIGN KEY (recorded_by_practitioner_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE vital_signs (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id          BIGINT UNSIGNED NOT NULL,
    encounter_id        BIGINT UNSIGNED NOT NULL,
    recorded_by_practitioner_id BIGINT UNSIGNED NOT NULL,
    measured_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    systolic_bp         SMALLINT UNSIGNED NULL,
    diastolic_bp        SMALLINT UNSIGNED NULL,
    heart_rate_bpm      SMALLINT UNSIGNED NULL,
    respiratory_rate_bpm SMALLINT UNSIGNED NULL,
    temperature_c       DECIMAL(4,1) NULL,
    oxygen_saturation_pct DECIMAL(5,2) NULL,
    height_cm           DECIMAL(6,2) NULL,
    weight_kg           DECIMAL(6,2) NULL,
    notes               VARCHAR(500) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_vitals_patient_date (patient_id, measured_at),
    CONSTRAINT ck_vitals_bp CHECK (
      (systolic_bp IS NULL AND diastolic_bp IS NULL)
      OR (systolic_bp BETWEEN 40 AND 300 AND diastolic_bp BETWEEN 20 AND 200 AND systolic_bp > diastolic_bp)
    ),
    CONSTRAINT ck_vitals_heart_rate CHECK (heart_rate_bpm IS NULL OR heart_rate_bpm BETWEEN 20 AND 300),
    CONSTRAINT ck_vitals_respiratory_rate CHECK (respiratory_rate_bpm IS NULL OR respiratory_rate_bpm BETWEEN 1 AND 100),
    CONSTRAINT ck_vitals_temperature CHECK (temperature_c IS NULL OR temperature_c BETWEEN 25.0 AND 50.0),
    CONSTRAINT ck_vitals_oxygen CHECK (oxygen_saturation_pct IS NULL OR oxygen_saturation_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_vitals_height CHECK (height_cm IS NULL OR height_cm BETWEEN 20 AND 300),
    CONSTRAINT ck_vitals_weight CHECK (weight_kg IS NULL OR weight_kg BETWEEN 0.1 AND 1000),
    CONSTRAINT fk_vitals_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_vitals_encounter
      FOREIGN KEY (encounter_id) REFERENCES encounters(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_vitals_recorded_by
      FOREIGN KEY (recorded_by_practitioner_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE clinical_notes (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id          BIGINT UNSIGNED NOT NULL,
    encounter_id        BIGINT UNSIGNED NULL,
    author_practitioner_id BIGINT UNSIGNED NOT NULL,
    note_type           ENUM('PROGRESS','CONSULTATION','DISCHARGE','PRIVATE','OTHER') NOT NULL DEFAULT 'PROGRESS',
    title               VARCHAR(200) NULL,
    note_text           MEDIUMTEXT NOT NULL,
    visibility          ENUM('CARE_TEAM','DOCTOR_ONLY','PATIENT_VISIBLE') NOT NULL DEFAULT 'CARE_TEAM',
    status              ENUM('FINAL','AMENDED','ENTERED_IN_ERROR') NOT NULL DEFAULT 'FINAL',
    supersedes_note_id  BIGINT UNSIGNED NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_notes_patient_date (patient_id, created_at),
    KEY ix_notes_encounter (encounter_id),
    CONSTRAINT fk_notes_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_notes_encounter
      FOREIGN KEY (encounter_id) REFERENCES encounters(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_notes_author
      FOREIGN KEY (author_practitioner_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_notes_supersedes
      FOREIGN KEY (supersedes_note_id) REFERENCES clinical_notes(id)
      ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 4. MEDICATION CATALOGUE AND ELECTRONIC PRESCRIPTIONS
-- --------------------------------------------------------------------------

CREATE TABLE medications (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    medication_code     VARCHAR(80) NOT NULL,
    generic_name        VARCHAR(200) NOT NULL,
    brand_name          VARCHAR(200) NULL,
    active_ingredient_text VARCHAR(500) NOT NULL,
    strength            VARCHAR(100) NOT NULL,
    dosage_form         VARCHAR(100) NOT NULL,
    default_route       VARCHAR(100) NULL,
    atc_code            VARCHAR(20) NULL,
    manufacturer        VARCHAR(200) NULL,
    barcode             VARCHAR(80) NULL,
    prescription_only   BOOLEAN NOT NULL DEFAULT TRUE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_medications_code (medication_code),
    UNIQUE KEY uq_medications_barcode (barcode),
    KEY ix_medications_search (generic_name, brand_name),
    KEY ix_medications_atc (atc_code)
) ENGINE=InnoDB;

CREATE TABLE prescriptions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    prescription_number VARCHAR(60) NOT NULL,
    patient_id          BIGINT UNSIGNED NOT NULL,
    doctor_id           BIGINT UNSIGNED NOT NULL,
    encounter_id        BIGINT UNSIGNED NULL,
    organization_id     BIGINT UNSIGNED NOT NULL,
    status              ENUM('DRAFT','ISSUED','PARTIALLY_DISPENSED','FULLY_DISPENSED','CANCELLED','EXPIRED','ENTERED_IN_ERROR') NOT NULL DEFAULT 'DRAFT',
    clinical_reason     VARCHAR(500) NULL,
    notes_to_pharmacist TEXT NULL,
    valid_until         DATETIME(3) NULL,
    qr_token_hash       BINARY(32) NULL,
    signature_method    ENUM('ACCOUNT_CONFIRMATION','DIGITAL_CERTIFICATE','OTHER') NULL,
    signature_reference VARCHAR(255) NULL,
    signed_at           DATETIME(3) NULL,
    issued_at           DATETIME(3) NULL,
    cancelled_at        DATETIME(3) NULL,
    cancellation_reason VARCHAR(500) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_prescriptions_number (prescription_number),
    UNIQUE KEY uq_prescriptions_qr_hash (qr_token_hash),
    KEY ix_prescriptions_patient_status (patient_id, status, issued_at),
    KEY ix_prescriptions_doctor_date (doctor_id, issued_at),
    KEY ix_prescriptions_validity (status, valid_until),
    CONSTRAINT ck_prescription_validity CHECK (valid_until IS NULL OR issued_at IS NULL OR valid_until >= issued_at),
    CONSTRAINT ck_prescription_signature CHECK (
      (status = 'DRAFT')
      OR (issued_at IS NOT NULL AND signed_at IS NOT NULL AND signature_method IS NOT NULL)
    ),
    CONSTRAINT fk_prescriptions_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_prescriptions_doctor
      FOREIGN KEY (doctor_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_prescriptions_encounter
      FOREIGN KEY (encounter_id) REFERENCES encounters(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_prescriptions_organization
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE prescription_items (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    prescription_id     BIGINT UNSIGNED NOT NULL,
    line_number         SMALLINT UNSIGNED NOT NULL,
    medication_id       BIGINT UNSIGNED NOT NULL,
    medication_name_snapshot VARCHAR(300) NOT NULL,
    strength_snapshot   VARCHAR(100) NOT NULL,
    dosage_form_snapshot VARCHAR(100) NOT NULL,
    dose_value          DECIMAL(12,4) NULL,
    dose_unit           VARCHAR(50) NULL,
    route               VARCHAR(100) NULL,
    frequency_per_day   DECIMAL(6,2) NULL,
    frequency_text      VARCHAR(200) NOT NULL,
    as_needed           BOOLEAN NOT NULL DEFAULT FALSE,
    duration_value      DECIMAL(8,2) NULL,
    duration_unit       ENUM('DAY','WEEK','MONTH','UNTIL_FINISHED','AS_NEEDED') NULL,
    quantity_prescribed DECIMAL(12,3) NOT NULL,
    quantity_unit       VARCHAR(50) NOT NULL,
    repeats_allowed     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    substitution_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    instructions        TEXT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_prescription_item_line (prescription_id, line_number),
    KEY ix_prescription_items_medication (medication_id),
    CONSTRAINT ck_prescription_item_line CHECK (line_number > 0),
    CONSTRAINT ck_prescription_item_dose CHECK (dose_value IS NULL OR dose_value > 0),
    CONSTRAINT ck_prescription_item_frequency CHECK (frequency_per_day IS NULL OR frequency_per_day > 0),
    CONSTRAINT ck_prescription_item_duration CHECK (duration_value IS NULL OR duration_value > 0),
    CONSTRAINT ck_prescription_item_quantity CHECK (quantity_prescribed > 0),
    CONSTRAINT fk_prescription_items_prescription
      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_prescription_items_medication
      FOREIGN KEY (medication_id) REFERENCES medications(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE prescription_status_history (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    prescription_id     BIGINT UNSIGNED NOT NULL,
    previous_status     ENUM('DRAFT','ISSUED','PARTIALLY_DISPENSED','FULLY_DISPENSED','CANCELLED','EXPIRED','ENTERED_IN_ERROR') NULL,
    new_status          ENUM('DRAFT','ISSUED','PARTIALLY_DISPENSED','FULLY_DISPENSED','CANCELLED','EXPIRED','ENTERED_IN_ERROR') NOT NULL,
    changed_by_user_id  BIGINT UNSIGNED NOT NULL,
    reason              VARCHAR(500) NULL,
    changed_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_rx_status_history (prescription_id, changed_at),
    CONSTRAINT fk_rx_status_history_prescription
      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_rx_status_history_user
      FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 5. PHARMACY INVENTORY AND DISPENSING
-- --------------------------------------------------------------------------

CREATE TABLE pharmacy_inventory_batches (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    pharmacy_id         BIGINT UNSIGNED NOT NULL,
    medication_id       BIGINT UNSIGNED NOT NULL,
    batch_number        VARCHAR(100) NOT NULL,
    expiration_date     DATE NOT NULL,
    quantity_on_hand    DECIMAL(14,3) NOT NULL DEFAULT 0,
    quantity_unit       VARCHAR(50) NOT NULL,
    reorder_level       DECIMAL(14,3) NOT NULL DEFAULT 0,
    status              ENUM('AVAILABLE','QUARANTINED','EXPIRED','RECALLED','DEPLETED') NOT NULL DEFAULT 'AVAILABLE',
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_inventory_batch (pharmacy_id, medication_id, batch_number),
    KEY ix_inventory_expiry (pharmacy_id, status, expiration_date),
    KEY ix_inventory_medication (pharmacy_id, medication_id, status),
    CONSTRAINT ck_inventory_quantity CHECK (quantity_on_hand >= 0),
    CONSTRAINT ck_inventory_reorder CHECK (reorder_level >= 0),
    CONSTRAINT fk_inventory_pharmacy
      FOREIGN KEY (pharmacy_id) REFERENCES organizations(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_medication
      FOREIGN KEY (medication_id) REFERENCES medications(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE dispensings (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dispensing_number   VARCHAR(60) NOT NULL,
    prescription_id     BIGINT UNSIGNED NOT NULL,
    pharmacist_id       BIGINT UNSIGNED NOT NULL,
    pharmacy_id         BIGINT UNSIGNED NOT NULL,
    status              ENUM('IN_PROGRESS','COMPLETED','REVERSED','ENTERED_IN_ERROR') NOT NULL DEFAULT 'IN_PROGRESS',
    dispensed_at        DATETIME(3) NULL,
    notes               TEXT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_dispensings_number (dispensing_number),
    KEY ix_dispensings_prescription (prescription_id, created_at),
    KEY ix_dispensings_pharmacy_date (pharmacy_id, dispensed_at),
    CONSTRAINT ck_dispensings_completed_at CHECK (status <> 'COMPLETED' OR dispensed_at IS NOT NULL),
    CONSTRAINT fk_dispensings_prescription
      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_dispensings_pharmacist
      FOREIGN KEY (pharmacist_id) REFERENCES practitioners(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_dispensings_pharmacy
      FOREIGN KEY (pharmacy_id) REFERENCES organizations(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE dispensing_items (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dispensing_id       BIGINT UNSIGNED NOT NULL,
    line_number         SMALLINT UNSIGNED NOT NULL,
    prescription_item_id BIGINT UNSIGNED NOT NULL,
    dispensed_medication_id BIGINT UNSIGNED NOT NULL,
    inventory_batch_id  BIGINT UNSIGNED NULL,
    quantity_dispensed  DECIMAL(12,3) NOT NULL,
    quantity_unit       VARCHAR(50) NOT NULL,
    batch_number_snapshot VARCHAR(100) NULL,
    expiration_date_snapshot DATE NULL,
    substitution_made   BOOLEAN NOT NULL DEFAULT FALSE,
    substitution_reason VARCHAR(500) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_dispensing_item_line (dispensing_id, line_number),
    KEY ix_dispensing_items_rx_item (prescription_item_id),
    KEY ix_dispensing_items_inventory_batch (inventory_batch_id),
    CONSTRAINT ck_dispensing_item_line CHECK (line_number > 0),
    CONSTRAINT ck_dispensing_item_quantity CHECK (quantity_dispensed > 0),
    CONSTRAINT ck_dispensing_substitution CHECK (
      substitution_made = FALSE OR substitution_reason IS NOT NULL
    ),
    CONSTRAINT fk_dispensing_items_dispensing
      FOREIGN KEY (dispensing_id) REFERENCES dispensings(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_dispensing_items_rx_item
      FOREIGN KEY (prescription_item_id) REFERENCES prescription_items(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_dispensing_items_medication
      FOREIGN KEY (dispensed_medication_id) REFERENCES medications(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_dispensing_items_inventory_batch
      FOREIGN KEY (inventory_batch_id) REFERENCES pharmacy_inventory_batches(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE inventory_transactions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    inventory_batch_id  BIGINT UNSIGNED NOT NULL,
    dispensing_item_id  BIGINT UNSIGNED NULL,
    transaction_type    ENUM('RECEIPT','DISPENSE','RETURN','ADJUSTMENT','EXPIRED','RECALLED') NOT NULL,
    quantity_delta      DECIMAL(14,3) NOT NULL,
    performed_by_user_id BIGINT UNSIGNED NOT NULL,
    reason              VARCHAR(500) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_inventory_transactions_batch_date (inventory_batch_id, created_at),
    KEY ix_inventory_transactions_dispensing_item (dispensing_item_id),
    CONSTRAINT ck_inventory_transaction_nonzero CHECK (quantity_delta <> 0),
    CONSTRAINT fk_inventory_transactions_batch
      FOREIGN KEY (inventory_batch_id) REFERENCES pharmacy_inventory_batches(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_transactions_dispensing_item
      FOREIGN KEY (dispensing_item_id) REFERENCES dispensing_items(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_inventory_transactions_user
      FOREIGN KEY (performed_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 6. DOCUMENTS, NOTIFICATIONS, AND AUDITABILITY
-- --------------------------------------------------------------------------

CREATE TABLE documents (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id          BIGINT UNSIGNED NOT NULL,
    encounter_id        BIGINT UNSIGNED NULL,
    prescription_id     BIGINT UNSIGNED NULL,
    document_type       ENUM('LAB_REPORT','REFERRAL','IMAGING','PRESCRIPTION_PDF','CONSENT','OTHER') NOT NULL,
    title               VARCHAR(255) NOT NULL,
    description         VARCHAR(1000) NULL,
    original_filename   VARCHAR(255) NOT NULL,
    storage_key VARCHAR(1000) 
    CHARACTER SET ascii 
    COLLATE ascii_bin 
    NOT NULL,
    mime_type           VARCHAR(150) NOT NULL,
    file_size_bytes     BIGINT UNSIGNED NOT NULL,
    sha256_hash         BINARY(32) NOT NULL,
    document_date       DATE NULL,
    visibility          ENUM('CARE_TEAM','DOCTOR_ONLY','PATIENT_VISIBLE') NOT NULL DEFAULT 'CARE_TEAM',
    uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_documents_storage_key (storage_key),
    KEY ix_documents_patient_type_date (patient_id, document_type, document_date),
    CONSTRAINT ck_documents_size CHECK (file_size_bytes > 0),
    CONSTRAINT fk_documents_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_documents_encounter
      FOREIGN KEY (encounter_id) REFERENCES encounters(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_documents_prescription
      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_documents_uploaded_by
      FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE notifications (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    notification_type   ENUM('APPOINTMENT','PRESCRIPTION_ISSUED','PRESCRIPTION_DISPENSED','DOCUMENT_AVAILABLE','ACCESS_ALERT','SYSTEM') NOT NULL,
    title               VARCHAR(200) NOT NULL,
    message             VARCHAR(1000) NOT NULL,
    related_entity_type VARCHAR(50) NULL,
    related_entity_id   BIGINT UNSIGNED NULL,
    read_at             DATETIME(3) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_notifications_user_unread (user_id, read_at, created_at),
    CONSTRAINT fk_notifications_user
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE audit_events (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id       BIGINT UNSIGNED NULL,
    actor_role_code     VARCHAR(30) NULL,
    organization_id     BIGINT UNSIGNED NULL,
    patient_id          BIGINT UNSIGNED NULL,
    action              VARCHAR(80) NOT NULL,
    entity_type         VARCHAR(80) NOT NULL,
    entity_id           BIGINT UNSIGNED NULL,
    purpose             VARCHAR(500) NULL,
    result              ENUM('SUCCESS','DENIED','FAILED') NOT NULL,
    ip_address          VARCHAR(45) NULL,
    user_agent          VARCHAR(500) NULL,
    correlation_id      VARCHAR(100) NULL,
    metadata_json       JSON NULL,
    event_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_audit_patient_date (patient_id, event_at),
    KEY ix_audit_actor_date (actor_user_id, event_at),
    KEY ix_audit_entity (entity_type, entity_id, event_at),
    KEY ix_audit_correlation (correlation_id),
    CONSTRAINT fk_audit_actor
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_audit_organization
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_audit_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id)
      ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 7. READ-OPTIMIZED VIEWS FOR THE INTERFACES SHOWN IN THE DESIGN
-- --------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_current_primary_care AS
SELECT
    pca.patient_id,
    pca.practitioner_id,
    pca.organization_id,
    pca.started_on
FROM patient_care_assignments pca
WHERE pca.assignment_type = 'PRIMARY_CARE'
  AND pca.status = 'ACTIVE'
  AND (pca.ended_on IS NULL OR pca.ended_on >= CURRENT_DATE());

CREATE OR REPLACE VIEW vw_active_prescriptions AS
SELECT
    p.id,
    p.prescription_number,
    p.patient_id,
    p.doctor_id,
    p.organization_id,
    p.status,
    p.issued_at,
    p.valid_until
FROM prescriptions p
WHERE p.status IN ('ISSUED','PARTIALLY_DISPENSED')
  AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_TIMESTAMP());

CREATE OR REPLACE VIEW vw_prescription_item_balance AS
SELECT
    pi.id AS prescription_item_id,
    pi.prescription_id,
    pi.medication_id,
    pi.medication_name_snapshot,
    pi.quantity_prescribed,
    pi.quantity_unit,
    pi.repeats_allowed,
    (pi.quantity_prescribed * (pi.repeats_allowed + 1)) AS total_authorized_quantity,
    COALESCE(SUM(CASE WHEN d.status = 'COMPLETED' THEN di.quantity_dispensed ELSE 0 END), 0) AS quantity_dispensed,
    GREATEST(
      (pi.quantity_prescribed * (pi.repeats_allowed + 1)) -
      COALESCE(SUM(CASE WHEN d.status = 'COMPLETED' THEN di.quantity_dispensed ELSE 0 END), 0),
      0
    ) AS quantity_remaining
FROM prescription_items pi
LEFT JOIN dispensing_items di ON di.prescription_item_id = pi.id
LEFT JOIN dispensings d ON d.id = di.dispensing_id
GROUP BY
    pi.id,
    pi.prescription_id,
    pi.medication_id,
    pi.medication_name_snapshot,
    pi.quantity_prescribed,
    pi.quantity_unit,
    pi.repeats_allowed;

CREATE OR REPLACE VIEW vw_active_medications AS
SELECT
    p.patient_id,
    p.id AS prescription_id,
    p.prescription_number,
    pi.id AS prescription_item_id,
    pi.medication_id,
    pi.medication_name_snapshot,
    pi.strength_snapshot,
    pi.dosage_form_snapshot,
    pi.frequency_text,
    pi.instructions,
    p.issued_at,
    p.valid_until,
    p.status
FROM prescriptions p
JOIN prescription_items pi ON pi.prescription_id = p.id
WHERE p.status IN ('ISSUED','PARTIALLY_DISPENSED')
  AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_TIMESTAMP());

CREATE OR REPLACE VIEW vw_patient_timeline AS
SELECT
    e.patient_id,
    e.started_at AS event_at,
    'ENCOUNTER' AS event_type,
    e.id AS entity_id,
    COALESCE(e.chief_complaint, 'Clinical encounter') AS title,
    e.status AS event_status
FROM encounters e
UNION ALL
SELECT
    p.patient_id,
    p.issued_at AS event_at,
    'PRESCRIPTION' AS event_type,
    p.id AS entity_id,
    CONCAT('Prescription ', p.prescription_number) AS title,
    p.status AS event_status
FROM prescriptions p
WHERE p.issued_at IS NOT NULL
UNION ALL
SELECT
    p.patient_id,
    d.dispensed_at AS event_at,
    'DISPENSING' AS event_type,
    d.id AS entity_id,
    CONCAT('Dispensing ', d.dispensing_number) AS title,
    d.status AS event_status
FROM dispensings d
JOIN prescriptions p ON p.id = d.prescription_id
WHERE d.dispensed_at IS NOT NULL
UNION ALL
SELECT
    a.patient_id,
    a.scheduled_start AS event_at,
    'APPOINTMENT' AS event_type,
    a.id AS entity_id,
    COALESCE(a.reason, 'Appointment') AS title,
    a.status AS event_status
FROM appointments a;

-- ============================================================================
-- BUSINESS INVARIANTS THAT MUST BE ENFORCED IN THE NODE/EXPRESS SERVICE LAYER
-- ============================================================================
-- 1. users.role must agree with practitioner professional role and API action.
-- 2. doctor_id may only refer to a doctor; pharmacist_id may only refer to a pharmacist.
-- 3. prescription organization must be an active clinic associated with the doctor.
-- 4. dispensing pharmacy must be an active pharmacy associated with the pharmacist.
-- 5. pharmacy lookup must require prescription token/patient verification and be audited.
-- 6. an issued prescription and its items cannot be edited; corrections create a new record
--    or use ENTERED_IN_ERROR with status history.
-- 7. dispensing quantity cannot exceed vw_prescription_item_balance.quantity_remaining.
-- 8. prescription, dispensing, inventory decrement, status history, notification, and audit
--    writes must execute in a single InnoDB transaction with locking reads (FOR UPDATE).
-- 9. the inventory batch must belong to the dispensing pharmacy and medication.
-- 10. the patient portal may only access the patient row linked to the authenticated user.
-- 11. the application must never write passwords, access tokens, national identifiers,
--     prescription QR secrets, or full medical content into audit logs.
-- ============================================================================