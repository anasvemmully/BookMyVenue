import { Gender } from "@prisma/client";
import { z } from "zod";

const trimmedMinString = (minLen: number, message: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(minLen, message));

const profileFieldsSchema = z
  .object({
    firstName: trimmedMinString(1, "First name is required"),
    lastName: trimmedMinString(1, "Last name is required"),
    bio: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "Bio is required").max(1000, "Bio must be at most 1000 characters")),
    dateOfBirth: z.string().date("Invalid date of birth"),
    gender: z.nativeEnum(Gender, { message: "Invalid gender" }),
    address: trimmedMinString(1, "Address is required"),
    city: trimmedMinString(1, "City is required"),
    state: trimmedMinString(1, "State is required"),
    country: trimmedMinString(1, "Country is required"),
    pincode: z
      .string()
      .transform((value) => value.trim())
      .pipe(
        z.string().min(1, "Pincode is required").max(20, "Pincode must be at most 20 characters")
      ),
    avatarUrl: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().url("Invalid avatar URL")),
  })
  .strict();

export const updateProfileSchema = profileFieldsSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
