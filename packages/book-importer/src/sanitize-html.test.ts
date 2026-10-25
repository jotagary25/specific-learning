import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitize-html.ts";

describe("sanitizeHtml", () => {
  it("strips inline styles and unknown attributes", () => {
    expect(sanitizeHtml('<p style="color: red" id="x" onclick="evil()">Hi</p>')).toBe("<p>Hi</p>");
  });

  it("keeps only the allowed semantic classes", () => {
    expect(
      sanitizeHtml(
        '<div class="example-box with-visual"><strong class="grammar-target">is</strong></div>',
      ),
    ).toBe('<div class="example-box"><strong class="grammar-target">is</strong></div>');
  });

  it("unwraps unknown elements and class-less divs, keeping their text", () => {
    expect(sanitizeHtml('<div style="x"><a href="u.html">Unit <b>3</b></a></div>')).toBe("Unit 3");
  });

  it("drops scripts and comments entirely", () => {
    expect(sanitizeHtml("<p>a<!-- note --></p><script>alert(1)</script>")).toBe("<p>a</p>");
  });

  it("keeps rowspan and colspan on table cells", () => {
    expect(
      sanitizeHtml(
        '<table class="grammar-table"><tbody><tr><td rowspan="3" width="9">x</td></tr></tbody></table>',
      ),
    ).toBe('<table class="grammar-table"><tbody><tr><td rowspan="3">x</td></tr></tbody></table>');
  });

  it("rewrites image sources and reports the referenced file", () => {
    const images: string[] = [];
    const html = sanitizeHtml('<img src="img/unit_001_sarah.png" alt="Sarah" style="width:1px">', {
      onImage: (file) => images.push(file),
    });
    expect(html).toBe('<img src="/content/images/unit_001_sarah.png" alt="Sarah">');
    expect(images).toEqual(["unit_001_sarah.png"]);
  });

  it("collapses whitespace and escapes text", () => {
    expect(sanitizeHtml("<p>\n  a &lt; b\n  &amp; c </p>")).toBe("<p> a &lt; b &amp; c </p>");
  });
});
