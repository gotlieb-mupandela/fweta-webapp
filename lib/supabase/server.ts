import { cookies } from "next/headers";

import { createClient as createServerBrowserCookieClient } from "@/utils/supabase/server";

/**
 * Server Supabase client for Server Components, Server Actions, and Route Handlers.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerBrowserCookieClient(cookieStore);
}
