import { load } from "cheerio";
import { type AnyNode, type Element, isTag, isText } from "domhandler";

/** Elements kept as-is (attributes filtered). Anything else is unwrapped or dropped. */
const ALLOWED_TAGS = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "u",
  "br",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
]);

/** Containers kept only when they carry at least one allowed class. */
const CLASS_ONLY_TAGS = new Set(["div", "span"]);

/** Elements removed together with their content. */
const DROPPED_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
]);

const VOID_TAGS = new Set(["br", "img"]);

/** The book's semantic classes; every other class is stripped. */
const ALLOWED_CLASSES = new Set([
  "grammar-target",
  "rule-highlight",
  "grammar-contrast",
  "example-box",
  "example-box-text",
  "example-box-visual",
  "example-list",
  "comparison-grid",
  "comparison-col",
  "comparison-title",
  "section-intro",
  "grammar-table",
  "word-bank",
]);

const CELL_ATTRIBUTES = ["rowspan", "colspan"];
const IMAGE_PREFIX = "/content/images/";

export interface SanitizeOptions {
  /** Called with the image file name for every kept <img>. */
  onImage?: (file: string) => void;
}

/** Sanitizes book HTML with an allowlist: no inline styles, scripts or unknown attributes. */
export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  const $ = load(html, null, false);
  return sanitizeNodes($.root().contents().toArray(), options);
}

export function sanitizeNodes(nodes: AnyNode[], options: SanitizeOptions = {}): string {
  return nodes
    .map((node) => sanitizeNode(node, options))
    .join("")
    .replace(/\s+/g, " ");
}

function sanitizeNode(node: AnyNode, options: SanitizeOptions): string {
  if (isText(node)) return escapeText(node.data);
  if (!isTag(node)) return ""; // comments, directives, CDATA
  const tag = node.name.toLowerCase();
  if (DROPPED_TAGS.has(tag)) return "";

  const children = () => sanitizeNodes(node.children, options);
  const classes = allowedClasses(node);
  if (CLASS_ONLY_TAGS.has(tag)) {
    return classes ? `<${tag} class="${classes}">${children()}</${tag}>` : children();
  }
  if (!ALLOWED_TAGS.has(tag)) return children();

  const attributes = classes ? [`class="${classes}"`] : [];
  if (tag === "img") {
    const file = imageFile(node.attribs.src);
    if (!file) return "";
    options.onImage?.(file);
    attributes.push(`src="${IMAGE_PREFIX}${escapeAttribute(file)}"`);
    attributes.push(`alt="${escapeAttribute(node.attribs.alt ?? "")}"`);
  }
  if (tag === "td" || tag === "th") {
    for (const name of CELL_ATTRIBUTES) {
      const value = node.attribs[name];
      if (value && /^\d+$/.test(value)) attributes.push(`${name}="${value}"`);
    }
  }

  const open = `<${[tag, ...attributes].join(" ")}>`;
  return VOID_TAGS.has(tag) ? open : `${open}${children()}</${tag}>`;
}

function allowedClasses(node: Element): string {
  return (node.attribs.class ?? "")
    .split(/\s+/)
    .filter((name) => ALLOWED_CLASSES.has(name))
    .join(" ");
}

/** "img/unit_001_sarah.png" → "unit_001_sarah.png"; external or odd sources are dropped. */
function imageFile(src: string | undefined): string | undefined {
  const match = /^(?:\.\/)?img\/([\w.-]+\.(?:png|jpe?g|gif|webp|svg))$/i.exec(src ?? "");
  return match?.[1];
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
