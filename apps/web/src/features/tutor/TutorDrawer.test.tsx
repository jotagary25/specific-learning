import type { ConversationDetail, TutorStreamEvent } from "@english-course/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Handler, mockApi, renderAt } from "../../test/render.tsx";
import { unitFixture } from "../units/units.fixture.ts";
import { parseSseChunk } from "./tutor.api.ts";
import { contextFromRoute } from "./tutor.model.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A streaming SSE response the test feeds event by event. */
function sseStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const encoder = new TextEncoder();
  return {
    response: () => new Response(body, { headers: { "content-type": "text/event-stream" } }),
    send: (event: TutorStreamEvent) =>
      controller.enqueue(
        encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
      ),
    close: () => controller.close(),
  };
}

function api(handlers: Record<string, Handler> = {}) {
  const created: unknown[] = [];
  const sent: unknown[] = [];
  const stream = sseStream();
  mockApi({
    "GET /api/auth/me": () => Response.json({ authenticated: true }),
    "GET /api/units/1": () => Response.json(unitFixture()),
    "POST /api/tutor/conversations": ({ body }) => {
      created.push(body);
      return Response.json({ id: "c-1" }, { status: 201 });
    },
    "POST /api/tutor/conversations/c-1/messages": ({ body }) => {
      sent.push(body);
      return stream.response();
    },
    ...handlers,
  });
  return { created, sent, stream };
}

const drawer = () => screen.findByRole("dialog", { name: "Tutor" });

