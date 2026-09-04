import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";

import {
  AlertCircle,
  Check,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  X
} from "lucide-react";

import {
  getUsers,
  resetUserPassword,
  unlockUser,
  updateStatus,
  type AdminUser,
  type EditableStatus
} from "../../api/adminApi";

import { useAuth } from "../../auth/AuthContext";
import type { UserRole, UserStatus } from "../../auth/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import "./AdminAccessPage.css";

function message(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as {
      error?: {
        message?: string;
      };
    };

    return data?.error?.message ?? "The request failed.";
  }

  return "The request failed.";
}

type AccessDraft = {
  user: AdminUser;
  role: UserRole;
  status: EditableStatus;
  newPassword: string;
  confirmPassword: string;
};

type Confirmation = {
  kind: "STATUS" | "UNLOCK" | "PASSWORD";
  user: AdminUser;
  status?: EditableStatus;
};

export function AdminAccessPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);

  const [query, setQuery] = useState("");

  const [statusFilter, setStatusFilter] = useState<"ALL" | UserStatus>("ALL");

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<AccessDraft | null>(null);

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setUsers(await getUsers());
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getUsers()
      .then((nextUsers) => {
        if (!cancelled) setUsers(nextUsers);
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
    const value = query.trim().toLowerCase();

    return users.filter((user) => {
      if (statusFilter !== "ALL" && user.status !== statusFilter) {
        return false;
      }

      if (!value) {
        return true;
      }

      return [user.display_name ?? "", user.email, user.role_code, user.status]
        .join(" ")
        .toLowerCase()
        .includes(value);
    });
  }, [query, statusFilter, users]);

  function openAccess(user: AdminUser) {
    setDialogError(null);
    setDraft({
      user,
      role: user.role_code,
      status: user.status === "LOCKED" ? "ACTIVE" : user.status,
      newPassword: "",
      confirmPassword: ""
    });
  }

  async function executeChange() {
    if (!confirmation) {
      return;
    }

    const action = confirmation;
    const passwordPayload =
      action.kind === "PASSWORD" && draft
        ? { newPassword: draft.newPassword, confirmPassword: draft.confirmPassword }
        : null;

    setConfirmation(null);
    setBusy(action.user.id);
    setError(null);
    setDialogError(null);
    setNotice(null);

    try {
      if (action.kind === "STATUS" && action.status) {
        await updateStatus(action.user.id, action.status);
      }

      if (action.kind === "UNLOCK") {
        await unlockUser(action.user.id);
      }

      if (action.kind === "PASSWORD" && passwordPayload) {
        await resetUserPassword(action.user.id, passwordPayload);
      }

      setDraft(null);

      if (action.kind === "UNLOCK") {
        setNotice("Account unlocked.");
      } else if (action.kind === "PASSWORD") {
        setNotice("Temporary password set. The user must sign in again.");
      } else {
        setNotice("Account status updated.");
      }

      await load();
    } catch (operationError) {
      setDialogError(message(operationError));
    } finally {
      setBusy(null);
    }
  }

  function reviewStatusChange(event: FormEvent) {
    event.preventDefault();
    if (!draft || draft.status === draft.user.status) return;
    setConfirmation({
      kind: "STATUS",
      user: draft.user,
      status: draft.status
    });
  }

  function reviewPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (draft.newPassword !== draft.confirmPassword) {
      setDialogError("The two passwords do not match.");
      return;
    }
    setDialogError(null);
    setConfirmation({
      kind: "PASSWORD",
      user: draft.user
    });
  }

  return (
    <div className="access-page">
      <section className="access-hero">
        <div>
          <span>SECURITY ADMINISTRATION</span>

          <h2>People &amp; Access</h2>

          <p>
            Manage roles, account states, locked identities and forgotten passwords without mixing
            security controls with profile data.
          </p>
        </div>

        <ShieldCheck />
      </section>

      {notice && !draft && (
        <div className="access-notice access-notice--success">
          <Check size={17} />

          {notice}

          <button type="button" onClick={() => setNotice(null)} aria-label="Close notification">
            <X size={16} />
          </button>
        </div>
      )}

      {error && !draft && (
        <div className="access-notice access-notice--error">
          <AlertCircle size={17} />

          {error}

          <button type="button" onClick={() => setError(null)} aria-label="Close error">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="access-panel">
        <header>
          <div>
            <h3>Accounts and permissions</h3>

          </div>

          <div className="access-tools">
            <label>
              <Search size={16} />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email or role"
              />
            </label>

            <button type="button" onClick={() => void load()} aria-label="Refresh accounts">
              <RefreshCw className={loading ? "spin" : undefined} size={17} />
            </button>
          </div>
        </header>

        <div className="access-status-filters">
          {(["ALL", "ACTIVE", "PENDING", "LOCKED", "DISABLED"] as const).map((status) => (
            <button
              type="button"
              key={status}
              className={statusFilter === status ? "active" : undefined}
              onClick={() => setStatusFilter(status)}
            >
              {status === "ALL" ? "All statuses" : status.charAt(0) + status.slice(1).toLowerCase()}
              <span>
                {status === "ALL"
                  ? users.length
                  : users.filter((user) => user.status === status).length}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="access-state">
            <LoaderCircle className="spin" />
            Loading access directory…
          </div>
        ) : (
          <div className="access-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Failed logins</th>
                  <th>Locked until</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((user) => {
                  const isSelf = currentUser?.id === user.id;

                  const isBusy = busy === user.id;

                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.display_name ?? "Unnamed account"}</strong>

                        <small>{user.email}</small>
                      </td>

                      <td>
                        <span
                          className={`access-role access-role--${user.role_code.toLowerCase()}`}
                        >
                          {user.role_name}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`access-status access-status--${user.status.toLowerCase()}`}
                        >
                          {user.status}
                        </span>
                      </td>

                      <td>{user.failed_login_count}</td>

                      <td>
                        {user.locked_until ? new Date(user.locked_until).toLocaleString() : "—"}
                      </td>

                      <td>
                        <button
                          type="button"
                          disabled={isBusy || isSelf}
                          title={isSelf ? "You cannot modify your own access here." : undefined}
                          onClick={() => openAccess(user)}
                        >
                          {isBusy ? (
                            <LoaderCircle className="spin" size={15} />
                          ) : (
                            <KeyRound size={15} />
                          )}
                          Manage access
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filtered.length && <div className="access-state">No matching accounts.</div>}
          </div>
        )}
      </section>

      {draft && (
        <div className="access-backdrop">
          <section
            className="access-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-dialog-title"
          >
            <header>
              <div>
                <span>ACCOUNT SECURITY</span>

                <h2 id="access-dialog-title">Manage access</h2>

                <p>
                  {draft.user.display_name ?? draft.user.email}
                  {" · "}
                  {draft.user.email}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDialogError(null);
                  setDraft(null);
                }}
                aria-label="Close dialog"
              >
                <X />
              </button>
            </header>

            <div className="access-dialog__body">
              {dialogError ? (
                <div className="access-dialog-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{dialogError}</span>
                </div>
              ) : null}
              {draft.user.status === "LOCKED" ? (
                <div className="access-control">
                  <div>
                    <strong>Locked account</strong>
                    <p>
                      Status: LOCKED. This is set automatically after failed logins, not from the
                      status list. Unlock to restore access.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setConfirmation({
                        kind: "UNLOCK",
                        user: draft.user
                      })
                    }
                  >
                    Review unlock
                  </button>
                </div>
              ) : (
                <>
                  <div className="access-control">
                    <div>
                      <strong>{draft.user.role_name}</strong>
                      <p>
                        Roles cannot be converted. Create a separate account when a person needs a
                        different identity.
                      </p>
                    </div>
                  </div>

                  <form className="access-control access-control--stack" onSubmit={reviewStatusChange}>
                    <label>
                      Status
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            status: event.target.value as EditableStatus
                          })
                        }
                      >
                        <option value="PENDING">Pending</option>
                        <option value="ACTIVE">Active</option>
                        <option value="DISABLED">Disabled</option>
                        <option value="LOCKED" disabled>
                          Locked (automatic after failed logins)
                        </option>
                      </select>
                    </label>

                    <button type="submit" disabled={draft.status === draft.user.status}>
                      Review status change
                    </button>
                  </form>
                </>
              )}

              <form className="access-control access-control--stack" onSubmit={reviewPasswordReset}>
                <div>
                  <strong>Reset password</strong>
                  <p>
                    Use this when the person has forgotten their password. They will be signed out
                    everywhere and must use this temporary password.
                  </p>
                </div>
                <label>
                  New temporary password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={draft.newPassword}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        newPassword: event.target.value
                      })
                    }
                  />
                </label>
                <label>
                  Confirm temporary password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={draft.confirmPassword}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        confirmPassword: event.target.value
                      })
                    }
                  />
                </label>
                {draft.newPassword && draft.confirmPassword && draft.newPassword !== draft.confirmPassword ? (
                  <p>The two passwords do not match.</p>
                ) : null}
                <button type="submit">Review password reset</button>
              </form>
            </div>
          </section>
        </div>
      )}

      {confirmation && (
        <ConfirmDialog
          title="Confirm security change"
          message={
            confirmation.kind === "STATUS"
              ? `Change ${confirmation.user.display_name ?? confirmation.user.email} to ${
                  confirmation.status
                }?`
              : confirmation.kind === "PASSWORD"
                ? `Set a new temporary password for ${
                    confirmation.user.display_name ?? confirmation.user.email
                  }? Existing sessions will be signed out.`
                : `Unlock ${confirmation.user.display_name ?? confirmation.user.email}?`
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void executeChange()}
        />
      )}
    </div>
  );
}
