import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  Check,
  ClipboardPlus,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserRound,
  X
} from "lucide-react";

import {
  checkUserDeletion,
  createAdmin,
  createPatient,
  createStaff,
  deleteUser,
  getManagedOrganizations,
  getUserDetails,
  getUsers,
  updateUserProfile,
  type AdminInput,
  type AdminUser,
  type BloodType,
  type MaritalStatus,
  type Organization,
  type PatientInput,
  type SmokingStatus,
  type StaffInput,
  type UpdateUserProfileInput
} from "../../api/adminApi";

import type { UserRole } from "../../auth/types";
import { useAuth } from "../../auth/AuthContext";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { submitFormOnEnter } from "../../utils/formEnterSubmit";
import "./AdminPeoplePage.css";

type Filter = "ALL" | UserRole;
type AddKind = "PATIENT" | "CLINICAL" | "ADMIN";

interface EditingState {
  user: AdminUser;
  profile: UpdateUserProfileInput;
}

function createEmptyPatient(): PatientInput {
  return {
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    sex: "FEMALE",
    bloodType: "UNKNOWN",
    maritalStatus: "UNKNOWN",
    smokingStatus: "UNKNOWN",
    occupation: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postalCode: "",
    countryCode: "XK"
  };
}

function createEmptyStaff(): StaffInput {
  return {
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "DOCTOR",
    licenseNumber: "",
    specialty: "",
    phone: "",
    organizationId: 0,
    positionTitle: ""
  };
}

function createEmptyAdmin(): AdminInput {
  return {
    email: "",
    password: "",
    firstName: "",
    lastName: ""
  };
}

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as {
      error?: {
        message?: string;
      };
    };

    return data?.error?.message ?? "The request could not be completed.";
  }

  return "The request could not be completed.";
}

function convertDetailsToProfile(
  details: Awaited<ReturnType<typeof getUserDetails>>
): UpdateUserProfileInput {
  const { account, profile } = details;

  if (profile.type === "PATIENT") {
    return {
      profileType: "PATIENT",
      email: account.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      dateOfBirth: profile.dateOfBirth,
      sex: profile.sex,
      bloodType: profile.bloodType,
      maritalStatus: profile.maritalStatus,
      smokingStatus: profile.smokingStatus,
      occupation: profile.occupation ?? "",
      phone: profile.phone ?? "",
      addressLine1: profile.addressLine1 ?? "",
      addressLine2: profile.addressLine2 ?? "",
      city: profile.city ?? "",
      postalCode: profile.postalCode ?? "",
      countryCode: profile.countryCode
    };
  }

  if (profile.type === "PRACTITIONER") {
    return {
      profileType: "PRACTITIONER",
      role: account.role as "DOCTOR" | "PHARMACIST",
      email: account.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      licenseNumber: profile.licenseNumber,
      specialty: profile.specialty ?? "",
      phone: profile.phone ?? "",
      organizationId: profile.organizationId ?? 0,
      positionTitle: profile.positionTitle ?? ""
    };
  }

  return {
    profileType: "ACCOUNT",
    email: account.email,
    displayName: account.displayName ?? ""
  };
}

