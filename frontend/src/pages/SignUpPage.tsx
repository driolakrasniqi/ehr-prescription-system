import {
  useState,
  type FormEvent
} from "react";

import {
  Link,
  Navigate
} from "react-router-dom";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  HeartPulse,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  UserRound
} from "lucide-react";

import {
  useAuth
} from "../auth/AuthContext";

import {
  getApiErrorMessage,
  registerRequest
} from "../auth/authApi";

import "./SignUpPage.css";

type PatientSex =
  | ""
  | "FEMALE"
  | "MALE";

interface FormState {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: PatientSex;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  sex?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialForm: FormState = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  sex: "",
  phone: "",
  email: "",
  password: "",
  confirmPassword: ""
};

export function SignUpPage() {
  const {
    isAuthenticated
  } = useAuth();

  const [
    form,
    setForm
  ] = useState<FormState>(
    initialForm
  );

  const [
    fieldErrors,
    setFieldErrors
  ] = useState<FieldErrors>({});

  const [
    formError,
    setFormError
  ] = useState<string | null>(
    null
  );

  const [
    isSubmitting,
    setIsSubmitting
  ] = useState(false);

  const [
    showPassword,
    setShowPassword
  ] = useState(false);

  const [
    registrationComplete,
    setRegistrationComplete
  ] = useState(false);

  if (isAuthenticated) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  function updateField<
    K extends keyof FormState
  >(
    field: K,
    value: FormState[K]
  ): void {
    setForm(
      (current) => ({
        ...current,
        [field]: value
      })
    );

    if (field in fieldErrors) {
      setFieldErrors(
        (current) => ({
          ...current,
          [field]: undefined
        })
      );
    }

    setFormError(null);
  }

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (
      form.firstName
        .trim()
        .length < 2
    ) {
      errors.firstName =
        "Enter your first name.";
    }

    if (
      form.lastName
        .trim()
        .length < 2
    ) {
      errors.lastName =
        "Enter your last name.";
    }

    if (!form.dateOfBirth) {
      errors.dateOfBirth =
        "Date of birth is required.";
    } else {
      const birthDate =
        new Date(
          `${form.dateOfBirth}T00:00:00`
        );

      if (
        Number.isNaN(
          birthDate.getTime()
        ) ||
        birthDate > new Date()
      ) {
        errors.dateOfBirth =
          "Enter a valid date of birth.";
      }
    }

    if (!form.sex) {
      errors.sex =
        "Please select gender.";
    }

    const email =
      form.email.trim();

    if (!email) {
      errors.email =
        "Email is required.";
    } else if (
      !EMAIL_PATTERN.test(email)
    ) {
      errors.email =
        "Enter a valid email address.";
    }

    if (
      form.password.length < 8
    ) {
      errors.password =
        "Password must contain at least 8 characters.";
    }

    if (
      form.confirmPassword !==
      form.password
    ) {
      errors.confirmPassword =
        "Passwords do not match.";
    }

    setFieldErrors(errors);

    return (
      Object.keys(errors).length === 0
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    setFormError(null);

    if (!validate()) {
      return;
    }

    if (
      form.sex !== "FEMALE" &&
      form.sex !== "MALE"
    ) {
      setFieldErrors(
        (current) => ({
          ...current,
          sex:
            "Please select gender."
        })
      );

      return;
    }

    const selectedSex =
      form.sex;

    setIsSubmitting(true);

    try {
      await registerRequest({
        firstName:
          form.firstName.trim(),

        lastName:
          form.lastName.trim(),

        dateOfBirth:
          form.dateOfBirth,

        sex:
          selectedSex,

        phone:
          form.phone.trim() ||
          undefined,

        email:
          form.email
            .trim()
            .toLowerCase(),

        password:
          form.password,

        confirmPassword:
          form.confirmPassword
      });

      setRegistrationComplete(
        true
      );
    } catch (error) {
      setFormError(
        getApiErrorMessage(
          error,
          "Unable to create your account. Please try again."
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (registrationComplete) {
    return (
      <main className="signup-page">
        <section className="signup-success">
          <div className="signup-success-icon">
            <CheckCircle2
              size={38}
            />
          </div>

          <h1>
            Account created
          </h1>

          <p>
            Your patient account
            has been created
            successfully.
          </p>

          <Link
            to="/login"
            className="signup-primary-link"
          >
            Continue to Sign In

            <ArrowRight
              size={18}
            />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="signup-page">
      <section className="signup-brand-panel">
        <div>
          <div className="signup-brand">
            <div className="signup-logo">
              <HeartPulse
                size={27}
              />
            </div>

            <div>
              <strong>
                EHR &amp;
                E-Prescription
              </strong>

              <span>
                Healthcare
                Management System
              </span>
            </div>
          </div>

          <div className="signup-brand-copy">
            <span className="signup-secure-badge">
              <ShieldCheck
                size={15}
              />

              Secure patient access
            </span>

            <h1>
              Your health record,
              accessible when you
              need it.
            </h1>

            <p>
              Create your patient
              account to securely
              access your medical
              information,
              prescriptions and
              healthcare activity.
            </p>
          </div>
        </div>

        <div className="signup-professional-note">
          <ShieldCheck
            size={18}
          />

          <div>
            <strong>
              Healthcare
              professional?
            </strong>

            <p>
              Doctor, pharmacist and
              administrator accounts
              are provisioned through
              system administration.
            </p>
          </div>
        </div>
      </section>

      <section className="signup-form-panel">
        <div className="signup-form-wrapper">
          <div className="signup-heading">
            <span>
              PATIENT REGISTRATION
            </span>

            <h2>
              Create your account
            </h2>

            <p>
              Enter your information
              to create secure access
              to the patient portal.
            </p>
          </div>

          {formError && (
            <div
              className="signup-error"
              role="alert"
            >
              {formError}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="signup-form"
            noValidate
          >
            <div className="signup-two-columns">
              <div className="signup-field">
                <label htmlFor="firstName">
                  First name
                </label>

                <div className="signup-input">
                  <UserRound
                    size={18}
                  />

                  <input
                    id="firstName"
                    autoComplete="given-name"
                    value={
                      form.firstName
                    }
                    disabled={
                      isSubmitting
                    }
                    onChange={(event) =>
                      updateField(
                        "firstName",
                        event.target.value
                      )
                    }
                    aria-invalid={
                      Boolean(
                        fieldErrors.firstName
                      )
                    }
                    aria-describedby={
                      fieldErrors.firstName
                        ? "first-name-error"
                        : undefined
                    }
                  />
                </div>

                {fieldErrors.firstName && (
                  <p
                    id="first-name-error"
                    className="signup-field-error"
                  >
                    {
                      fieldErrors.firstName
                    }
                  </p>
                )}
              </div>

              <div className="signup-field">
                <label htmlFor="lastName">
                  Last name
                </label>

                <div className="signup-input">
                  <UserRound
                    size={18}
                  />

                  <input
                    id="lastName"
                    autoComplete="family-name"
                    value={
                      form.lastName
                    }
                    disabled={
                      isSubmitting
                    }
                    onChange={(event) =>
                      updateField(
                        "lastName",
                        event.target.value
                      )
                    }
                    aria-invalid={
                      Boolean(
                        fieldErrors.lastName
                      )
                    }
                    aria-describedby={
                      fieldErrors.lastName
                        ? "last-name-error"
                        : undefined
                    }
                  />
                </div>

                {fieldErrors.lastName && (
                  <p
                    id="last-name-error"
                    className="signup-field-error"
                  >
                    {
                      fieldErrors.lastName
                    }
                  </p>
                )}
              </div>
            </div>

            <div className="signup-two-columns">
              <div className="signup-field">
                <label htmlFor="dateOfBirth">
                  Date of birth
                </label>

                <div className="signup-input">
                  <CalendarDays
                    size={18}
                  />

                  <input
                    id="dateOfBirth"
                    type="date"
                    autoComplete="bday"
                    value={
                      form.dateOfBirth
                    }
                    disabled={
                      isSubmitting
                    }
                    onChange={(event) =>
                      updateField(
                        "dateOfBirth",
                        event.target.value
                      )
                    }
                    aria-invalid={
                      Boolean(
                        fieldErrors.dateOfBirth
                      )
                    }
                    aria-describedby={
                      fieldErrors.dateOfBirth
                        ? "date-of-birth-error"
                        : undefined
                    }
                  />
                </div>

                {fieldErrors.dateOfBirth && (
                  <p
                    id="date-of-birth-error"
                    className="signup-field-error"
                  >
                    {
                      fieldErrors.dateOfBirth
                    }
                  </p>
                )}
              </div>

              <div className="signup-field">
                <label htmlFor="sex">
                  Gender
                </label>

                <div className="signup-input">
                  <select
                    id="sex"
                    value={
                      form.sex
                    }
                    disabled={
                      isSubmitting
                    }
                    onChange={(event) => {
                      const value =
                        event.target.value;

                      if (
                        value === "" ||
                        value === "FEMALE" ||
                        value === "MALE"
                      ) {
                        updateField(
                          "sex",
                          value
                        );
                      }
                    }}
                    aria-invalid={
                      Boolean(
                        fieldErrors.sex
                      )
                    }
                    aria-describedby={
                      fieldErrors.sex
                        ? "sex-error"
                        : undefined
                    }
                  >
                    <option
                      value=""
                      disabled
                    >
                      Select gender
                    </option>

                    <option value="FEMALE">
                      Female
                    </option>

                    <option value="MALE">
                      Male
                    </option>
                  </select>
                </div>

                {fieldErrors.sex && (
                  <p
                    id="sex-error"
                    className="signup-field-error"
                  >
                    {
                      fieldErrors.sex
                    }
                  </p>
                )}
              </div>
            </div>

            <div className="signup-field">
              <label htmlFor="phone">
                Phone
                <span>
                  {" "}optional
                </span>
              </label>

              <div className="signup-input">
                <Phone
                  size={18}
                />

                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={
                    form.phone
                  }
                  disabled={
                    isSubmitting
                  }
                  onChange={(event) =>
                    updateField(
                      "phone",
                      event.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="signup-field">
              <label htmlFor="signup-email">
                Email address
              </label>

              <div className="signup-input">
                <Mail
                  size={18}
                />

                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={
                    form.email
                  }
                  disabled={
                    isSubmitting
                  }
                  onChange={(event) =>
                    updateField(
                      "email",
                      event.target.value
                    )
                  }
                  aria-invalid={
                    Boolean(
                      fieldErrors.email
                    )
                  }
                  aria-describedby={
                    fieldErrors.email
                      ? "signup-email-error"
                      : undefined
                  }
                />
              </div>

              {fieldErrors.email && (
                <p
                  id="signup-email-error"
                  className="signup-field-error"
                >
                  {
                    fieldErrors.email
                  }
                </p>
              )}
            </div>

            <div className="signup-field">
              <label htmlFor="signup-password">
                Password
              </label>

              <div className="signup-input">
                <LockKeyhole
                  size={18}
                />

                <input
                  id="signup-password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  value={
                    form.password
                  }
                  disabled={
                    isSubmitting
                  }
                  onChange={(event) =>
                    updateField(
                      "password",
                      event.target.value
                    )
                  }
                  aria-invalid={
                    Boolean(
                      fieldErrors.password
                    )
                  }
                  aria-describedby={
                    fieldErrors.password
                      ? "signup-password-error"
                      : undefined
                  }
                />

                <button
                  type="button"
                  className="signup-password-toggle"
                  onClick={() =>
                    setShowPassword(
                      (current) =>
                        !current
                    )
                  }
                  disabled={
                    isSubmitting
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff
                      size={18}
                    />
                  ) : (
                    <Eye
                      size={18}
                    />
                  )}
                </button>
              </div>

              {fieldErrors.password && (
                <p
                  id="signup-password-error"
                  className="signup-field-error"
                >
                  {
                    fieldErrors.password
                  }
                </p>
              )}
            </div>

            <div className="signup-field">
              <label htmlFor="confirmPassword">
                Confirm password
              </label>

              <div className="signup-input">
                <LockKeyhole
                  size={18}
                />

                <input
                  id="confirmPassword"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  value={
                    form.confirmPassword
                  }
                  disabled={
                    isSubmitting
                  }
                  onChange={(event) =>
                    updateField(
                      "confirmPassword",
                      event.target.value
                    )
                  }
                  aria-invalid={
                    Boolean(
                      fieldErrors.confirmPassword
                    )
                  }
                  aria-describedby={
                    fieldErrors.confirmPassword
                      ? "confirm-password-error"
                      : undefined
                  }
                />
              </div>

              {fieldErrors.confirmPassword && (
                <p
                  id="confirm-password-error"
                  className="signup-field-error"
                >
                  {
                    fieldErrors.confirmPassword
                  }
                </p>
              )}
            </div>

            <button
              type="submit"
              className="signup-submit"
              disabled={
                isSubmitting
              }
            >
              {isSubmitting
                ? "Creating account..."
                : "Create patient account"}

              {!isSubmitting && (
                <ArrowRight
                  size={18}
                />
              )}
            </button>
          </form>

          <p className="signup-login-link">
            Already have an account?
            {" "}

            <Link to="/login">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}