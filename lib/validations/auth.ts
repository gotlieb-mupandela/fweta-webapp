import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(80),
  roles: z.array(z.enum(["brand", "influencer", "clipper"])).min(1),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(1000).optional(),
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
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
