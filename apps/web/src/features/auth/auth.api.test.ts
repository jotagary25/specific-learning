import type { LoaderFunctionArgs } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onSessionEnd, STUDY_CACHE } from "../../shared/api/session-cache.ts";
import { logout, requireAuth } from "./auth.api.ts";

const loaderArgs = (url: string) =>
  ({ request: new Request(url), params: {}, context: {} }) as unknown as LoaderFunctionArgs;

const answer = (status: number, body: unknown) =>
  vi.fn(async () => Response.json(body, { status }));

describe("session data cleanup", () => {
  let cachesDelete: ReturnType<typeof vi.fn<(name: string) => Promise<boolean>>>;
  let queryCacheCleared: ReturnType<typeof vi.fn<() => void>>;
  let unsubscribe: () => void;

  beforeEach(() => {
    cachesDelete = vi.fn(async (_name: string) => true);
    vi.stubGlobal("caches", { delete: cachesDelete });
    queryCacheCleared = vi.fn<() => void>();
    unsubscribe = onSessionEnd(queryCacheCleared);
  });

  afterEach(() => {
    unsubscribe();
    vi.unstubAllGlobals();
  });

  it("deletes only the api-study cache and clears the query cache on logout", async () => {
    vi.stubGlobal("fetch", answer(200, { authenticated: false, revoked: true }));

    await logout();

    expect(cachesDelete).toHaveBeenCalledTimes(1);
    expect(cachesDelete).toHaveBeenCalledWith(STUDY_CACHE);
    expect(STUDY_CACHE).toBe("api-study");
    expect(queryCacheCleared).toHaveBeenCalledTimes(1);
  });

  it("still clears cached data when the logout request fails", async () => {
    vi.stubGlobal("fetch", answer(500, { error: "boom", message: "Boom" }));

    await expect(logout()).rejects.toThrow("Boom");

    expect(cachesDelete).toHaveBeenCalledWith(STUDY_CACHE);
    expect(queryCacheCleared).toHaveBeenCalledTimes(1);
  });

  it("clears cached data when the session check answers 401", async () => {
    vi.stubGlobal("fetch", answer(401, { error: "unauthorized", message: "Log in first" }));

    await expect(requireAuth(loaderArgs("http://localhost/units/3"))).rejects.toBeInstanceOf(
      Response,
    );

    expect(cachesDelete).toHaveBeenCalledWith(STUDY_CACHE);
    expect(queryCacheCleared).toHaveBeenCalledTimes(1);
  });

  it("keeps cached data when the session is valid or the server is unavailable", async () => {
    vi.stubGlobal("fetch", answer(200, { authenticated: true }));
    expect(await requireAuth(loaderArgs("http://localhost/units"))).toBeNull();

    vi.stubGlobal("fetch", answer(503, { error: "session-store-unavailable", message: "Down" }));
    const thrown = await requireAuth(loaderArgs("http://localhost/units")).catch((e) => e);
    expect((thrown as Response).headers.get("location")).toBe(
      "/login?next=%2Funits&reason=unavailable",
    );

    expect(cachesDelete).not.toHaveBeenCalled();
    expect(queryCacheCleared).not.toHaveBeenCalled();
  });

  it("works where Cache Storage is unavailable", async () => {
    // Absent, not undefined: `unstubAllGlobals` restores the original state afterwards.
    Reflect.deleteProperty(globalThis, "caches");
    vi.stubGlobal("fetch", answer(200, { authenticated: false, revoked: false }));

    await expect(logout()).resolves.toEqual({ authenticated: false });
    expect(queryCacheCleared).toHaveBeenCalledTimes(1);
  });
});
