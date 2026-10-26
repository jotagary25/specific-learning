// Dependency-free HTML → plain-text helpers for article bodies (feeds and pages).

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  eacute: "é",
  aacute: "á",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  ccedil: "ç",
  egrave: "è",
  agrave: "à",
  times: "×",
  deg: "°",
  euro: "€",
  pound: "£",
  copy: "©",
  reg: "®",
  trade: "™",
  shy: "",
  zwj: "",
  zwnj: "",
};

/** Decodes HTML/XML character references (named subset + all numeric ones). */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code =
        ref[1] === "x" || ref[1] === "X" ? Number.parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
  });
}

/** Elements whose whole content is dropped: media, embeds, scripts, captions. */
const DROP =
  /<(figure|iframe|script|style|noscript|svg|video|audio|picture|object|aside|form|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK =
  /<\/?(p|h[1-6]|li|ul|ol|blockquote|div|section|article|header|footer|table|tr|pre)\b[^>]*>|<br\s*\/?>/gi;

/**
 * Article body HTML → paragraphs. Images and embeds are removed; inline markup is stripped
 * without changing the words; each block element becomes its own paragraph.
 */
export function htmlToParagraphs(html: string): string[] {
  const withoutMedia = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(DROP, "")
    .replace(/<(img|source|embed|input)\b[^>]*>/gi, "");
  return withoutMedia
    .replace(BLOCK, "\n\n")
    .replace(/<[^>]+>/g, "")
    .split(/\n{2,}/)
    .map((block) => decodeEntities(block).replace(/\s+/g, " ").trim())
    .filter((block) => block.length > 0);
}

export const htmlToText = (html: string): string => htmlToParagraphs(html).join("\n\n");

/**
 * Inner HTML of the first element matching `opening` (a regex for its opening tag), following
 * nested tags of the same name. Used to cut the article body out of a full page.
 */
export function extractElement(html: string, opening: RegExp): string | null {
  const start = opening.exec(html);
  if (!start) return null;
  const tag = /^<([a-z0-9]+)/i.exec(start[0])?.[1]?.toLowerCase();
  if (!tag) return null;
  const tokens = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  tokens.lastIndex = start.index + start[0].length;
  let depth = 1;
  for (let match = tokens.exec(html); match; match = tokens.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return html.slice(start.index + start[0].length, match.index);
  }
  return html.slice(start.index + start[0].length);
}
