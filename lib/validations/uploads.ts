import { z } from "zod";

export const createUgcUploadSchema = z.object({
  applicationId: z.string().trim().min(8).max(80),
  byteSize: z.number().int().positive(),
});

export const finalizeUgcUploadSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  applicationId: z.string().trim().min(8).max(80),
  originalName: z.string().trim().max(80).optional(),
});

export const stagedUgcFileSchema = z.object({
  id: z.string().trim().min(8).max(80),
  name: z.string().trim().min(3).max(240),
  originalName: z.string().trim().min(1).max(80),
  kind: z.enum(["video", "raw"]),
});

export const submitStagedDeliverySchema = z.object({
  applicationId: z.string().trim().min(8).max(80),
  files: z.array(stagedUgcFileSchema).min(1).max(6),
});
