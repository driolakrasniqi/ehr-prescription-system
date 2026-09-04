-- ============================================================================
-- EHR AND ELECTRONIC-PRESCRIPTION SYSTEM — ACADEMIC CORE DATA MODEL
-- Target platform: MySQL 8.4+ / InnoDB / utf8mb4
-- Scope: Doctor portal, pharmacist lookup, patient portal, and
--        electronic prescriptions.
--
-- Design principles:
--   * Normalized relational model (primarily Third Normal Form)
--   * Foreign-key integrity and CHECK constraints
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
('PHARMACIST', 'Pharmacist', 'Looks up patients and the medications prescribed for them.'),
('PATIENT', 'Patient', 'Views their own health record and electronic prescriptions.');

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
    token_version INT UNSIGNED NOT NULL DEFAULT 0,
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
-- 2. PATIENT PROFILE
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
    sex                     ENUM('FEMALE','MALE') NOT NULL,
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

-- --------------------------------------------------------------------------
-- 3. CLINICAL RECORD
-- --------------------------------------------------------------------------

CREATE TABLE encounters (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    encounter_number    VARCHAR(50) NOT NULL,
    patient_id          BIGINT UNSIGNED NOT NULL,
    doctor_id           BIGINT UNSIGNED NOT NULL,
    organization_id     BIGINT UNSIGNED NOT NULL,
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

-- --------------------------------------------------------------------------
-- 5. AUDITABILITY
-- --------------------------------------------------------------------------

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

-- ============================================================================
-- BUSINESS INVARIANTS THAT MUST BE ENFORCED IN THE NODE/EXPRESS SERVICE LAYER
-- ============================================================================
-- 1. users.role must agree with practitioner professional role and API action.
-- 2. doctor_id may only refer to a doctor.
-- 3. prescription organization must be an active clinic associated with the doctor.
-- 4. an issued prescription and its items can be corrected only by the prescribing doctor.
-- 5. the patient portal may only access the patient row linked to the authenticated user.
-- 6. the application must never write passwords, access tokens, national identifiers,
--    or full medical content into audit logs.
-- ============================================================================
