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

function settingsApi() {
  const puts: unknown[] = [];
  const preferencePuts: unknown[] = [];
  let preferences = { "today.writingDay": 6, "srs.newPerDay": 5 };
  const fetchMock = mockApi({
    "GET /api/auth/me": () => Response.json({ authenticated: true }),
    "GET /api/settings/ai-key": () =>
      Response.json({ configured: true, source: "db", last4: "WXYZ" }),
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
      preferences = { ...preferences, ...(body as object) };
      return Response.json(preferences);
    },
    "PUT /api/settings/ai-functions/check_answer": ({ body }) => {
      puts.push(body);
      return Response.json({ ...checkAnswer, ...(body as object), isDefault: false });
    },
  });
  return { fetchMock, puts, preferencePuts };
}

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows only the last 4 characters of the stored key and tests the connection", async () => {
    settingsApi();
    renderAt("/settings");

    expect(await screen.findByText("Saved (encrypted) · ends in WXYZ")).toBeTruthy();
    expect((screen.getByLabelText("New API key") as HTMLInputElement).type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Connection works: 3 models available.")).toBeTruthy();
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
    expect(preferencePuts).toEqual([{ "today.writingDay": 3, "srs.newPerDay": 8 }]);
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
