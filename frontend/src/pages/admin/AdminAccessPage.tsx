import { useCallback, useEffect, useMemo, useState } from "react";
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
  getRoles,
  getUsers,
  unlockUser,
  updateRole,
  updateStatus,
  type AdminUser,
  type EditableStatus,
  type Role
} from "../../api/adminApi";

import { useAuth } from "../../auth/AuthContext";
import type { UserRole } from "../../auth/types";
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
};

type Confirmation = {
  kind: "ROLE" | "STATUS" | "UNLOCK";
  user: AdminUser;
  role?: UserRole;
  status?: EditableStatus;
};

export function AdminAccessPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);

  const [roles, setRoles] = useState<Role[]>([]);

  const [query, setQuery] = useState("");

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<AccessDraft | null>(null);

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextUsers, nextRoles] = await Promise.all([getUsers(), getRoles()]);

      setUsers(nextUsers);
      setRoles(nextRoles);
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getUsers(), getRoles()])
      .then(([nextUsers, nextRoles]) => {
        if (!cancelled) {
          setUsers(nextUsers);
          setRoles(nextRoles);
        }
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

    if (!value) {
      return users;
    }

    return users.filter((user) =>
      [user.display_name ?? "", user.email, user.role_code, user.status]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [query, users]);

  function openAccess(user: AdminUser) {
    setDraft({
      user,
      role: user.role_code,
      status: user.status === "LOCKED" ? "ACTIVE" : user.status
    });
  }

  function isProfessionalRole(role: UserRole): role is "DOCTOR" | "PHARMACIST" {
    return role === "DOCTOR" || role === "PHARMACIST";
  }

  async function executeChange() {
    if (!confirmation) {
      return;
    }

    const action = confirmation;

    setConfirmation(null);
    setDraft(null);
    setBusy(action.user.id);
    setError(null);
    setNotice(null);

    try {
      if (action.kind === "ROLE" && action.role) {
        await updateRole(action.user.id, action.role);
      }

      if (action.kind === "STATUS" && action.status) {
        await updateStatus(action.user.id, action.status);
      }

      if (action.kind === "UNLOCK") {
        await unlockUser(action.user.id);
      }

      if (action.kind === "UNLOCK") {
        setNotice("Account unlocked.");
      } else if (action.kind === "ROLE") {
        setNotice("Role updated and sessions invalidated.");
      } else {
        setNotice("Account status updated.");
      }

      await load();
    } catch (operationError) {
      setError(message(operationError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="access-page">
      <section className="access-hero">
        <div>
          <span>SECURITY ADMINISTRATION</span>

          <h2>People &amp; Access</h2>

          <p>
            Manage roles, account states and locked identities without mixing security controls with
            profile data.
          </p>
        </div>

        <ShieldCheck />
      </section>

      {notice && (
        <div className="access-notice access-notice--success">
          <Check size={17} />

          {notice}

          <button type="button" onClick={() => setNotice(null)} aria-label="Close notification">
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
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

            <p>Profile information is managed from People Directory.</p>
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

              <button type="button" onClick={() => setDraft(null)} aria-label="Close dialog">
                <X />
              </button>
            </header>

            <div className="access-dialog__body">
              {draft.user.status === "LOCKED" ? (
                <div className="access-control">
                  <div>
                    <strong>Locked account</strong>

                    <p>Reset the failed-login counter and reactivate this account.</p>
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
                  {isProfessionalRole(draft.user.role_code) ? (
                    <div className="access-control">
                      <label>
                        Professional role
                        <select
                          value={draft.role}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              role: event.target.value as UserRole
                            })
                          }
                        >
                          {roles
                            .filter((role) => isProfessionalRole(role.code))
                            .map((role) => (
                              <option value={role.code} key={role.id}>
                                {role.name}
                              </option>
                            ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        disabled={draft.role === draft.user.role_code}
                        onClick={() =>
                          setConfirmation({
                            kind: "ROLE",
                            user: draft.user,
                            role: draft.role
                          })
                        }
                      >
                        Review role change
                      </button>
                    </div>
                  ) : (
                    <div className="access-control">
                      <div>
                        <strong>{draft.user.role_name}</strong>
                        <p>
                          Patient and administrator accounts are not converted into other account
                          types. Create a separate account when a person needs a different identity.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="access-control">
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
                      </select>
                    </label>

                    <button
                      type="button"
                      disabled={draft.status === draft.user.status}
                      onClick={() =>
                        setConfirmation({
                          kind: "STATUS",
                          user: draft.user,
                          status: draft.status
                        })
                      }
                    >
                      Review status change
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {confirmation && (
        <div className="access-backdrop">
          <section
            className="access-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <AlertCircle />

            <h2 id="confirm-title">Confirm security change</h2>

            <p>
              {confirmation.kind === "ROLE"
                ? `Change ${confirmation.user.display_name ?? confirmation.user.email} to ${
                    confirmation.role
                  }? Existing sessions will be invalidated.`
                : confirmation.kind === "STATUS"
                  ? `Change ${confirmation.user.display_name ?? confirmation.user.email} to ${
                      confirmation.status
                    }?`
                  : `Unlock ${confirmation.user.display_name ?? confirmation.user.email}?`}
            </p>

            <footer>
              <button type="button" onClick={() => setConfirmation(null)}>
                Cancel
              </button>

              <button type="button" onClick={() => void executeChange()}>
                Confirm
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
