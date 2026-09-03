import { useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { changePasswordRequest, getApiErrorMessage, logoutAllRequest } from "../auth/authApi";
import { useAuth } from "../auth/AuthContext";
import { setAccessToken } from "../auth/tokenStore";
import "./SettingsPage.css";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function change(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.newPassword.length < 12) {
      setError("The new password must contain at least 12 characters.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await changePasswordRequest(form);
      setAccessToken(null);
      setDone("Password changed. Sign in again with your new password.");
      setTimeout(() => navigate("/login", { replace: true }), 1300);
    } catch (e) {
      setError(getApiErrorMessage(e, "Unable to change your password."));
    } finally {
      setBusy(false);
    }
  }
  async function all() {
    setBusy(true);
    setError(null);
    try {
      await logoutAllRequest();
      setAccessToken(null);
      await logout();
      navigate("/login", { replace: true });
    } catch (e) {
      setError(getApiErrorMessage(e, "Unable to end all sessions."));
      setBusy(false);
    }
  }
  return (
    <div className="settings-page">
      <section className="settings-intro">
        <span>ACCOUNT PROTECTION</span>
        <h2 className="display-font">Security that stays understandable</h2>
        <p>Review your identity and control every active session connected to your account.</p>
      </section>
      {error && <div className="settings-message settings-message--error">{error}</div>}
      {done && (
        <div className="settings-message">
          <CheckCircle2 size={17} />
          {done}
        </div>
      )}
      <div className="settings-grid">
        <section className="settings-card">
          <header>
            <span>
              <KeyRound />
            </span>
            <div>
              <h3>Change password</h3>
              <p>This signs you out everywhere after the change.</p>
            </div>
          </header>
          <form onSubmit={change}>
            <label>
              Current password
              <input
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                minLength={12}
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                required
              />
              <small>Use at least 12 characters.</small>
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                required
              />
            </label>
            <button disabled={busy}>
              {busy ? <LoaderCircle className="spin" /> : <ShieldCheck />} Update password
            </button>
          </form>
        </section>
        <section className="settings-card settings-card--account">
          <header>
            <span>
              <ShieldCheck />
            </span>
            <div>
              <h3>Current identity</h3>
              <p>Loaded directly from your protected account endpoint.</p>
            </div>
          </header>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{user?.displayName ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user?.role}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{user?.status}</dd>
            </div>
          </dl>
          <div className="danger-zone">
            <div>
              <strong>End every session</strong>
              <p>Revoke refresh tokens and invalidate all access tokens.</p>
            </div>
            <button disabled={busy} onClick={() => void all()}>
              <LogOut /> Log out everywhere
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
