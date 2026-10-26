import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../app/routes.tsx";

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("HealthIndicator", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the api and database status from /api/health in the footer", async () => {
    const fetchMock = vi.fn(async () => Response.json({ status: "ok", db: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/settings");

    expect(await screen.findByText("API: ok")).toBeTruthy();
    expect(screen.getByText("Database: ok")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/health");
  });
});
