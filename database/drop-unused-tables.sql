-- Drop unused tables and views from existing local databases.
-- Safe to run more than once. Does not touch remaining clinical data.
--
-- Run this as root (or another user with DROP privilege) in MySQL Workbench.
-- The application user ehr_app cannot drop tables.
--
-- If ehr_eprescription_test does not exist, skip Section 2.

-- ============================================================================
-- Section 1. Main database
-- ============================================================================
USE ehr_eprescription;

DROP VIEW IF EXISTS vw_patient_timeline;
DROP VIEW IF EXISTS vw_active_medications;
DROP VIEW IF EXISTS vw_prescription_item_balance;
DROP VIEW IF EXISTS vw_active_prescriptions;
DROP VIEW IF EXISTS vw_current_primary_care;

DROP TABLE IF EXISTS inventory_transactions;
DROP TABLE IF EXISTS dispensing_items;
DROP TABLE IF EXISTS dispensings;
DROP TABLE IF EXISTS pharmacy_inventory_batches;
DROP TABLE IF EXISTS prescription_status_history;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS clinical_notes;
DROP TABLE IF EXISTS vital_signs;
DROP TABLE IF EXISTS patient_history_entries;

SET @fk_exists := (
  SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'encounters'
     AND CONSTRAINT_NAME = 'fk_encounters_appointment'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE encounters DROP FOREIGN KEY fk_encounters_appointment',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'encounters'
     AND INDEX_NAME = 'uq_encounters_appointment'
);

SET @sql := IF(
  @idx_exists > 0,
  'ALTER TABLE encounters DROP INDEX uq_encounters_appointment',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'encounters'
     AND COLUMN_NAME = 'appointment_id'
);

SET @sql := IF(
  @col_exists > 0,
  'ALTER TABLE encounters DROP COLUMN appointment_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS patient_consents;
DROP TABLE IF EXISTS patient_access_grants;
DROP TABLE IF EXISTS patient_care_assignments;

-- ============================================================================
-- Section 2. Test database (skip this block if ehr_eprescription_test does not exist)
-- ============================================================================
USE ehr_eprescription_test;

DROP VIEW IF EXISTS vw_patient_timeline;
DROP VIEW IF EXISTS vw_active_medications;
DROP VIEW IF EXISTS vw_prescription_item_balance;
DROP VIEW IF EXISTS vw_active_prescriptions;
DROP VIEW IF EXISTS vw_current_primary_care;

DROP TABLE IF EXISTS inventory_transactions;
DROP TABLE IF EXISTS dispensing_items;
DROP TABLE IF EXISTS dispensings;
DROP TABLE IF EXISTS pharmacy_inventory_batches;
DROP TABLE IF EXISTS prescription_status_history;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS clinical_notes;
DROP TABLE IF EXISTS vital_signs;
DROP TABLE IF EXISTS patient_history_entries;

SET @fk_exists := (
  SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'encounters'
     AND CONSTRAINT_NAME = 'fk_encounters_appointment'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE encounters DROP FOREIGN KEY fk_encounters_appointment',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'encounters'
     AND INDEX_NAME = 'uq_encounters_appointment'
);

SET @sql := IF(
  @idx_exists > 0,
  'ALTER TABLE encounters DROP INDEX uq_encounters_appointment',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'encounters'
     AND COLUMN_NAME = 'appointment_id'
);

SET @sql := IF(
  @col_exists > 0,
  'ALTER TABLE encounters DROP COLUMN appointment_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS patient_consents;
DROP TABLE IF EXISTS patient_access_grants;
DROP TABLE IF EXISTS patient_care_assignments;
