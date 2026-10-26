import { AuthStatus } from "@english-course/shared";
import { type LoaderFunctionArgs, redirect } from "react-router";
import { apiRequest } from "../../shared/api/http.ts";

export const login = (password: string) =>
  apiRequest("/api/auth/login", AuthStatus, { method: "POST", body: { password } });

export const logout = () => apiRequest("/api/auth/logout", AuthStatus, { method: "POST" });

/** Only same-app paths are allowed as a post-login target (no open redirects). */
export function safeNext(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** `reason=unavailable` makes the login page show a "Server unavailable" state with Retry. */
export function loginPath(next: string, reason?: "unavailable"): string {
  const params = new URLSearchParams();
  if (next !== "/") params.set("next", next);
  if (reason) params.set("reason", reason);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

/**
 * Route loader: only a 2xx session check opens the app. A 401 goes to the login page; a
 * 5xx or a network failure while online shows the "Server unavailable" state there.
 * The session check is never cached by the service worker.
 */
export async function requireAuth({ request }: LoaderFunctionArgs) {
  let res: Response | undefined;
  try {
    res = await fetch("/api/auth/me");
  } catch {
    // Offline: the session cannot be checked, so let cached pages open read-only.
    if (!navigator.onLine) return null;
  }
  if (res?.ok) return null;
  const url = new URL(request.url);
  const here = url.pathname + url.search;
  throw redirect(res?.status === 401 ? loginPath(here) : loginPath(here, "unavailable"));
}
