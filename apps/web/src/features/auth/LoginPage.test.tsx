import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderAt } from "../../test/render.tsx";
import { safeNext } from "./auth.api.ts";

describe("login flow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("redirects to the login page without a session and returns after logging in", async () => {
    let loggedIn = false;
    const fetchMock = mockApi({
      "GET /api/auth/me": () =>
        loggedIn
          ? Response.json({ authenticated: true })
          : Response.json({ error: "unauthorized", message: "Log in first" }, { status: 401 }),
      "POST /api/auth/login": ({ body }) => {
        loggedIn = (body as { password: string }).password === "secret";
        return loggedIn
          ? Response.json({ authenticated: true })
          : Response.json(
              { error: "invalid_credentials", message: "Wrong password" },
              { status: 401 },
            );
      },
      "GET /api/settings/ai-key": () =>
        Response.json({ configured: false, source: null, last4: null }),
      "GET /api/settings/ai-functions": () => Response.json({ functions: [] }),
      "GET /api/settings/models": () => Response.json({ models: [] }),
    });

    const { router } = renderAt("/settings");

    const password = await screen.findByLabelText("Password");
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe("?next=%2Fsettings");

    fireEvent.change(password, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Wrong password.")).toBeTruthy();

    fireEvent.change(password, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/settings");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ password: "secret" }) }),
    );
  });

  it("shows the rate limit message", async () => {
    mockApi({
      "POST /api/auth/login": () =>
        Response.json({ error: "rate_limited", message: "Too many" }, { status: 429 }),
    });
    renderAt("/login");

    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Too many attempts/));
  });
});

describe("session check when the server is unavailable", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a server unavailable state instead of opening the app on a 5xx", async () => {
    let up = false;
    mockApi({
      "GET /api/auth/me": () =>
        up
          ? Response.json({ authenticated: true })
          : Response.json({ error: "internal", message: "boom" }, { status: 503 }),
      "GET /api/settings/ai-key": () =>
        Response.json({ configured: false, source: null, last4: null }),
      "GET /api/settings/ai-functions": () => Response.json({ functions: [] }),
      "GET /api/settings/models": () => Response.json({ models: [] }),
    });

    const { router } = renderAt("/settings");

    expect(await screen.findByText(/Server unavailable/)).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();

    up = true;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("shows the same state when the request fails while online", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    renderAt("/units");

    expect(await screen.findByText(/Server unavailable/)).toBeTruthy();
  });
});

describe("safeNext", () => {
  it("only allows same-app paths", () => {
    expect(safeNext("/settings")).toBe("/settings");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
