import {
  DEFAULT_SCRYPT,
  hashPassword,
  normalizeEmail,
  type ScryptParams,
  verifyPassword,
} from "../auth/password.ts";
import type { UserPatch, UserRecord, UserStore } from "./users.store.ts";

export type BootstrapResult = {
  action: "created" | "updated" | "unchanged";
  user: UserRecord;
};

/**
 * Makes the `.env` user (APP_USER_EMAIL / APP_USER_PASSWORD) the admin, on every api start:
 * - a user with that email exists: it becomes admin and gets the password;
 * - otherwise the oldest admin is moved to the new email (changing APP_USER_EMAIL never
 *   creates a second admin);
 * - otherwise (first start) the admin is created.
 * A changed email or password bumps the session epoch, ending that user's sessions.
 * Any other admin is demoted to learner, so there is always exactly one admin.
 */
export async function bootstrapAdmin(
  store: UserStore,
  credentials: { email: string; password: string },
  params: ScryptParams = DEFAULT_SCRYPT,
): Promise<BootstrapResult> {
  const email = normalizeEmail(credentials.email);
  const target = (await store.findByEmail(email)) ?? (await store.listAdmins())[0];
  if (!target) {
    const passwordHash = await hashPassword(credentials.password, params);
    return { action: "created", user: await store.insert({ email, passwordHash, role: "admin" }) };
  }

  const patch: UserPatch = {};
  if (target.email !== email) patch.email = email;
  if (target.role !== "admin") patch.role = "admin";
  if (!(await verifyPassword(credentials.password, target.passwordHash))) {
    patch.passwordHash = await hashPassword(credentials.password, params);
  }
  // The .env user is the only admin: any other admin is demoted and signed out.
  for (const other of await store.listAdmins()) {
    if (other.id !== target.id) {
      await store.update(other.id, { role: "learner", revokeSessions: true });
    }
  }
  if (Object.keys(patch).length === 0) return { action: "unchanged", user: target };
  if (patch.email !== undefined || patch.passwordHash !== undefined) patch.revokeSessions = true;
  return { action: "updated", user: await store.update(target.id, patch) };
}
