import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  Building2,
  Check,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Store,
  X
} from "lucide-react";
import {
  createOrganization,
  getManagedOrganizations,
  updateOrganization,
  updateOrganizationStatus,
  type CreateOrganizationInput,
  type Organization,
  type OrganizationStatus
} from "../../api/adminApi";
import "./AdminOrganizationsPage.css";

type TypeFilter = "ALL" | "CLINIC" | "PHARMACY";
type StatusFilter = "ALL" | OrganizationStatus;

const emptyOrganization = (): CreateOrganizationInput => ({
  organizationCode: "",
  organizationType: "CLINIC",
  name: "",
  licenseNumber: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  countryCode: "XK",
  status: "ACTIVE"
});

function message(error: unknown): string {
  if (isAxiosError(error)) {
    return (
      (error.response?.data as { error?: { message?: string } })?.error?.message ??
      "The request could not be completed."
    );
  }
  return "The request could not be completed.";
}

function toInput(organization: Organization): CreateOrganizationInput {
  return {
    organizationCode: organization.organizationCode,
    organizationType: organization.organizationType as "CLINIC" | "PHARMACY",
    name: organization.name,
    licenseNumber: organization.licenseNumber ?? "",
    phone: organization.phone ?? "",
    email: organization.email ?? "",
    addressLine1: organization.addressLine1 ?? "",
    addressLine2: organization.addressLine2 ?? "",
    city: organization.city ?? "",
    postalCode: organization.postalCode ?? "",
    countryCode: organization.countryCode,
    status: organization.status
  };
}

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CreateOrganizationInput>(emptyOrganization);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrganizations(await getManagedOrganizations());
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getManagedOrganizations()
      .then((nextOrganizations) => {
        if (!cancelled) setOrganizations(nextOrganizations);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(message(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return organizations.filter((organization) => {
      const typeMatches = filter === "ALL" || organization.organizationType === filter;
      const statusMatches = statusFilter === "ALL" || organization.status === statusFilter;
      const textMatches =
        !needle ||
        [
          organization.name,
          organization.organizationCode,
          organization.licenseNumber ?? "",
          organization.city ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return typeMatches && statusMatches && textMatches;
    });
  }, [filter, organizations, query, statusFilter]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyOrganization());
    setDialogOpen(true);
    setError(null);
  }

  function openEdit(organization: Organization) {
    if (organization.organizationType !== "CLINIC" && organization.organizationType !== "PHARMACY")
      return;
    setEditingId(organization.id);
    setForm(toInput(organization));
    setDialogOpen(true);
    setError(null);
  }

  function closeDialog() {
    if (busy) return;
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyOrganization());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editingId === null) {
        await createOrganization(form);
        setNotice("Organization created successfully.");
      } else {
        const input = {
          organizationCode: form.organizationCode,
          organizationType: form.organizationType,
          name: form.name,
          licenseNumber: form.licenseNumber,
          phone: form.phone,
          email: form.email,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          postalCode: form.postalCode,
          countryCode: form.countryCode
        };
        await updateOrganization(editingId, input);
        setNotice("Organization updated successfully.");
      }
      closeDialog();
      await load();
    } catch (saveError) {
      setError(message(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(organization: Organization, status: OrganizationStatus) {
    if (status === organization.status) return;
    if (
      (status === "SUSPENDED" || status === "CLOSED") &&
      !window.confirm(
        `${status === "CLOSED" ? "Close" : "Suspend"} ${organization.name}? Professional accounts will remain active, but new assignments require an active organization.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await updateOrganizationStatus(organization.id, status);
      setNotice("Organization status updated.");
      await load();
    } catch (statusError) {
      setError(message(statusError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="organizations-page">
      <section className="organizations-hero">
        <div>
          <span>CARE NETWORK</span>
          <h2>Clinics &amp; Pharmacies</h2>
          <p>Manage the organizations available for clinical-professional assignments.</p>
        </div>
        <button type="button" onClick={openCreate}>
          <Plus size={17} />
          Add organization
        </button>
      </section>

      {notice && (
        <div className="organizations-notice organizations-notice--success">
          <Check size={17} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <div className="organizations-notice organizations-notice--error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <section className="organizations-toolbar">
        <div className="organization-tabs">
          {(["ALL", "CLINIC", "PHARMACY"] as TypeFilter[]).map((type) => (
            <button
              type="button"
              key={type}
              className={filter === type ? "active" : ""}
              onClick={() => setFilter(type)}
            >
              {type === "ALL" ? "All" : type === "CLINIC" ? "Clinics" : "Pharmacies"}
            </button>
          ))}
        </div>
        <label className="organization-status-filter">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
        <div className="organization-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search organizations"
          />
          <button type="button" onClick={() => void load()}>
            <RefreshCw className={loading ? "spin" : undefined} size={16} />
          </button>
        </div>
      </section>

      {loading ? (
        <div className="organizations-state">
          <LoaderCircle className="spin" />
          Loading organizations…
        </div>
      ) : (
        <section className="organization-grid">
          {filtered.map((organization) => (
            <article className="organization-card" key={organization.id}>
              <header>
                <span
                  className={`organization-icon organization-icon--${organization.organizationType.toLowerCase()}`}
                >
                  {organization.organizationType === "CLINIC" ? <Building2 /> : <Store />}
                </span>
                <div>
                  <strong>{organization.name}</strong>
                  <small>
                    {organization.organizationCode} · {organization.organizationType}
                  </small>
                </div>
                <span
                  className={`organization-status organization-status--${organization.status.toLowerCase()}`}
                >
                  {organization.status}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Licence</dt>
                  <dd>{organization.licenseNumber || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{organization.phone || organization.email || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>
                    {[organization.city, organization.countryCode].filter(Boolean).join(", ")}
                  </dd>
                </div>
                <div>
                  <dt>Assigned professionals</dt>
                  <dd>{organization.activePractitionerCount}</dd>
                </div>
              </dl>
              <footer>
                <button type="button" disabled={busy} onClick={() => openEdit(organization)}>
                  <Pencil size={15} />
                  Edit
                </button>
                <select
                  aria-label={`Status for ${organization.name}`}
                  disabled={busy}
                  value={organization.status}
                  onChange={(event) =>
                    void changeStatus(organization, event.target.value as OrganizationStatus)
                  }
                >
                  <option value="PENDING">Pending</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </footer>
            </article>
          ))}
        </section>
      )}
      {!loading && !filtered.length && (
        <div className="organizations-state">No organizations match this filter.</div>
      )}

      {dialogOpen && (
        <div className="organization-backdrop">
          <section className="organization-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <span>ORGANIZATION RECORD</span>
                <h2>{editingId === null ? "Add organization" : "Edit organization"}</h2>
                <p>Clinics accept doctors; pharmacies accept pharmacists.</p>
              </div>
              <button type="button" onClick={closeDialog}>
                <X />
              </button>
            </header>
            <form onSubmit={submit}>
              <div className="organization-form-grid">
                <Field
                  label="Organization name"
                  value={form.name}
                  set={(name) => setForm({ ...form, name })}
                />
                <Field
                  label="Organization code"
                  value={form.organizationCode}
                  set={(organizationCode) =>
                    setForm({ ...form, organizationCode: organizationCode.toUpperCase() })
                  }
                />
                <label>
                  Type
                  <select
                    value={form.organizationType}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        organizationType: event.target.value as "CLINIC" | "PHARMACY"
                      })
                    }
                  >
                    <option value="CLINIC">Clinic</option>
                    <option value="PHARMACY">Pharmacy</option>
                  </select>
                </label>
                {editingId === null && (
                  <label>
                    Initial status
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm({ ...form, status: event.target.value as OrganizationStatus })
                      }
                    >
                      <option value="PENDING">Pending</option>
                      <option value="ACTIVE">Active</option>
                    </select>
                  </label>
                )}
                <Field
                  label="Licence number"
                  required={false}
                  value={form.licenseNumber}
                  set={(licenseNumber) => setForm({ ...form, licenseNumber })}
                />
                <Field
                  label="Phone"
                  required={false}
                  value={form.phone}
                  set={(phone) => setForm({ ...form, phone })}
                />
                <Field
                  label="Email"
                  type="email"
                  required={false}
                  value={form.email}
                  set={(email) => setForm({ ...form, email })}
                />
                <Field
                  label="Address line 1"
                  required={false}
                  value={form.addressLine1}
                  set={(addressLine1) => setForm({ ...form, addressLine1 })}
                />
                <Field
                  label="Address line 2"
                  required={false}
                  value={form.addressLine2}
                  set={(addressLine2) => setForm({ ...form, addressLine2 })}
                />
                <Field
                  label="City"
                  required={false}
                  value={form.city}
                  set={(city) => setForm({ ...form, city })}
                />
                <Field
                  label="Postal code"
                  required={false}
                  value={form.postalCode}
                  set={(postalCode) => setForm({ ...form, postalCode })}
                />
                <Field
                  label="Country code"
                  maxLength={2}
                  value={form.countryCode}
                  set={(countryCode) =>
                    setForm({ ...form, countryCode: countryCode.toUpperCase() })
                  }
                />
              </div>
              <footer>
                <button type="button" onClick={closeDialog} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Save
                  organization
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  set,
  type = "text",
  required = true,
  maxLength
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        onChange={(event) => set(event.target.value)}
      />
    </label>
  );
}
