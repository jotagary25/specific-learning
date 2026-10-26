import type { AiFunctionConfig } from "@english-course/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderAt } from "../../test/render.tsx";

const checkAnswer: AiFunctionConfig = {
  id: "check_answer",
  tier: "fast",
  model: "gemma4:31b",
  think: "low",
  defaultModel: "gemma4:31b",
  defaultThink: "low",
  isDefault: true,
};

const reviewWriting: AiFunctionConfig = {
  id: "review_writing",
  tier: "quality",
  model: "deepseek-v4-pro",
  think: "high",
  defaultModel: "deepseek-v4-pro",
  defaultThink: "high",
  isDefault: true,
};

const DEFAULT_PREFERENCES = {
  "today.writingDay": 6,
  "srs.newPerDay": 5,
  "clock.timeZone": "UTC",
  "reading.editorHour": 5,
  "clock.timeZoneChosen": true,
};

function settingsApi(
  aiKey: object = { configured: true, source: "db", last4: "WXYZ" },
  initialPreferences: Partial<typeof DEFAULT_PREFERENCES> = {},
) {
  const puts: unknown[] = [];
  const preferencePuts: unknown[] = [];
  let preferences = { ...DEFAULT_PREFERENCES, ...initialPreferences };
  const fetchMock = mockApi({
    "GET /api/auth/me": () =>
      Response.json({ authenticated: true, user: { email: "ana@example.com", role: "admin" } }),
    "GET /api/settings/ai-key": () => Response.json(aiKey),
    "POST /api/settings/ai-key/test": () => Response.json({ ok: true, modelCount: 3 }),
    "GET /api/settings/models": () =>
      Response.json({
        models: [{ name: "gemma4:31b" }, { name: "gpt-oss:120b" }, { name: "deepseek-v4-pro" }],
      }),
    "GET /api/settings/ai-functions": () =>
      Response.json({ functions: [checkAnswer, reviewWriting] }),
    "GET /api/settings/models/gemma4%3A31b/capabilities": () =>
      Response.json({
        model: "gemma4:31b",
        capabilities: ["completion", "thinking"],
        thinking: { values: [true, false], default: true },
      }),
    "GET /api/settings/models/gpt-oss%3A120b/capabilities": () =>
      Response.json({
        model: "gpt-oss:120b",
        capabilities: ["completion", "thinking"],
        thinking: { values: ["low", "medium", "high"], default: "medium" },
      }),
    "GET /api/settings/models/deepseek-v4-pro/capabilities": () =>
      Response.json({ model: "deepseek-v4-pro", capabilities: ["completion"], thinking: null }),
    "GET /api/settings/preferences": () => Response.json(preferences),
    "PUT /api/settings/preferences": ({ body }) => {
      preferencePuts.push(body);
      const patch = body as Partial<typeof DEFAULT_PREFERENCES>;
      preferences = {
        ...preferences,
        ...patch,
        "clock.timeZoneChosen": preferences["clock.timeZoneChosen"] || "clock.timeZone" in patch,
      };
      return Response.json(preferences);
    },
    "PUT /api/settings/ai-functions/check_answer": ({ body }) => {
      puts.push(body);
      return Response.json({ ...checkAnswer, ...(body as object), isDefault: false });
    },
  });
  return { fetchMock, puts, preferencePuts };
}

