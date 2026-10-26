import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import { appUser, type UserRole } from "../shared/db/schema/index.ts";

export type UserRecord = {
  id: string;
  /** Always lowercased. */
  email: string;
  passwordHash: string;
  role: UserRole;
  /** Revocation counter carried by session tokens; bumping it ends the user's sessions. */
  sessionEpoch: number;
};

export type NewUser = Pick<UserRecord, "email" | "passwordHash" | "role">;

export type UserPatch = Partial<NewUser> & {
  /** Also bump `session_epoch`, ending every session of the user. */
  revokeSessions?: boolean;
};

/** Persistence port for accounts. Emails are passed already normalized (lowercased). */
export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | undefined>;
  findById(id: string): Promise<UserRecord | undefined>;
  /** Admins, oldest first. */
  listAdmins(): Promise<UserRecord[]>;
  /** Every user id, oldest first (background jobs iterate them). */
  listIds(): Promise<string[]>;
  insert(user: NewUser): Promise<UserRecord>;
  update(id: string, patch: UserPatch): Promise<UserRecord>;
  bumpSessionEpoch(id: string): Promise<void>;
}

const columns = {
  id: appUser.id,
  email: appUser.email,
  passwordHash: appUser.passwordHash,
  role: appUser.role,
  sessionEpoch: appUser.sessionEpoch,
};

export function createDrizzleUserStore(db: Db): UserStore {
  return {
    async findByEmail(email) {
      const [row] = await db.select(columns).from(appUser).where(eq(appUser.email, email));
      return row;
    },
    async findById(id) {
      const [row] = await db.select(columns).from(appUser).where(eq(appUser.id, id));
      return row;
    },
    async listAdmins() {
      return db
        .select(columns)
        .from(appUser)
        .where(eq(appUser.role, "admin"))
        .orderBy(asc(appUser.createdAt), asc(appUser.id));
    },
    async listIds() {
      const rows = await db
        .select({ id: appUser.id })
        .from(appUser)
        .orderBy(asc(appUser.createdAt), asc(appUser.id));
      return rows.map((row) => row.id);
    },
    async insert(user) {
      const [row] = await db.insert(appUser).values(user).returning(columns);
      if (!row) throw new Error("users: insert returned no row");
      return row;
    },
    async update(id, { revokeSessions, ...patch }) {
      const [row] = await db
        .update(appUser)
        .set({
          ...patch,
          ...(revokeSessions ? { sessionEpoch: sql`${appUser.sessionEpoch} + 1` } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(appUser.id, id))
        .returning(columns);
      if (!row) throw new Error(`users: no user ${id}`);
      return row;
    },
    async bumpSessionEpoch(id) {
      await db
        .update(appUser)
        .set({ sessionEpoch: sql`${appUser.sessionEpoch} + 1`, updatedAt: sql`now()` })
        .where(eq(appUser.id, id));
    },
  };
}

/** In-memory store for tests; `users` exposes the rows. */
export function createMemoryUserStore(): UserStore & { users: Map<string, UserRecord> } {
  const users = new Map<string, UserRecord>();
  let next = 0;
  const copy = (user: UserRecord | undefined) => (user ? { ...user } : undefined);
  return {
    users,
    findByEmail: async (email) => copy([...users.values()].find((u) => u.email === email)),
    findById: async (id) => copy(users.get(id)),
    listAdmins: async () =>
      [...users.values()].filter((u) => u.role === "admin").map((u) => ({ ...u })),
    listIds: async () => [...users.keys()],
    async insert(user) {
      if ([...users.values()].some((u) => u.email === user.email)) {
        throw new Error(`users: duplicate email ${user.email}`);
      }
      next += 1;
      const id = `00000000-0000-7000-8000-${String(next).padStart(12, "0")}`;
      const row: UserRecord = { id, sessionEpoch: 0, ...user };
      users.set(id, row);
      return { ...row };
    },
    async update(id, { revokeSessions, ...patch }) {
      const row = users.get(id);
      if (!row) throw new Error(`users: no user ${id}`);
      Object.assign(row, patch);
      if (revokeSessions) row.sessionEpoch += 1;
      return { ...row };
    },
    async bumpSessionEpoch(id) {
      const row = users.get(id);
      if (row) row.sessionEpoch += 1;
    },
  };
}
