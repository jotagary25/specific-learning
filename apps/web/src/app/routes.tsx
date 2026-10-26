import type { RouteObject } from "react-router";
import { requireAuth } from "../features/auth/auth.api.ts";
import { LoginPage } from "../features/auth/LoginPage.tsx";
import { HomePage } from "../features/home/HomePage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { UnitPage } from "../features/units/UnitPage.tsx";
import { UnitsPage } from "../features/units/UnitsPage.tsx";
import { Layout } from "./Layout.tsx";

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <Layout />,
    loader: requireAuth,
    // Search-only navigations (e.g. a unit's ?step=) do not need a new session check.
    shouldRevalidate: ({ currentUrl, nextUrl, defaultShouldRevalidate }) =>
      currentUrl.pathname !== nextUrl.pathname && defaultShouldRevalidate,
    hydrateFallbackElement: null,
    children: [
      { index: true, element: <HomePage /> },
      { path: "units", element: <UnitsPage /> },
      { path: "units/:n", element: <UnitPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
];
