import type { RouteObject } from "react-router";
import { HomePage } from "../features/home/HomePage.tsx";
import { Layout } from "./Layout.tsx";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [{ index: true, element: <HomePage /> }],
  },
];
