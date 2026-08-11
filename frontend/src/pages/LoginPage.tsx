import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getApiErrorMessage } from "../auth/authApi";

interface LocationState {
  from?: { pathname: string };
}

interface FieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already signed in (e.g. navigated back to /login manually) —
  // send them where they were headed, or home.
  if (isAuthenticated) {
    const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (!email.trim()) {
      errors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = "Enter a valid email address.";
    }

    if (!password) {
      errors.password = "Password is required.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login({ email: email.trim(), password });
      // Successful login flips `isAuthenticated` to true; the
      // early-return above then redirects on the next render.
    } catch (error) {
      setFormError(
        getApiErrorMessage(error, "Unable to sign in. Please check your credentials and try again.")
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", padding: "0 1rem", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>Sign in</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="email" style={{ display: "block", marginBottom: "0.25rem" }}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
            style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          {fieldErrors.email && (
            <p id="email-error" style={{ color: "#c0392b", fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: "0.25rem" }}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
            style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
          />
          {fieldErrors.password && (
            <p id="password-error" style={{ color: "#c0392b", fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
              {fieldErrors.password}
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" style={{ color: "#c0392b", marginBottom: "1rem" }}>
            {formError}
          </p>
        )}

        <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "0.6rem" }}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
