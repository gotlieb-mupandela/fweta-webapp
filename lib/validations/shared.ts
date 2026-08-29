import { z } from "zod";

export const accountTypeSchema = z.enum(["cheque", "savings", "transmission"]);

export const campaignTypeSchema = z.enum(["clipping", "ugc"]);

export const socialPlatformSchema = z.enum(["tiktok", "youtube", "instagram", "x"]);
