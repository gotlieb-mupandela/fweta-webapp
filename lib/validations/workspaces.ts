import { z } from "zod";

export const workspaceRoleSchema = z.enum(["manager", "viewer"]);

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email().max(160),
  role: workspaceRoleSchema,
});

export const memberIdSchema = z.string().uuid();
export const workspaceIdSchema = z.string().uuid();
