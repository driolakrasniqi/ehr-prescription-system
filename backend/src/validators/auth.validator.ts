import { z } from "zod";

function isValidDateOnly(
  value: string
): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value
    );

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const dateOfBirthSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Date of birth must use YYYY-MM-DD format."
  )
  .refine((value) => {
    if (!isValidDateOnly(value)) return false;
    return new Date(`${value}T00:00:00Z`) <= new Date();
  }, "Enter a valid date of birth.");

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(
      1,
      "Email is required."
    )
    .email(
      "Enter a valid email address."
    ),

  password: z
    .string()
    .min(
      1,
      "Password is required."
    )
});

export const registerSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(
        2,
        "First name must contain at least 2 characters."
      )
      .max(
        100,
        "First name is too long."
      ),

    lastName: z
      .string()
      .trim()
      .min(
        2,
        "Last name must contain at least 2 characters."
      )
      .max(
        100,
        "Last name is too long."
      ),

    dateOfBirth: dateOfBirthSchema,

    sex: z.enum([
      "FEMALE",
      "MALE"
    ]),

    phone: z
      .string()
      .trim()
      .max(
        50,
        "Phone number is too long."
      )
      .optional(),

    email: z
      .string()
      .trim()
      .min(
        1,
        "Email is required."
      )
      .email(
        "Enter a valid email address."
      ),

    password: z
      .string()
      .min(
        12,
        "Password must contain at least 12 characters."
      )
      .max(
        128,
        "Password is too long."
      ),

    confirmPassword: z
      .string()
      .min(
        1,
        "Please confirm your password."
      )
  })
  .superRefine(
    (
      data,
      context
    ) => {
      if (
        data.password !==
        data.confirmPassword
      ) {
        context.addIssue({
          code: "custom",
          path: [
            "confirmPassword"
          ],
          message:
            "Passwords do not match."
        });
      }

    }
  );

export const changePasswordSchema =
  z
    .object({
      currentPassword: z
        .string()
        .min(
          1,
          "Current password is required."
        ),

      newPassword: z
        .string()
        .min(
          12,
          "New password must contain at least 12 characters."
        )
        .max(
          128,
          "New password is too long."
        ),

      confirmPassword: z
        .string()
        .min(
          1,
          "Please confirm your new password."
        )
    })
    .superRefine(
      (
        data,
        context
      ) => {
        if (
          data.newPassword !==
          data.confirmPassword
        ) {
          context.addIssue({
            code: "custom",
            path: [
              "confirmPassword"
            ],
            message:
              "Passwords do not match."
          });
        }

        if (
          data.newPassword ===
          data.currentPassword
        ) {
          context.addIssue({
            code: "custom",
            path: [
              "newPassword"
            ],
            message:
              "The new password must be different."
          });
        }
      }
    );

export type LoginInput =
  z.infer<
    typeof loginSchema
  >;

export type RegisterInput =
  z.infer<
    typeof registerSchema
  >;

export type ChangePasswordInput =
  z.infer<
    typeof changePasswordSchema
  >;