describe("tutor drawer", () => {
  it("opens with the focused item as context, streams the answer and returns to the task", async () => {
    const { created, sent, stream } = api();
    renderAt("/units/1?step=exercises");
    const blank = (await screen.findByLabelText("Item 2 answer")) as HTMLInputElement;
    blank.focus();

    const fab = screen.getByRole("button", { name: "Ask the tutor" });
    fireEvent.mouseDown(fab);
    fireEvent.click(fab);
    const panel = await drawer();
    expect(within(panel).getByText(/Exercise item 1\.1-2/)).toBeTruthy();

    fireEvent.change(within(panel).getByLabelText("Your question"), {
      target: { value: "¿Por qué -ing?" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sent).toEqual([{ content: "¿Por qué -ing?" }]));
    expect(created).toEqual([{ context: { kind: "exercise", ref: "1.1-2" } }]);
    expect(within(panel).getByText("¿Por qué -ing?")).toBeTruthy();

    stream.send({ type: "thinking" });
    expect(await within(panel).findByText("Thinking…")).toBeTruthy();
    stream.send({
      type: "tool",
      tool: { name: "get_unit_theory", label: "looked up Unit 1 theory", ok: true },
    });
    expect(await within(panel).findByText("looked up Unit 1 theory")).toBeTruthy();
    stream.send({ type: "text", text: "Porque la acción" });
    expect(await within(panel).findByText("Porque la acción")).toBeTruthy();
    expect(within(panel).queryByText("Thinking…")).toBeNull();
    stream.send({ type: "text", text: " está en curso." });
    expect(await within(panel).findByText("Porque la acción está en curso.")).toBeTruthy();
    stream.send({ type: "done", messageId: "m-9" });
    stream.close();
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Send" })).toBeTruthy());

    fireEvent.click(within(panel).getByRole("button", { name: "Back to my task" }));
    expect(screen.queryByRole("dialog", { name: "Tutor" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(blank));
  });

  it("sends a quick prompt and explains when the AI is unavailable", async () => {
    const { sent } = api({
      "POST /api/tutor/conversations/c-1/messages": ({ body }) => {
        sent.push(body);
        return Response.json(
          { error: "ai-unavailable", message: "The AI tutor is unavailable right now" },
          { status: 503 },
        );
      },
    });
    renderAt("/units/1");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the tutor" }));
    const panel = await drawer();
    expect(within(panel).getByText(/Unit 1/)).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Give me an example with tech" }));
    expect(await within(panel).findByRole("alert")).toHaveProperty(
      "textContent",
      "The AI tutor is unavailable right now (add an Ollama API key in Settings).",
    );
    expect(sent).toEqual([{ content: "Give me an example with tech" }]);
  });
});

describe("follow-up from the units sheet", () => {
  it("opens the drawer seeded with the same item and the explanation already shown", async () => {
    const { created } = api({
      "POST /api/units/1/explain": () =>
        Response.json({
          explanationEs: "Es algo en curso.",
          examplesEn: ["The build is running."],
          backToTaskEs: "Vuelve al ítem 2.",
        }),
    });
    renderAt("/units/1?step=exercises");
    const blank = (await screen.findByLabelText("Item 2 answer")) as HTMLInputElement;
    blank.focus();
    fireEvent.focus(blank);
    fireEvent.click(screen.getByRole("button", { name: "I don't get it" }));
    const sheet = await screen.findByRole("dialog", { name: "No entiendo" });
    await within(sheet).findByText("Es algo en curso.");

    fireEvent.click(within(sheet).getByRole("button", { name: "Ask a follow-up" }));
    const panel = await drawer();
    expect(screen.queryByRole("dialog", { name: "No entiendo" })).toBeNull();
    expect(within(panel).getByText(/Exercise item 1\.1-2/)).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Explain it differently" }));
    await waitFor(() =>
      expect(created).toEqual([
        {
          context: {
            kind: "exercise",
            ref: "1.1-2",
            snippet: "Explanation already shown: Es algo en curso.",
          },
        },
      ]),
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Back to my task" }));
    await waitFor(() => expect(document.activeElement).toBe(blank));
  });
});

describe("tutor page", () => {
  it("lists past conversations and shows one with its tool chips", async () => {
    const detail: ConversationDetail = {
      id: "c-7",
      context: { kind: "unit", ref: "3" },
      createdAt: "2026-10-25T09:00:00.000Z",
      messages: [
        {
          id: "1",
          role: "user",
          content: "¿do o does?",
          tool: null,
          createdAt: "2026-10-25T09:00:00.000Z",
        },
        {
          id: "2",
          role: "assistant",
          content: "",
          tool: null,
          createdAt: "2026-10-25T09:00:01.000Z",
        },
        {
          id: "3",
          role: "tool",
          content: "{}",
          tool: { name: "get_unit_theory", label: "looked up Unit 3 theory", ok: true },
          createdAt: "2026-10-25T09:00:02.000Z",
        },
        {
          id: "4",
          role: "assistant",
          content: "Con he/she/it, does.",
          tool: null,
          createdAt: "2026-10-25T09:00:03.000Z",
        },
      ],
    };
    mockApi({
      "GET /api/auth/me": () => Response.json({ authenticated: true }),
      "GET /api/tutor/conversations": () =>
        Response.json({
          conversations: [
            {
              id: "c-7",
              context: detail.context,
              preview: "¿do o does?",
              createdAt: detail.createdAt,
            },
          ],
        }),
      "GET /api/tutor/conversations/c-7": () => Response.json(detail),
    });
    renderAt("/tutor");
    const link = await screen.findByRole("link", { name: /¿do o does\?/ });
    fireEvent.click(link);
    const chat = screen.getByRole("log", { name: "Conversation" });
    expect(await within(chat).findByText("Con he/she/it, does.")).toBeTruthy();
    expect(within(chat).getByText("looked up Unit 3 theory")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask the tutor" })).toBeNull();
  });
});

describe("tutor helpers", () => {
  it("parse SSE frames across chunk boundaries", () => {
    const first = parseSseChunk('event: text\ndata: {"type":"text","text":"Ho');
    expect(first.events).toEqual([]);
    const second = parseSseChunk(
      `${first.rest}la"}\n\nevent: done\ndata: {"type":"done","messageId":null}\n\n`,
    );
    expect(second.events).toEqual([
      { type: "text", text: "Hola" },
      { type: "done", messageId: null },
    ]);
    expect(second.rest).toBe("");
  });

  it("derive the context from the route", () => {
    expect(contextFromRoute("/units/3", "?step=theory", null)).toEqual({
      kind: "unit",
      ref: "3#theory",
    });
    expect(contextFromRoute("/reading/a-1", "", null)).toEqual({ kind: "article", ref: "a-1" });
    expect(contextFromRoute("/reading/history", "", null)).toEqual({
      kind: "free",
      ref: "/reading/history",
    });
    expect(contextFromRoute("/writing", "", null)).toEqual({ kind: "writing", ref: "current" });
    expect(contextFromRoute("/", "", null)).toEqual({ kind: "free", ref: "/" });
  });
});
