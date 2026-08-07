Academic MySQL Data Model — EHR and Electronic-Prescription System

1. Final scope

This model supports a centralized health-information platform in which:

Family doctors manage patient profiles, appointments, encounters, histories, conditions, allergies, vital signs, notes, and electronic prescriptions.

Pharmacists securely retrieve valid prescriptions, see dispensing-relevant patient information, dispense medicines, and update pharmacy stock.

Patients view their own longitudinal health record, upcoming appointments, prescriptions, documents, notifications, and access history.

Administrators manage accounts and organizations without automatically receiving unrestricted clinical access.

The schema intentionally focuses on the thesis's central workflow instead of attempting to reproduce a national EHR.

2. Final size and balance

The final academic core has 28 tables and 5 views.

This is a deliberate middle ground:

The earlier 64-table version was too large for a solo thesis prototype.

The 23-table version omitted several concepts visible in the interface, especially appointments, historical primary-care assignments, practitioner membership in multiple organizations, consent, and pharmacy inventory traceability.

A single “general medical record” table would weaken referential integrity, reporting, auditability, and normalization.

3. Interface-to-database mapping

Interface element

Main database source

Doctor, pharmacist, patient, administrator users

roles, users

Clinic or pharmacy identity

organizations

Doctor/pharmacist profile and license

practitioners

Professional works at clinic/pharmacy

practitioner_organizations

Patient card and profile

patients

Primary-care doctor and “since” date

patient_care_assignments

Upcoming appointments

appointments

Recent encounters

encounters

Medical and social history

patient_history_entries

Diagnoses/chronic conditions

conditions

Allergies and reactions

allergies

Latest vital signs and BMI display

vital_signs; BMI calculated by API/query

Doctor notes

clinical_notes

Medication catalogue

medications

Digital prescription header

prescriptions

Prescription medication rows

prescription_items

Partially/fully dispensed status

prescription_status_history, dispensings, dispensing_items

Quantity prescribed, dispensed, remaining

vw_prescription_item_balance

Pharmacy inventory

pharmacy_inventory_batches, inventory_transactions

Documents and generated prescription PDF

documents

Patient notifications

notifications

“Who accessed my record?”

audit_events

Health timeline

vw_patient_timeline

Reports

SQL views and reporting queries, not a separate clinical table

4. Table groups

Identity and organizations — 6 tables

roles

users

refresh_tokens

organizations

practitioners

practitioner_organizations

Patient profile, care, and privacy — 4 tables

patients

patient_care_assignments

patient_access_grants

patient_consents

Appointments and clinical record — 7 tables

appointments

encounters

patient_history_entries

conditions

allergies

vital_signs

clinical_notes

Prescription and pharmacy workflow — 8 tables

medications

prescriptions

prescription_items

prescription_status_history

pharmacy_inventory_batches

dispensings

dispensing_items

inventory_transactions

Documents, communication, and accountability — 3 tables

documents

notifications

audit_events

5. High-level relationship model

