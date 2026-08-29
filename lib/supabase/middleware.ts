/**
 * Supabase session refresh for Next.js middleware.
 */
export {
  createClient as createMiddlewareClient,
  updateSession,
} from "@/utils/supabase/middleware";
