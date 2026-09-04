import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  FileHeart,
  HeartPulse,
  LockKeyhole,
  Mail,
  Pill,
  ShieldCheck,
  UserRoundCheck
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getApiErrorMessage } from "../auth/authApi";

import "./LoginPage.css";

interface LocationState {
  from?: {
    pathname: string;
  };
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

  const [showPassword, setShowPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [formError, setFormError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  /*
   * Preserve the existing authentication behaviour.
   *
   * If the user is already authenticated and opens /login,
   * redirect them to the page they originally requested,
   * otherwise redirect to the authenticated home page.
   */
  if (isAuthenticated) {
    const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? "/";

    return <Navigate to={redirectTo} replace />;
  }

  function validate(): boolean {
    const errors: FieldErrors = {};

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      errors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      errors.email = "Enter a valid email address.";
    }

    if (!password) {
      errors.password = "Password is required.";
    }

    setFieldErrors(errors);

    return Object.keys(errors).length === 0;
  }

  function handleEmailChange(value: string): void {
    setEmail(value);

    if (fieldErrors.email) {
      setFieldErrors((current) => ({
        ...current,
        email: undefined
      }));
    }

    if (formError) {
      setFormError(null);
    }
  }

  function handlePasswordChange(value: string): void {
    setPassword(value);

    if (fieldErrors.password) {
      setFieldErrors((current) => ({
        ...current,
        password: undefined
      }));
    }

    if (formError) {
      setFormError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    setFormError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      /*
       * IMPORTANT:
       * This uses your existing AuthContext login()
       * implementation.
       *
       * No API/token/authentication logic is duplicated here.
       */
      await login({
        email: email.trim(),
        password
      });

      /*
       * Successful login updates AuthContext.
       * Once isAuthenticated becomes true,
       * the Navigate above redirects the user.
       */
    } catch (error) {
      setFormError(
        getApiErrorMessage(error, "Unable to sign in. Please check your credentials and try again.")
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Cliniq healthcare workspace">
        <div className="login-brand-content">
          <div className="brand-logo">
            <div className="brand-logo-icon">
              <HeartPulse size={28} strokeWidth={2} />
            </div>

            <div>
              <p className="brand-name">Cliniq</p>

              <p className="brand-system">Care, clearly connected</p>
            </div>
          </div>

          <div className="brand-message">
            <span className="brand-badge">
              <ShieldCheck size={15} />
              Clinic, pharmacy and patient — one record
            </span>

            <h1 className="display-font">
              From the visit
              <br />
              to the pharmacy.
            </h1>

            <p>
              The doctor writes the consultation and the prescription. The patient keeps that sheet
              electronically. The pharmacist finds it by patient's  name.
            </p>
          </div>

          <div className="brand-features">
            <div className="brand-feature">
              <div className="brand-feature-icon">
                <FileHeart size={21} />
              </div>

              <div>
                <strong>The doctor&apos;s record</strong>

                <span>Visits, allergies, conditions and the medicines just prescribed.</span>
              </div>
            </div>

            <div className="brand-feature">
              <div className="brand-feature-icon">
                <Pill size={21} />
              </div>

              <div>
                <strong>The pharmacist&apos;s lookup</strong>

                <span>Search the patient. Read quantity and how often to take it.</span>
              </div>
            </div>

            <div className="brand-feature">
              <div className="brand-feature-icon">
                <UserRoundCheck size={21} />
              </div>

              <div>
                <strong>The patient&apos;s copy</strong>

                <span>Your own health summary and the prescription as a digital sheet.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="brand-footer">
          <ShieldCheck size={15} />

          <span>A diploma prototype. Do not enter real patient information.</span>
        </div>
      </section>

      <section className="login-form-section">
        <div className="login-form-wrapper">
          <div className="mobile-brand">
            <div className="brand-logo-icon">
              <HeartPulse size={25} strokeWidth={2} />
            </div>

            <div>
              <p className="brand-name">Cliniq</p>

              <p className="brand-system">Care, clearly connected</p>
            </div>
          </div>

          <div className="login-heading">
            <span className="login-eyebrow">Cliniq</span>

            <h2 className="display-font">Sign in to continue</h2>

          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <div className="login-error-alert" role="alert">
                <div className="login-error-icon">!</div>

                <div>
                  <strong>Sign in unsuccessful</strong>

                  <p>{formError}</p>
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email address</label>

              <div className={`input-container ${fieldErrors.email ? "input-error" : ""}`}>
                <Mail className="input-icon" size={19} aria-hidden="true" />

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => handleEmailChange(event.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                />
              </div>

              {fieldErrors.email && (
                <p id="email-error" className="field-error">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="form-group">
              <div className="password-label-row">
                <label htmlFor="password">Password</label>
              </div>

              <div className={`input-container ${fieldErrors.password ? "input-error" : ""}`}>
                <LockKeyhole className="input-icon" size={19} aria-hidden="true" />

                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => handlePasswordChange(event.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={isSubmitting}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff size={19} aria-hidden="true" />
                  ) : (
                    <Eye size={19} aria-hidden="true" />
                  )}
                </button>
              </div>

              {fieldErrors.password && (
                <p id="password-error" className="field-error">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button className="sign-in-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />

                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>

                  <ArrowRight size={19} aria-hidden="true" />
                </>
              )}
            </button>

            <p className="login-signup-link">
              Don't have a patient account? <Link to="/signup">Create account</Link>
            </p>
            <p className="login-signup-link">
              Forgot your password? Ask an administrator to set a temporary one.
            </p>
          </form>

          <div className="login-security-note">
            <ShieldCheck size={16} aria-hidden="true" />

            <span>
              You only see the part of Cliniq that belongs to your role: clinic, pharmacy, patient
              portal or administration.
            </span>
          </div>
        </div>

        <footer className="login-footer">
          Cliniq — electronic record and prescription
        </footer>
      </section>
    </main>
  );
}