erDiagram
    ROLES ||--o{ USERS : classifies
    USERS ||--o| PRACTITIONERS : has
    USERS ||--o| PATIENTS : portal_account
    USERS ||--o{ REFRESH_TOKENS : owns

    PRACTITIONERS ||--o{ PRACTITIONER_ORGANIZATIONS : works_at
    ORGANIZATIONS ||--o{ PRACTITIONER_ORGANIZATIONS : employs

    PATIENTS ||--o{ PATIENT_CARE_ASSIGNMENTS : receives_care_from
    PRACTITIONERS ||--o{ PATIENT_CARE_ASSIGNMENTS : assigned_to

    PATIENTS ||--o{ APPOINTMENTS : books
    PRACTITIONERS ||--o{ APPOINTMENTS : attends
    APPOINTMENTS ||--o| ENCOUNTERS : becomes

    PATIENTS ||--o{ ENCOUNTERS : has
    PRACTITIONERS ||--o{ ENCOUNTERS : conducts
    ENCOUNTERS ||--o{ CONDITIONS : records
    ENCOUNTERS ||--o{ ALLERGIES : records
    ENCOUNTERS ||--o{ VITAL_SIGNS : measures
    ENCOUNTERS ||--o{ CLINICAL_NOTES : contains

    PATIENTS ||--o{ PRESCRIPTIONS : receives
    PRACTITIONERS ||--o{ PRESCRIPTIONS : issues
    ENCOUNTERS ||--o{ PRESCRIPTIONS : produces
    PRESCRIPTIONS ||--|{ PRESCRIPTION_ITEMS : contains
    MEDICATIONS ||--o{ PRESCRIPTION_ITEMS : prescribed_as
    PRESCRIPTIONS ||--o{ PRESCRIPTION_STATUS_HISTORY : changes

    PRESCRIPTIONS ||--o{ DISPENSINGS : fulfilled_by
    DISPENSINGS ||--|{ DISPENSING_ITEMS : contains
    PRESCRIPTION_ITEMS ||--o{ DISPENSING_ITEMS : fulfills
    MEDICATIONS ||--o{ DISPENSING_ITEMS : supplied_as

    ORGANIZATIONS ||--o{ PHARMACY_INVENTORY_BATCHES : stocks
    MEDICATIONS ||--o{ PHARMACY_INVENTORY_BATCHES : stocked_as
    PHARMACY_INVENTORY_BATCHES ||--o{ INVENTORY_TRANSACTIONS : changes

    PATIENTS ||--o{ DOCUMENTS : owns
    PATIENTS ||--o{ AUDIT_EVENTS : concerns
    USERS ||--o{ NOTIFICATIONS : receives

6. Academic design justification

Relational normalization

The model is primarily in Third Normal Form:

Repeating medication rows are separated from prescription headers.

Dispensing is separated from prescribing because these are different clinical and legal events.

Practitioner identity is separated from employment at an organization.

Primary-care assignments are historical rows rather than a single overwriteable column in patients.

Inventory movement is recorded independently from the current stock balance.

A few deliberate snapshots exist in prescription_items and dispensing_items. Medication name, strength, dosage form, batch, and expiry are copied at the time of the clinical event so later catalogue edits do not change the historical prescription or dispensing record.

Data integrity

The schema uses:

InnoDB transactions

Primary and foreign keys

Unique constraints

Date and quantity checks

Restricted deletion of clinical records

Status fields and status-history rows

Indexed search paths for patient lookup, prescriptions, appointments, and audit history

Privacy and security

The national identifier is represented by encrypted ciphertext and a keyed search hash.

Refresh tokens and prescription QR secrets are stored only as hashes.

Patient accounts are optional; a clinical record can exist before portal activation.

Clinical-note visibility is explicit.

Patient access grants and consents are separate, time-bounded records.

Audit events preserve access, denial, and failure evidence.

7. FHIR-inspired conceptual mapping

The database is not a full FHIR server, but the main concepts map cleanly:

Database concept

FHIR concept

patients

Patient

practitioners

Practitioner

practitioner_organizations

PractitionerRole

organizations

Organization

appointments

Appointment

encounters

Encounter

conditions

Condition

allergies

AllergyIntolerance

vital_signs

Observation

prescriptions + prescription_items

MedicationRequest

dispensings + dispensing_items

MedicationDispense

patient_consents

Consent

audit_events

AuditEvent

8. Critical business rules for Express services

Some rules cannot be expressed by an ordinary foreign key and must be enforced by the service layer:

Only a doctor may create, issue, cancel, or mark a prescription as entered in error.

Only a pharmacist associated with the selected pharmacy may create a dispensing.

The doctor must be associated with the clinic stored on the prescription.

A pharmacist must not receive unrestricted patient search results; lookup should use a secure prescription token plus patient verification.

An issued prescription and its item instructions are immutable.

The amount dispensed cannot exceed the remaining authorized amount.

The inventory batch must belong to the same pharmacy and represent the dispensed medication.

The prescription must not be expired, cancelled, fully dispensed, or entered in error.

The patient portal may only return the patient linked to the authenticated user.

Every patient search, clinical-record view, prescription issue, dispensing, export, and denial must be audited.

9. Required dispensing transaction

The following operations should execute in one transaction:

BEGIN
  Lock prescription row FOR UPDATE
  Validate prescription status and validity
  Lock prescription items/balances
  Validate requested quantities
  Lock inventory batches FOR UPDATE
  Validate available stock and expiration
  Insert dispensing
  Insert dispensing items
  Insert negative inventory transactions
  Update inventory batch quantities
  Update prescription status
  Insert prescription status history
  Insert notification
  Insert audit event
COMMIT

Any failure must roll back the entire operation.

10. Endpoint groups derived from the interface

Authentication and identity

POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me

Patient profile and dashboard

POST  /api/v1/patients
GET   /api/v1/patients
GET   /api/v1/patients/:patientId/profile
PATCH /api/v1/patients/:patientId
GET   /api/v1/patients/:patientId/dashboard
GET   /api/v1/patients/:patientId/timeline

Appointments and encounters

POST  /api/v1/appointments
GET   /api/v1/appointments
PATCH /api/v1/appointments/:appointmentId
POST  /api/v1/appointments/:appointmentId/check-in

POST  /api/v1/patients/:patientId/encounters
GET   /api/v1/patients/:patientId/encounters
GET   /api/v1/encounters/:encounterId
PATCH /api/v1/encounters/:encounterId
POST  /api/v1/encounters/:encounterId/complete

Clinical record

GET  /api/v1/patients/:patientId/history
POST /api/v1/patients/:patientId/history

GET  /api/v1/patients/:patientId/conditions
POST /api/v1/patients/:patientId/conditions

GET  /api/v1/patients/:patientId/allergies
POST /api/v1/patients/:patientId/allergies

GET  /api/v1/patients/:patientId/vitals
POST /api/v1/encounters/:encounterId/vitals

GET  /api/v1/patients/:patientId/notes
POST /api/v1/encounters/:encounterId/notes

Electronic prescriptions

POST /api/v1/prescriptions
GET  /api/v1/prescriptions/:prescriptionId
PUT  /api/v1/prescriptions/:prescriptionId/items
POST /api/v1/prescriptions/:prescriptionId/issue
POST /api/v1/prescriptions/:prescriptionId/cancel
GET  /api/v1/patients/:patientId/prescriptions
GET  /api/v1/prescriptions/:prescriptionId/pdf

Pharmacy workflow and inventory

POST /api/v1/pharmacy/prescription-lookups
POST /api/v1/prescriptions/:prescriptionId/dispensings
GET  /api/v1/prescriptions/:prescriptionId/dispensings

GET  /api/v1/pharmacies/:pharmacyId/inventory
POST /api/v1/pharmacies/:pharmacyId/inventory/receipts
POST /api/v1/inventory-batches/:batchId/adjustments

Patient portal

GET /api/v1/me/health-summary
GET /api/v1/me/appointments
GET /api/v1/me/encounters
GET /api/v1/me/conditions
GET /api/v1/me/allergies
GET /api/v1/me/prescriptions
GET /api/v1/me/documents
GET /api/v1/me/notifications
GET /api/v1/me/access-history

11. Deliberately excluded from the core

The interface mentions drug interactions, reporting, and settings. These are handled as follows:

Drug-interaction engine: excluded from the clinical core until a validated and properly licensed drug-knowledge source is selected. A student-maintained rules table must not be presented as clinically reliable.

Reports: implemented with views, aggregate SQL, or a reporting service rather than a reports data table.

Settings: application configuration rather than clinical data; add a small settings table only when concrete configurable values are identified.

Billing, insurance claims, procurement, suppliers, and national interoperability: future work.

Structured laboratory and imaging modules: future extension; current core stores their files in documents.

12. Recommended build order

Import and validate the schema in a disposable MySQL 8.4 database.

Seed roles and one test organization of each required type.

Implement authentication and server-side role checks.

Build patient profile, care assignment, and appointment APIs.

Build encounters, conditions, allergies, vitals, and notes.

Build the prescription draft and issue workflow.

Build pharmacy lookup, dispensing, and inventory transactions.

Build patient portal read endpoints.

Add notifications, audit reporting, and authorization tests.

Add dashboards and reports only after the transactional workflows are stable.