import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Badge,
  Button,
  Eyebrow,
  Field,
  IconButton,
  Panel,
  ProgressLine,
  Stat,
  StatusDot,
  Stepper,
} from "./index.ts";

afterEach(cleanup);

function inRouter(element: React.ReactNode) {
  const router = createMemoryRouter([{ path: "*", element }], { initialEntries: ["/"] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("Button", () => {
  it("is a type=button by default and keeps its name with the arrow", () => {
    const onClick = vi.fn();
    render(
      <Button arrow onClick={onClick}>
        Start
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Start" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("submits forms when asked to", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("submit");
  });

  it("renders a router link with `to` and an anchor with `href`", () => {
    inRouter(
      <>
        <Button to="/units" variant="secondary">
          Units
        </Button>
        <Button href="https://example.com" variant="ghost">
          Source
        </Button>
      </>,
    );
    expect(screen.getByRole("link", { name: "Units" }).getAttribute("href")).toBe("/units");
    expect(screen.getByRole("link", { name: "Source" }).getAttribute("href")).toBe(
      "https://example.com",
    );
  });
});

describe("IconButton", () => {
  it("is named by its label", () => {
    render(
      <IconButton label="Close">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Close" }).getAttribute("type")).toBe("button");
  });
});

describe("Panel and Eyebrow", () => {
  it("sets the tone on the block and renders the chosen element", () => {
    render(
      <Panel tone="plum" as="article" aria-label="Specimen">
        <Eyebrow rule>Specimen 001</Eyebrow>
      </Panel>,
    );
    const panel = screen.getByRole("article", { name: "Specimen" });
    expect(panel.getAttribute("data-tone")).toBe("plum");
    expect(screen.getByText("Specimen 001").classList.contains("eyebrow")).toBe(true);
  });

  it("leaves a plain panel without a tone", () => {
    render(<Panel aria-label="Plain">x</Panel>);
    expect(screen.getByRole("region", { name: "Plain" }).hasAttribute("data-tone")).toBe(false);
  });
});

describe("Stepper", () => {
  const steps = [
    { id: "story", title: "Story", subtitle: "The familiar shape", done: true },
    { id: "theory", title: "Theory" },
    { id: "exercises", title: "Exercises", disabled: true },
  ];

  it("numbers the steps, marks the current one and selects with buttons", () => {
    const onSelect = vi.fn();
    render(<Stepper label="Unit steps" steps={steps} current="theory" onSelect={onSelect} />);
    const nav = screen.getByRole("navigation", { name: "Unit steps" });
    const story = screen.getByRole("button", { name: /Story/ });
    expect(story.textContent).toBe("01StoryThe familiar shape (done)");
    expect(screen.getByRole("button", { name: /Theory/ }).getAttribute("aria-current")).toBe(
      "step",
    );
    expect(story.hasAttribute("aria-current")).toBe(false);
    fireEvent.click(story);
    expect(onSelect).toHaveBeenCalledWith("story");
    expect((screen.getByRole("button", { name: /Exercises/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(nav.querySelectorAll("li")).toHaveLength(3);
  });

  it("navigates with links when steps have `to`", () => {
    inRouter(
      <Stepper
        label="Reading steps"
        current="a"
        steps={[
          { id: "a", title: "Predict", to: "?step=a" },
          { id: "b", title: "Read", to: "?step=b" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Predict/ }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("link", { name: /Read/ }).getAttribute("href")).toBe("/?step=b");
  });
});

describe("Field", () => {
  it("labels the control and describes it with the hint and the error", () => {
    render(
      <Field label="Email" hint="We never share it." error="Required">
        {(control) => <input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "We never share it.",
      "Required",
    ]);
  });

  it("uses a given id for a plain child control", () => {
    render(
      <Field label="Level" id="level">
        <select id="level">
          <option>B1</option>
        </select>
      </Field>,
    );
    expect(screen.getByLabelText("Level").tagName).toBe("SELECT");
  });
});

describe("indicators", () => {
  it("exposes progress as a progressbar with a clamped value", () => {
    render(<ProgressLine value={134.4} label="Unit progress" />);
    const bar = screen.getByRole("progressbar", { name: "Unit progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("reads a stat as label then value, a badge by its text and a labelled dot as an image", () => {
    render(
      <>
        <Stat label="Breeze" value={34} />
        <Badge tone="almost">Almost</Badge>
        <StatusDot label="In motion" pulse />
        <StatusDot filled={false} />
      </>,
    );
    expect(screen.getByText("Breeze").parentElement?.textContent).toBe("Breeze 34");
    expect(screen.getByText("Almost").getAttribute("data-state")).toBe("almost");
    expect(screen.getAllByRole("img", { name: "In motion" })).toHaveLength(1);
  });
});
