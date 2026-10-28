/**
 * PostgREST calls go through Next.js `fetch`. A cached GET of the store row
 * would freeze `revision` for every warm instance, and the read cache would
 * treat that frozen revision as current. Opt out on every service-role call.
 */
export function fwetaSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, cache: "no-store" });
}
