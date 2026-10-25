import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { routes } from "../app/routes.tsx";

export type Handler = (req: { method: string; body: unknown }) => Response | Promise<Response>;

/** Stubs `fetch` with handlers keyed by "METHOD /path"; unknown routes answer 404. */
export function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = String(input);
    const handler = handlers[`${method} ${path}`];
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    return handler
      ? handler({ method, body })
      : Response.json({ error: "not_found", message: path }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}
