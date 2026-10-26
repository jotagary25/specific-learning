import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../../test/render.tsx";
import { apiRequest, HttpError } from "../api/http.ts";
import { InstallHint } from "./InstallHint.tsx";
import { OfflineBanner } from "./OfflineBanner.tsx";
import { UpdateToast } from "./UpdateToast.tsx";

const sw = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  updateServiceWorker: vi.fn(async () => {}),
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
}));

vi.mock("./sw-register.ts", () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, sw.setNeedRefresh],
    offlineReady: [sw.offlineReady, sw.setOfflineReady],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

function setUserAgent(value: string) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => value });
}

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141 Mobile";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15";

beforeEach(() => {
  sw.needRefresh = false;
  sw.offlineReady = false;
  setOnline(true);
  setUserAgent(ANDROID_UA);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("OfflineBanner", () => {
  it("appears when the connection drops and says nothing is queued", () => {
    render(<OfflineBanner />);
    expect(screen.queryByText(/You're offline/)).toBeNull();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status").textContent).toMatch(/nothing is saved or queued/);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(/You're offline/)).toBeNull();
  });

  it("lets the app shell open offline instead of failing the session check", async () => {
    setOnline(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    renderAt("/units");

    expect(await screen.findByText(/You're offline/)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });

  it("turns a failed request while offline into an explicit no-queue error", async () => {
    setOnline(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const failure = apiRequest(
      "/api/units/1/items/x/attempts",
      { parse: (d) => d },
      {
        method: "POST",
        body: { answer: "am" },
      },
    );

    await expect(failure).rejects.toBeInstanceOf(HttpError);
    await expect(failure).rejects.toMatchObject({ code: "offline" });
    await expect(failure).rejects.toThrow(/nothing was saved or queued/);
  });
});

describe("UpdateToast", () => {
  it("stays hidden while there is no new version", () => {
    render(<UpdateToast />);
    expect(screen.queryByText("New version available")).toBeNull();
  });

  it("offers a reload that activates the waiting service worker", () => {
    sw.needRefresh = true;
    render(<UpdateToast />);

    expect(screen.getByRole("alert").textContent).toMatch(/New version available/);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("can be postponed", () => {
    sw.needRefresh = true;
    render(<UpdateToast />);

    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(sw.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();
  });
});

describe("InstallHint", () => {
  function firePrompt(outcome: "accepted" | "dismissed" = "accepted") {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    return event;
  }

  it("stays hidden until the browser says the app is installable", () => {
    render(<InstallHint />);
    expect(screen.queryByRole("complementary", { name: "Install the app" })).toBeNull();
  });

  it("shows the browser install prompt from beforeinstallprompt", async () => {
    render(<InstallHint />);
    const event = firePrompt("accepted");

    expect(event.defaultPrevented).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole("complementary", { name: "Install the app" })).toBeNull();
  });

  it("shows Add to Home Screen steps on iOS", () => {
    setUserAgent(IPHONE_UA);
    render(<InstallHint />);

    const hint = screen.getByRole("complementary", { name: "Install the app" });
    expect(hint.textContent).toMatch(/Share.*Add to Home Screen/);
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("remembers a dismissal", () => {
    setUserAgent(IPHONE_UA);
    render(<InstallHint />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("complementary", { name: "Install the app" })).toBeNull();

    cleanup();
    render(<InstallHint />);
    expect(screen.queryByRole("complementary", { name: "Install the app" })).toBeNull();
  });

  it("is hidden when already running as an installed app", () => {
    setUserAgent(IPHONE_UA);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(display-mode: standalone)",
    }));
    render(<InstallHint />);
    expect(screen.queryByRole("complementary", { name: "Install the app" })).toBeNull();
  });
});
