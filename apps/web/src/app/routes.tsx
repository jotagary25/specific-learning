import type { RouteObject } from "react-router";
import { requireAuth } from "../features/auth/auth.api.ts";
import { LoginPage } from "../features/auth/LoginPage.tsx";
import { HomePage } from "../features/home/HomePage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { Layout } from "./Layout.tsx";

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <Layout />,
    loader: requireAuth,
    hydrateFallbackElement: null,
    children: [
      { index: true, element: <HomePage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
];
