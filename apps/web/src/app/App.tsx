import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { loginPath } from "../features/auth/auth.api.ts";
import { isUnauthorized } from "../shared/api/http.ts";
import { onSessionEnd } from "../shared/api/session-cache.ts";
import { routes } from "./routes.tsx";

const router = createBrowserRouter(routes);

/** Any api call answering 401 means the session ended: go to the login page. */
const onError = (error: Error) => {
  const { pathname, search } = router.state.location;
  if (isUnauthorized(error) && pathname !== "/login") {
    void router.navigate(loginPath(pathname + search));
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: { retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 3 },
  },
});

// Logout or an expired session: no query data from the old session survives in memory.
onSessionEnd(() => queryClient.clear());

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