/** Makes the browser report `zone` as its time zone. */
function browserZone(zone: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...real.call(this), timeZone: zone };
  });
}

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the signed-in account with its role", async () => {
    settingsApi();
    renderAt("/settings");

    const account = await screen.findByRole("region", { name: "Account" });
    expect(await within(account).findByText("ana@example.com")).toBeTruthy();
    expect(within(account).getByText("Admin")).toBeTruthy();
  });

  it("shows only the last 4 characters of the stored key and tests the connection", async () => {
    settingsApi();
    renderAt("/settings");

    expect(await screen.findByText("Saved (encrypted) · ends in WXYZ")).toBeTruthy();
    expect((screen.getByLabelText("New API key") as HTMLInputElement).type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Connection works: 3 models available.")).toBeTruthy();
  });

  it("asks to re-enter a stored key that can no longer be decrypted", async () => {
    settingsApi({ configured: false, source: "db", last4: "WXYZ", error: "undecryptable" });
    renderAt("/settings");

    expect(
      await screen.findByText(
        "Saved key can't be decrypted (APP_SECRET changed?) — enter it again",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove stored key" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Test connection" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("lists models per function and saves one row with the chosen model and effort", async () => {
    const { puts } = settingsApi();
    renderAt("/settings");

    const modelSelect = (await screen.findByLabelText(
      "Model for Check answer",
    )) as HTMLSelectElement;
    await waitFor(() =>
      expect([...modelSelect.options].map((o) => o.value)).toEqual([
        "gemma4:31b",
        "gpt-oss:120b",
        "deepseek-v4-pro",
      ]),
    );

    fireEvent.change(modelSelect, { target: { value: "gpt-oss:120b" } });
    const effortSelect = screen.getByLabelText("Effort for Check answer") as HTMLSelectElement;
    await waitFor(() =>
      expect([...effortSelect.options].map((o) => o.textContent)).toEqual([
        "Model default (medium)",
        "low",
        "medium",
        "high",
      ]),
    );
    fireEvent.change(effortSelect, { target: { value: "level:high" } });

    const row = modelSelect.closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Save Check answer" }));

    expect(await within(row).findByText("Saved")).toBeTruthy();
    expect(puts).toEqual([{ model: "gpt-oss:120b", think: "high" }]);
  });

  it("offers on/off for models without thinking levels", async () => {
    settingsApi();
    renderAt("/settings");

    const effortSelect = (await screen.findByLabelText(
      "Effort for Review writing",
    )) as HTMLSelectElement;

    await waitFor(() =>
      expect([...effortSelect.options].map((o) => o.textContent)).toEqual([
        "Model default",
        "On",
        "Off",
        "high",
      ]),
    );
  });

  it("saves the writing day and the new cards per day", async () => {
    const { preferencePuts } = settingsApi();
    renderAt("/settings");

    const day = (await screen.findByLabelText("Writing day")) as HTMLSelectElement;
    expect(day.value).toBe("6");
    expect([...day.options].map((o) => o.textContent)).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    const perDay = screen.getByLabelText("New cards per day") as HTMLInputElement;
    expect(perDay.value).toBe("5");

    fireEvent.change(day, { target: { value: "3" } });
    fireEvent.change(perDay, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    expect(await screen.findByText("Preferences saved.")).toBeTruthy();
    expect(preferencePuts).toEqual([
      {
        "today.writingDay": 3,
        "srs.newPerDay": 8,
        "clock.timeZone": "UTC",
        "reading.editorHour": 5,
      },
    ]);
  });

  it("saves the time zone and the daily article hour", async () => {
    const { preferencePuts } = settingsApi();
    renderAt("/settings");

    const zone = (await screen.findByLabelText("Time zone")) as HTMLInputElement;
    expect(zone.value).toBe("UTC");
    const hour = screen.getByLabelText("Daily article from") as HTMLSelectElement;
    expect(hour.value).toBe("5");
    expect(hour.options).toHaveLength(24);
    expect(hour.options[7]?.textContent).toBe("07:00");

    const saveButton = screen.getByRole("button", { name: "Save preferences" });
    fireEvent.change(zone, { target: { value: "Mars/Olympus_Mons" } });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(zone, { target: { value: "America/La_Paz" } });
    fireEvent.change(hour, { target: { value: "7" } });
    fireEvent.click(saveButton);

    expect(await screen.findByText("Preferences saved.")).toBeTruthy();
    expect(preferencePuts).toEqual([
      {
        "today.writingDay": 6,
        "srs.newPerDay": 5,
        "clock.timeZone": "America/La_Paz",
        "reading.editorHour": 7,
      },
    ]);
  });

  it("proposes the browser's time zone once and saves Accept", async () => {
    browserZone("America/La_Paz");
    const { preferencePuts } = settingsApi(undefined, { "clock.timeZoneChosen": false });
    renderAt("/settings");

    const banner = await screen.findByRole("complementary", { name: "Time zone" });
    expect(banner.textContent).toContain("Use America/La_Paz as your time zone?");
    fireEvent.click(within(banner).getByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "Time zone" })).toBeNull(),
    );
    expect(preferencePuts).toEqual([{ "clock.timeZone": "America/La_Paz" }]);

    // A new visit reads the saved choice: no banner again.
    cleanup();
    renderAt("/settings");
    expect(((await screen.findByLabelText("Time zone")) as HTMLInputElement).value).toBe(
      "America/La_Paz",
    );
    expect(screen.queryByRole("complementary", { name: "Time zone" })).toBeNull();
  });

  it("saves Keep UTC as a choice so the banner does not come back", async () => {
    browserZone("Asia/Tokyo");
    const { preferencePuts } = settingsApi(undefined, { "clock.timeZoneChosen": false });
    renderAt("/settings");

    const banner = await screen.findByRole("complementary", { name: "Time zone" });
    fireEvent.click(within(banner).getByRole("button", { name: "Keep UTC" }));
    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "Time zone" })).toBeNull(),
    );
    expect(preferencePuts).toEqual([{ "clock.timeZone": "UTC" }]);

    cleanup();
    renderAt("/settings");
    await screen.findByLabelText("Time zone");
    expect(screen.queryByRole("complementary", { name: "Time zone" })).toBeNull();
  });

  it("does not propose anything when the browser is already on UTC", async () => {
    browserZone("UTC");
    settingsApi(undefined, { "clock.timeZoneChosen": false });
    renderAt("/settings");
    await screen.findByLabelText("Time zone");
    expect(screen.queryByRole("complementary", { name: "Time zone" })).toBeNull();
  });

  it("does not save an empty or fractional number of new cards", async () => {
    const { preferencePuts } = settingsApi();
    renderAt("/settings");

    const perDay = (await screen.findByLabelText("New cards per day")) as HTMLInputElement;
    const saveButton = screen.getByRole("button", { name: "Save preferences" });
    fireEvent.change(perDay, { target: { value: "" } });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(perDay, { target: { value: "2.5" } });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    expect(preferencePuts).toEqual([]);
  });
});
