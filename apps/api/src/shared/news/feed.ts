// Small dependency-free Atom/RSS 2.0 parser: enough for news feeds (no namespaces resolution).
import { decodeEntities } from "./html-text.ts";

export type FeedEntry = {
  id: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  summary: string;
  /** Entry body as HTML (Atom `content`, RSS `content:encoded` or `description`). */
  contentHtml: string;
  authors: string[];
  rights: string | null;
};

const escapeTag = (tag: string) => tag.replace(/[:.]/g, (c) => `\\${c}`);

function blocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(
    `<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tag)}>`,
    "gi",
  );
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
}

/** Text content of an element: CDATA unwrapped, entities decoded once. */
function textOf(xml: string, tag: string): string | null {
  const raw = blocks(xml, tag)[0];
  if (raw === undefined) return null;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return (cdata ? (cdata[1] ?? "") : decodeEntities(raw)).trim();
}

function attribute(tagSource: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tagSource);
  return match ? decodeEntities(match[2] ?? match[3] ?? "") : null;
}

function atomLink(entry: string): string {
  const links = [...entry.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const alternate =
    links.find((link) => (attribute(link, "rel") ?? "alternate") === "alternate") ?? links[0];
  return alternate ? (attribute(alternate, "href") ?? "") : "";
}

function date(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const stripTags = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function parseAtom(xml: string): FeedEntry[] {
  return blocks(xml, "entry").map((entry) => ({
    id: textOf(entry, "id") ?? atomLink(entry),
    title: stripTags(textOf(entry, "title") ?? ""),
    url: atomLink(entry),
    publishedAt: date(textOf(entry, "published") ?? textOf(entry, "updated")),
    summary: stripTags(textOf(entry, "summary") ?? ""),
    contentHtml: textOf(entry, "content") ?? "",
    authors: blocks(entry, "author")
      .map((author) => textOf(author, "name") ?? "")
      .filter(Boolean),
    rights: textOf(entry, "rights"),
  }));
}

function parseRss(xml: string): FeedEntry[] {
  return blocks(xml, "item").map((item) => {
    const description = textOf(item, "description") ?? "";
    const url = textOf(item, "link") ?? "";
    return {
      id: textOf(item, "guid") ?? url,
      title: stripTags(textOf(item, "title") ?? ""),
      url,
      publishedAt: date(textOf(item, "pubDate") ?? textOf(item, "dc:date")),
      summary: stripTags(description),
      contentHtml: textOf(item, "content:encoded") ?? description,
      authors: [...blocks(item, "dc:creator"), ...blocks(item, "author")]
        .map((value) => decodeEntities(value.replace(/<!\[CDATA\[|\]\]>/g, "")).trim())
        .filter(Boolean),
      rights: textOf(item, "dc:rights") ?? textOf(item, "copyright"),
    };
  });
}

/** Parses an Atom or RSS 2.0 document; unknown formats yield no entries. */
export function parseFeed(xml: string): FeedEntry[] {
  if (/<feed\b/i.test(xml)) return parseAtom(xml);
  if (/<rss\b|<rdf:RDF\b/i.test(xml)) return parseRss(xml);
  return [];
}
