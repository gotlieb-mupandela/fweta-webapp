import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(80).optional(),
  roles: z.array(z.enum(["brand", "influencer", "clipper"])).min(1),
});

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(80, "Display name must be 80 characters or fewer."),
  bio: z.string().max(1000, "Bio must be 1,000 characters or fewer.").optional(),
});

export const rolesUpdateSchema = z.object({
  roles: z.array(z.enum(["brand", "influencer", "clipper", "admin"])).min(1),
  primaryRole: z.enum(["brand", "influencer", "clipper", "admin"]),
});

export const notificationPrefsSchema = z.object({
  notifyEmail: z.boolean(),
  notifyWithdrawals: z.boolean(),
  notifyBookings: z.boolean(),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8).max(72, "Use 72 characters or fewer."),
    confirmPassword: z.string().min(8).max(72, "Use 72 characters or fewer."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must be different from the current password.",
    path: ["newPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password: z.string().min(8).max(72, "Use 72 characters or fewer."),
    confirmPassword: z.string().min(8).max(72, "Use 72 characters or fewer."),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
