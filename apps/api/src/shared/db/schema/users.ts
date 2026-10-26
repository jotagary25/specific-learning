import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** `admin` is the `.env` user (APP_USER_EMAIL); `learner` is reserved for users added later. */
export type UserRole = "admin" | "learner";

/**
 * Account that owns learner data. `email` is stored lowercased (unique, case-insensitive by
 * construction); `password_hash` is a self-describing scrypt hash (see auth/password.ts).
 * `session_epoch` is the per-user revocation counter: bumping it ends that user's sessions.
 */
export const appUser = pgTable(
  "app_user",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull().default("learner"),
    sessionEpoch: integer("session_epoch").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("app_user_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("app_user_role_valid", sql`${t.role} in ('admin', 'learner')`),
  ],
);

/** Owner column of every learner-data table: deleting a user deletes their data. */
export const userIdColumn = () =>
  uuid("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" });
