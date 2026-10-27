import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { MainNav } from "./MainNav.tsx";

afterEach(cleanup);

function renderNavAt(path: string) {
  const router = createMemoryRouter([{ path: "*", element: <MainNav /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const nav = () => screen.getByRole("navigation", { name: "Main" });
const more = () => within(nav()).getByRole("button", { name: "More" });

describe("MainNav", () => {
  it("links every destination by its name", () => {
    renderNavAt("/");
    const links = within(nav()).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Today", "/"],
      ["Units", "/units"],
      ["Reading", "/reading"],
      ["Vocabulary", "/vocabulary"],
      ["Writing", "/writing"],
      ["Progress", "/progress"],
      ["Tutor", "/tutor"],
      ["Settings", "/settings"],
    ]);
    expect(within(nav()).getByRole("link", { name: "Today" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("toggles the More menu and closes it with Escape, returning focus", () => {
    renderNavAt("/");
    expect(more().getAttribute("aria-expanded")).toBe("false");
    const menu = document.getElementById(more().getAttribute("aria-controls") ?? "");
    expect(within(menu as HTMLElement).getByRole("link", { name: "Settings" })).toBeTruthy();

    fireEvent.click(more());
    expect(more().getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(more().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(more());
  });

  it("closes the More menu when a link is followed and marks More active under its routes", async () => {
    const router = renderNavAt("/");
    fireEvent.click(more());
    fireEvent.click(within(nav()).getByRole("link", { name: "Progress" }));
    await screen.findByRole("link", { name: "Progress", current: "page" });
    expect(router.state.location.pathname).toBe("/progress");
    expect(more().getAttribute("aria-expanded")).toBe("false");
    expect(more().hasAttribute("data-active")).toBe(true);
  });

  it("closes the More menu on a click outside the navigation", () => {
    renderNavAt("/units");
    fireEvent.click(more());
    fireEvent.pointerDown(document.body);
    expect(more().getAttribute("aria-expanded")).toBe("false");
    expect(more().hasAttribute("data-active")).toBe(false);
  });
});
