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

export const loginPath = (next: string) =>
  next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

/** Route loader: sends the visitor to the login page when the api reports no session. */
export async function requireAuth({ request }: LoaderFunctionArgs) {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) {
    const url = new URL(request.url);
    throw redirect(loginPath(url.pathname + url.search));
  }
  return null;
}
