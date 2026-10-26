import type { RouteObject } from "react-router";
import { requireAuth } from "../features/auth/auth.api.ts";
import { LoginPage } from "../features/auth/LoginPage.tsx";
import { ArticlePage } from "../features/reading/ArticlePage.tsx";
import { HistoryPage } from "../features/reading/HistoryPage.tsx";
import { ReadingPage } from "../features/reading/ReadingPage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { TodayPage } from "../features/today/TodayPage.tsx";
import { UnitPage } from "../features/units/UnitPage.tsx";
import { UnitsPage } from "../features/units/UnitsPage.tsx";
import { CardsPage } from "../features/vocabulary/CardsPage.tsx";
import { VocabularyPage } from "../features/vocabulary/VocabularyPage.tsx";
import { WritingHistoryPage } from "../features/writing/WritingHistoryPage.tsx";
import { WritingPage } from "../features/writing/WritingPage.tsx";
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
      { index: true, element: <TodayPage /> },
      { path: "units", element: <UnitsPage /> },
      { path: "units/:n", element: <UnitPage /> },
      { path: "reading", element: <ReadingPage /> },
      { path: "reading/history", element: <HistoryPage /> },
      { path: "reading/:id", element: <ArticlePage /> },
      { path: "vocabulary", element: <VocabularyPage /> },
      { path: "vocabulary/cards", element: <CardsPage /> },
      { path: "writing", element: <WritingPage /> },
      { path: "writing/history", element: <WritingHistoryPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
];