function formatRole(role: Filter): string {
  if (role === "ALL") {
    return "All people";
  }

  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function AdminPeoplePage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);

  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [filter, setFilter] = useState<Filter>("ALL");

  const [query, setQuery] = useState("");

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [dialogError, setDialogError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);

  const [addKind, setAddKind] = useState<AddKind>("PATIENT");

  const [patient, setPatient] = useState<PatientInput>(createEmptyPatient);

  const [staff, setStaff] = useState<StaffInput>(createEmptyStaff);

  const [adminAccount, setAdminAccount] = useState<AdminInput>(createEmptyAdmin);

  const [editing, setEditing] = useState<EditingState | null>(null);

  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);

  const load = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const [nextUsers, nextOrganizations] = await Promise.all([
        getUsers(),
        getManagedOrganizations()
      ]);

      setUsers(nextUsers);
      setOrganizations(nextOrganizations);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getUsers(), getManagedOrganizations()])
      .then(([nextUsers, nextOrganizations]) => {
        if (!cancelled) {
          setUsers(nextUsers);
          setOrganizations(nextOrganizations);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const search = query.trim().toLowerCase();

    return users.filter((user) => {
      const roleMatches = filter === "ALL" || user.role_code === filter;

      if (!roleMatches) {
        return false;
      }

      if (!search) {
        return true;
      }

      const searchableText = [
        user.display_name ?? "",
        user.email,
        user.profile_number ?? "",
        user.organization_name ?? "",
        user.role_name,
        user.status
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(search);
    });
  }, [filter, query, users]);

  const availableOrganizations = useMemo(() => {
    const requiredType = staff.role === "DOCTOR" ? "CLINIC" : "PHARMACY";

    return organizations.filter(
      (organization) =>
        organization.organizationType === requiredType && organization.status === "ACTIVE"
    );
  }, [organizations, staff.role]);

  function getRoleCount(role: Filter): number {
    if (role === "ALL") {
      return users.length;
    }

    return users.filter((user) => user.role_code === role).length;
  }

  function resetAddPersonForm(): void {
    setAddKind("PATIENT");
    setPatient(createEmptyPatient());
    setStaff(createEmptyStaff());
    setAdminAccount(createEmptyAdmin());
  }

  function openAddPersonDialog(): void {
    resetAddPersonForm();
    setDialogError(null);
    setNotice(null);
    setAddOpen(true);
  }

  function closeAddPersonDialog(): void {
    if (busy) {
      return;
    }

    setAddOpen(false);
    setDialogError(null);
    resetAddPersonForm();
  }

  async function openEdit(user: AdminUser): Promise<void> {
    setBusy(true);
    setError(null);
    setDialogError(null);
    setNotice(null);

    try {
      const details = await getUserDetails(user.id);

      setEditing({
        user,
        profile: convertDetailsToProfile(details)
      });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setBusy(false);
    }
  }

  function closeEditDialog(): void {
    if (busy) {
      return;
    }

    setEditing(null);
    setDialogError(null);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!editing) {
      return;
    }

    setBusy(true);
    setDialogError(null);
    setNotice(null);

    try {
      await updateUserProfile(editing.user.id, editing.profile);

      setEditing(null);

      setNotice("Person profile updated successfully.");

      await load();
    } catch (saveError) {
      setDialogError(getErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function requestRemovePerson(user: AdminUser): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const check = await checkUserDeletion(user.id);
      if (!check.canDelete) {
        setError(check.reason ?? "This person cannot be deleted.");
        return;
      }
      setPendingDelete(user);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemovePerson(): Promise<void> {
    if (!pendingDelete) {
      return;
    }

    const user = pendingDelete;
    const label = user.display_name ?? user.email;
    setBusy(true);
    setError(null);

    try {
      await deleteUser(user.id);
      if (editing?.user.id === user.id) {
        setEditing(null);
      }
      setPendingDelete(null);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setNotice(`${label} was deleted.`);
      await load(true);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  }

  async function addPerson(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const createdKind = addKind;

    setBusy(true);
    setDialogError(null);
    setNotice(null);

    try {
      if (createdKind === "PATIENT") {
        await createPatient(patient);
      } else if (createdKind === "ADMIN") {
        await createAdmin(adminAccount);
      } else {
        await createStaff(staff);
      }

      setAddOpen(false);
      setDialogError(null);
      resetAddPersonForm();

      setNotice(
        createdKind === "PATIENT"
          ? "Patient account created successfully."
          : createdKind === "ADMIN"
            ? "Administrator account created successfully."
            : "Clinical professional created successfully."
      );

      await load();
    } catch (saveError) {
      setDialogError(getErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="people-page">
      <section className="people-hero">
        <div>
          <span>PERSON PROFILES</span>

          <h2>People Directory</h2>

          <p>Complete personal and professional records, organized by role.</p>
        </div>

        <button type="button" onClick={openAddPersonDialog}>
          <Plus size={17} />
          Add person
        </button>
      </section>

      {notice && !addOpen && !editing && !pendingDelete && (
        <Notice kind="success" close={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      {error && !addOpen && !editing && !pendingDelete && (
        <Notice kind="error" close={() => setError(null)}>
          {error}
        </Notice>
      )}

      <section className="people-toolbar">
        <div className="role-tabs">
          {(["ALL", "PATIENT", "DOCTOR", "PHARMACIST", "ADMIN"] as Filter[]).map((role) => (
            <button
              type="button"
              key={role}
              className={filter === role ? "active" : ""}
              onClick={() => setFilter(role)}
            >
              {formatRole(role)}

              <span>{getRoleCount(role)}</span>
            </button>
          ))}
        </div>

        <div className="people-search">
          <Search size={16} />

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people"
            aria-label="Search people"
          />

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh directory"
          >
            <RefreshCw className={loading ? "spin" : undefined} size={16} />
          </button>
        </div>
      </section>

      {loading ? (
        <div className="people-state">
          <LoaderCircle className="spin" />
          Loading people…
        </div>
      ) : (
        <>
          <section className="people-grid">
            {filteredUsers.map((user) => (
              <PersonCard
                key={user.id}
                user={user}
                busy={busy}
                canDelete={user.id !== currentUser?.id}
                edit={() => void openEdit(user)}
                remove={() => void requestRemovePerson(user)}
              />
            ))}
          </section>

          {filteredUsers.length === 0 && (
            <div className="people-state">No people match this filter.</div>
          )}
        </>
      )}

      {addOpen && (
        <Modal
          title="Add person"
          eyebrow="PERSON DIRECTORY"
          note="Create a patient, clinical professional, or administrator with the correct profile."
          close={closeAddPersonDialog}
        >
          <form onSubmit={addPerson} onKeyDown={submitFormOnEnter}>
            {dialogError ? (
              <div className="people-modal-error" role="alert">
                <AlertCircle size={16} />
                <span>{dialogError}</span>
              </div>
            ) : null}
            <div className="kind-switch">
              <button
                type="button"
                className={addKind === "PATIENT" ? "active" : ""}
                onClick={() => setAddKind("PATIENT")}
              >
                <UserRound />
                Patient
              </button>

              <button
                type="button"
                className={addKind === "CLINICAL" ? "active" : ""}
                onClick={() => setAddKind("CLINICAL")}
              >
                <ClipboardPlus />
                Clinical professional
              </button>

              <button
                type="button"
                className={addKind === "ADMIN" ? "active" : ""}
                onClick={() => setAddKind("ADMIN")}
              >
                <Shield />
                Administrator
              </button>
            </div>

            {addKind === "PATIENT" ? (
              <PatientFields value={patient} change={setPatient} showPassword />
            ) : addKind === "ADMIN" ? (
              <AdminFields value={adminAccount} change={setAdminAccount} />
            ) : (
              <StaffFields
                value={staff}
                change={setStaff}
                organizations={availableOrganizations}
                showPassword
              />
            )}

            <ModalFooter busy={busy} cancel={closeAddPersonDialog} label="Create person" />
          </form>
        </Modal>
      )}

      {editing && (
        <Modal
          title="Edit person"
          eyebrow="PERSON PROFILE"
          note={`${editing.user.display_name ?? editing.user.email} · ${editing.user.role_name}`}
          close={closeEditDialog}
        >
          <form onSubmit={saveProfile} onKeyDown={submitFormOnEnter}>
            {dialogError ? (
              <div className="people-modal-error" role="alert">
                <AlertCircle size={16} />
                <span>{dialogError}</span>
              </div>
            ) : null}
            <ProfileFields
              value={editing.profile}
              change={(profile) =>
                setEditing({
                  ...editing,
                  profile
                })
              }
              organizations={organizations}
            />

            <ModalFooter busy={busy} cancel={closeEditDialog} label="Save profile" />
          </form>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Confirm deletion"
          message={`Are you sure you want to delete ${pendingDelete.display_name ?? pendingDelete.email}?`}
          confirmLabel="Delete"
          tone="danger"
          busy={busy}
          onCancel={() => !busy && setPendingDelete(null)}
          onConfirm={() => void confirmRemovePerson()}
        />
      )}
    </div>
  );
}

interface PersonCardProps {
  user: AdminUser;
  busy: boolean;
  canDelete: boolean;
  edit: () => void;
  remove: () => void;
}

function PersonCard({ user, busy, canDelete, edit, remove }: PersonCardProps) {
  const name = user.display_name ?? "Unnamed account";

  const avatarText = (user.display_name ?? user.email).charAt(0).toUpperCase();

  return (
    <article className="person-card">
      <header>
        <span className={`person-avatar person-avatar--${user.role_code.toLowerCase()}`}>
          {avatarText}
        </span>

        <div>
          <strong>{name}</strong>

          <small>
            {user.role_name}
            {" · "}
            {user.profile_number ?? "Account profile"}
          </small>
        </div>

        <span
          className={[
            "profile-state",
            user.profile_complete ? "profile-state--complete" : "profile-state--missing"
          ].join(" ")}
        >
          {user.profile_complete ? "Complete" : "Missing information"}
        </span>
      </header>

      <dl>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>

        <div>
          <dt>Phone</dt>

          <dd className={user.phone ? undefined : "missing"}>{user.phone ?? "Not provided"}</dd>
        </div>

        <div>
          <dt>Organization</dt>

          <dd>
            {user.organization_name ??
              (user.role_code === "PATIENT" ? "Not applicable" : "Not assigned")}
          </dd>
        </div>

        <div>
          <dt>Status</dt>
          <dd>{user.status}</dd>
        </div>
      </dl>

      <footer>
        <button type="button" onClick={edit} disabled={busy}>
          <Pencil size={15} />
          Edit profile
        </button>
        {canDelete && (
          <button type="button" className="danger" onClick={remove} disabled={busy}>
            <Trash2 size={15} />
            Delete
          </button>
        )}
      </footer>
    </article>
  );
}

interface PatientFieldsProps {
  value: PatientInput;
  change: (value: PatientInput) => void;
  showPassword?: boolean;
}

function PatientFields({ value, change, showPassword = false }: PatientFieldsProps) {
  return (
    <div className="people-form-grid">
      <Field
        label="First name"
        value={value.firstName}
        set={(firstName) =>
          change({
            ...value,
            firstName
          })
        }
      />

      <Field
        label="Last name"
        value={value.lastName}
        set={(lastName) =>
          change({
            ...value,
            lastName
          })
        }
      />

      <Field
        label="Email"
        type="email"
        value={value.email}
        set={(email) =>
          change({
            ...value,
            email
          })
        }
      />

      {showPassword && (
        <Field
          label="Temporary password"
          type="password"
          value={value.password}
          minLength={12}
          autoComplete="new-password"
          set={(password) =>
            change({
              ...value,
              password
            })
          }
        />
      )}

      <Field
        label="Date of birth"
        type="date"
        value={value.dateOfBirth}
        set={(dateOfBirth) =>
          change({
            ...value,
            dateOfBirth
          })
        }
      />

      <Select
        label="Sex"
        value={value.sex}
        options={[
          {
            value: "FEMALE",
            label: "Female"
          },
          {
            value: "MALE",
            label: "Male"
          }
        ]}
        set={(sex) =>
          change({
            ...value,
            sex: sex as "FEMALE" | "MALE"
          })
        }
      />

      <Field
        label="Phone"
        value={value.phone ?? ""}
        required={false}
        set={(phone) =>
          change({
            ...value,
            phone
          })
        }
      />

      <Select
        label="Blood type"
        value={value.bloodType}
        options={[
          {
            value: "UNKNOWN",
            label: "Unknown"
          },
          { value: "A+", label: "A+" },
          { value: "A-", label: "A-" },
          { value: "B+", label: "B+" },
          { value: "B-", label: "B-" },
          { value: "AB+", label: "AB+" },
          { value: "AB-", label: "AB-" },
          { value: "O+", label: "O+" },
          { value: "O-", label: "O-" }
        ]}
        set={(bloodType) =>
          change({
            ...value,
            bloodType: bloodType as BloodType
          })
        }
      />

      <Select
        label="Marital status"
        value={value.maritalStatus}
        options={[
          {
            value: "UNKNOWN",
            label: "Unknown"
          },
          {
            value: "SINGLE",
            label: "Single"
          },
          {
            value: "MARRIED",
            label: "Married"
          },
          {
            value: "DIVORCED",
            label: "Divorced"
          },
          {
            value: "WIDOWED",
            label: "Widowed"
          },
          {
            value: "OTHER",
            label: "Other"
          }
        ]}
        set={(maritalStatus) =>
          change({
            ...value,
            maritalStatus: maritalStatus as MaritalStatus
          })
        }
      />

      <Select
        label="Smoking status"
        value={value.smokingStatus}
        options={[
          {
            value: "UNKNOWN",
            label: "Unknown"
          },
          {
            value: "NEVER",
            label: "Never"
          },
          {
            value: "FORMER",
            label: "Former"
          },
          {
            value: "CURRENT",
            label: "Current"
          }
        ]}
        set={(smokingStatus) =>
          change({
            ...value,
            smokingStatus: smokingStatus as SmokingStatus
          })
        }
      />

      <Field
        label="Occupation"
        value={value.occupation ?? ""}
        required={false}
        set={(occupation) =>
          change({
            ...value,
            occupation
          })
        }
      />

      <Field
        label="Address line 1"
        value={value.addressLine1 ?? ""}
        required={false}
        set={(addressLine1) =>
          change({
            ...value,
            addressLine1
          })
        }
      />

      <Field
        label="Address line 2"
        value={value.addressLine2 ?? ""}
        required={false}
        set={(addressLine2) =>
          change({
            ...value,
            addressLine2
          })
        }
      />

      <Field
        label="City"
        value={value.city ?? ""}
        required={false}
        set={(city) =>
          change({
            ...value,
            city
          })
        }
      />

      <Field
        label="Postal code"
        value={value.postalCode ?? ""}
        required={false}
        set={(postalCode) =>
          change({
            ...value,
            postalCode
          })
        }
      />

      <Field
        label="Country code"
        value={value.countryCode}
        maxLength={2}
        set={(countryCode) =>
          change({
            ...value,
            countryCode: countryCode.toUpperCase()
          })
        }
      />
    </div>
  );
}

interface StaffFieldsProps {
  value: StaffInput;
  change: (value: StaffInput) => void;
  organizations: Organization[];
  showPassword?: boolean;
}

function StaffFields({ value, change, organizations, showPassword = false }: StaffFieldsProps) {
  return (
    <div className="people-form-grid">
      <p className="people-form-note">
        If this person already has an account, edit their profile instead. Email addresses must be
        unique.
      </p>
      <Field
        label="First name"
        value={value.firstName}
        set={(firstName) =>
          change({
            ...value,
            firstName
          })
        }
      />

      <Field
        label="Last name"
        value={value.lastName}
        set={(lastName) =>
          change({
            ...value,
            lastName
          })
        }
      />

      <Field
        label="Professional email"
        type="email"
        value={value.email}
        set={(email) =>
          change({
            ...value,
            email
          })
        }
      />

      {showPassword && (
        <Field
          label="Temporary password"
          type="password"
          value={value.password}
          minLength={12}
          autoComplete="new-password"
          set={(password) =>
            change({
              ...value,
              password
            })
          }
        />
      )}

      <Select
        label="Professional role"
        value={value.role}
        options={[
          {
            value: "DOCTOR",
            label: "Doctor"
          },
          {
            value: "PHARMACIST",
            label: "Pharmacist"
          }
        ]}
        set={(role) =>
          change({
            ...value,
            role: role as "DOCTOR" | "PHARMACIST",
            organizationId: 0
          })
        }
      />

      <OrganizationSelect
        organizations={organizations}
        value={value.organizationId}
        change={(organizationId) =>
          change({
            ...value,
            organizationId
          })
        }
      />

      <Field
        label="Licence number"
        value={value.licenseNumber}
        set={(licenseNumber) =>
          change({
            ...value,
            licenseNumber
          })
        }
      />

      <Field
        label="Phone"
        value={value.phone ?? ""}
        required={false}
        set={(phone) =>
          change({
            ...value,
            phone
          })
        }
      />

      <Field
        label="Specialty"
        value={value.specialty ?? ""}
        required={false}
        set={(specialty) =>
          change({
            ...value,
            specialty
          })
        }
      />

      <Field
        label="Position title"
        value={value.positionTitle ?? ""}
        required={false}
        set={(positionTitle) =>
          change({
            ...value,
            positionTitle
          })
        }
      />
    </div>
  );
}

interface AdminFieldsProps {
  value: AdminInput;
  change: (value: AdminInput) => void;
}

function AdminFields({ value, change }: AdminFieldsProps) {
  return (
    <div className="people-form-grid">
      <p className="people-form-note">
        Administrators manage people, access, clinics, and reports. They do not treat patients or
        dispense medicines.
      </p>
      <Field
        label="First name"
        value={value.firstName}
        set={(firstName) => change({ ...value, firstName })}
      />
      <Field
        label="Last name"
        value={value.lastName}
        set={(lastName) => change({ ...value, lastName })}
      />
      <Field
        label="Email"
        type="email"
        value={value.email}
        set={(email) => change({ ...value, email })}
      />
      <Field
        label="Temporary password"
        type="password"
        value={value.password}
        minLength={12}
        autoComplete="new-password"
        set={(password) => change({ ...value, password })}
      />
    </div>
  );
}

interface ProfileFieldsProps {
  value: UpdateUserProfileInput;
  change: (value: UpdateUserProfileInput) => void;
  organizations: Organization[];
}

function ProfileFields({ value, change, organizations }: ProfileFieldsProps) {
  if (value.profileType === "ACCOUNT") {
    return (
      <div className="people-form-grid">
        <Field
          label="Display name"
          value={value.displayName}
          set={(displayName) =>
            change({
              ...value,
              displayName
            })
          }
        />

        <Field
          label="Email"
          type="email"
          value={value.email}
          set={(email) =>
            change({
              ...value,
              email
            })
          }
        />
      </div>
    );
  }

  if (value.profileType === "PATIENT") {
    const patientValue: PatientInput = {
      ...value,
      password: ""
    };

    return (
      <PatientFields
        value={patientValue}
        change={(nextPatient) =>
          change({
            profileType: "PATIENT",
            email: nextPatient.email,
            firstName: nextPatient.firstName,
            lastName: nextPatient.lastName,
            dateOfBirth: nextPatient.dateOfBirth,
            sex: nextPatient.sex,
            bloodType: nextPatient.bloodType,
            maritalStatus: nextPatient.maritalStatus,
            smokingStatus: nextPatient.smokingStatus,
            occupation: nextPatient.occupation ?? "",
            phone: nextPatient.phone ?? "",
            addressLine1: nextPatient.addressLine1 ?? "",
            addressLine2: nextPatient.addressLine2 ?? "",
            city: nextPatient.city ?? "",
            postalCode: nextPatient.postalCode ?? "",
            countryCode: nextPatient.countryCode
          })
        }
      />
    );
  }

  const requiredOrganizationType = value.role === "DOCTOR" ? "CLINIC" : "PHARMACY";

  const availableOrganizations = organizations.filter(
    (organization) =>
      organization.organizationType === requiredOrganizationType &&
      (organization.status === "ACTIVE" || organization.id === value.organizationId)
  );

  return (
    <div className="people-form-grid">
      <Field
        label="First name"
        value={value.firstName}
        set={(firstName) =>
          change({
            ...value,
            firstName
          })
        }
      />

      <Field
        label="Last name"
        value={value.lastName}
        set={(lastName) =>
          change({
            ...value,
            lastName
          })
        }
      />

      <Field
        label="Professional email"
        type="email"
        value={value.email}
        set={(email) =>
          change({
            ...value,
            email
          })
        }
      />

      <label className="people-field">
        Professional role
        <input value={value.role === "DOCTOR" ? "Doctor" : "Pharmacist"} readOnly />
      </label>

      <Field
        label="Licence number"
        value={value.licenseNumber}
        set={(licenseNumber) =>
          change({
            ...value,
            licenseNumber
          })
        }
      />

      <Field
        label="Phone"
        value={value.phone}
        required={false}
        set={(phone) =>
          change({
            ...value,
            phone
          })
        }
      />

      <Field
        label="Specialty"
        value={value.specialty}
        required={false}
        set={(specialty) =>
          change({
            ...value,
            specialty
          })
        }
      />

      <OrganizationSelect
        organizations={availableOrganizations}
        value={value.organizationId}
        change={(organizationId) =>
          change({
            ...value,
            organizationId
          })
        }
      />

      <Field
        label="Position title"
        value={value.positionTitle}
        required={false}
        set={(positionTitle) =>
          change({
            ...value,
            positionTitle
          })
        }
      />
    </div>
  );
}

interface OrganizationSelectProps {
  organizations: Organization[];
  value: number;
  change: (organizationId: number) => void;
}

function OrganizationSelect({ organizations, value, change }: OrganizationSelectProps) {
  return (
    <label className="people-field">
      Organization
      <select required value={value || ""} onChange={(event) => change(Number(event.target.value))}>
        <option value="">Select organization</option>

        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
            {" — "}
            {organization.organizationCode}
            {organization.status !== "ACTIVE" ? ` (${organization.status.toLowerCase()})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

interface FieldProps {
  label: string;
  value: string;
  set: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
}

function Field({
  label,
  value,
  set,
  type = "text",
  required = true,
  minLength,
  maxLength,
  autoComplete
}: FieldProps) {
  return (
    <label className="people-field">
      {label}

      <input
        type={type}
        value={value}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onChange={(event) => set(event.target.value)}
      />
    </label>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  set: (value: string) => void;
}

function Select({ label, value, options, set }: SelectProps) {
  return (
    <label className="people-field">
      {label}

      <select value={value} onChange={(event) => set(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ModalProps {
  title: string;
  eyebrow: string;
  note: string;
  close: () => void;
  children: ReactNode;
}

function Modal({ title, eyebrow, note, close, children }: ModalProps) {
  return (
    <div className="people-backdrop">
      <section
        className="people-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="people-modal-title"
      >
        <header>
          <div>
            <span>{eyebrow}</span>

            <h2 id="people-modal-title">{title}</h2>

            <p>{note}</p>
          </div>

          <button type="button" onClick={close} aria-label="Close dialog">
            <X />
          </button>
        </header>

        {children}
      </section>
    </div>
  );
}

interface ModalFooterProps {
  busy: boolean;
  cancel: () => void;
  label: string;
}

function ModalFooter({ busy, cancel, label }: ModalFooterProps) {
  return (
    <footer className="people-modal-footer">
      <button type="button" onClick={cancel} disabled={busy}>
        Cancel
      </button>

      <button type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}

        {label}
      </button>
    </footer>
  );
}

interface NoticeProps {
  kind: "success" | "error";
  close: () => void;
  children: ReactNode;
}

function Notice({ kind, close, children }: NoticeProps) {
  return (
    <div
      className={`people-notice people-notice--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {kind === "success" ? <Check size={17} /> : <AlertCircle size={17} />}

      <span>{children}</span>

      <button type="button" onClick={close} aria-label="Close notification">
        <X size={16} />
      </button>
    </div>
  );
}
