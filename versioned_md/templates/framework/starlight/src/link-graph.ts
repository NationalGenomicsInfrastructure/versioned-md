// Builds a link graph over all documents in docs/ at config-load time.
//
// The graph powers the per-document link summaries appended by
// remark-link-summaries.ts: "Links on this page" (outgoing) and "Links to
// this page" (incoming). It reads the on-disk sources only — the summaries
// themselves never count as links, so there is no feedback loop.
//
// Deliberately dependency-free (fs + regex): this runs when astro.config.mjs
// is imported, before the Astro runtime is available.

import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

export type LinkKind = "internal" | "external" | "broken";

export interface DocLink {
  /** Link text from the source document. */
  text: string;
  /** Site-absolute URL for internal/broken links, original URL for external. */
  href: string;
  /** Target document slug (internal/broken links only). */
  slug?: string;
  kind: LinkKind;
}

export interface LinkGraph {
  /** Slugs of all documents under docs/ (path relative to docs/, no .md). */
  slugs: Set<string>;
  /** Outgoing links per source slug, in source order. */
  outgoing: Map<string, DocLink[]>;
  /** Incoming links per target slug, sorted by source slug. */
  incoming: Map<string, DocLink[]>;
}

/** Recursively collect the paths of all .md files under *dir*. */
function walkMdFiles(dir: string): string[] {
  let items;
  try {
    items = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      found.push(...walkMdFiles(full));
    } else if (item.name.endsWith(".md")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Strip fenced code blocks so example links inside code fences don't count.
 * Fence-based and line-oriented on purpose — simple and good enough for docs.
 */
function stripFencedCode(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let fence: string | undefined;
  for (const line of lines) {
    const match = line.match(/^\s{0,3}(```|~~~)/);
    if (match) {
      if (fence === undefined) {
        fence = match[1];
      } else if (match[1] === fence) {
        fence = undefined;
      }
      continue;
    }
    if (fence === undefined) out.push(line);
  }
  return out.join("\n");
}

/**
 * Normalize a link target to a document slug, relative to the source
 * document's directory (*fileDir*, "" or "." for docs/ root).
 * Returns undefined for pure in-page anchors and external links (caller
 * handles those before calling this — see extractLinks).
 *
 * *escaped* is true when the target resolves outside of docs/ (e.g.
 * "../README.md" pointing at the repo README) — there is no page for it.
 */
export function normalizeTarget(
  fileDir: string,
  target: string,
): { slug: string; escaped: boolean } | undefined {
  const hash = target.indexOf("#");
  const pathPart = hash === -1 ? target : target.slice(0, hash);
  if (!pathPart) return undefined; // pure anchor, handled by the caller
  // protocol-relative or scheme-prefixed (https:, mailto:, ...) — external
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathPart) || pathPart.startsWith("//")) return undefined;

  // Site-absolute URLs: the site namespace by definition, no relative
  // resolution. The knownSlugs check classifies them as internal/broken.
  if (pathPart.startsWith("/")) {
    const slug = pathPart.replace(/^\/+|\/+$/g, "").replace(/\.md$/, "");
    return slug ? { slug, escaped: false } : undefined;
  }

  // Slugs are slash-separated paths without a leading "/", so resolve under a
  // marker root and strip it. If the result is no longer under the marker, the
  // link escapes docs/.
  const ROOT = "/__docs__";
  const resolved = path.posix.resolve(ROOT, fileDir || ".", pathPart);
  const inside = resolved.startsWith(ROOT + "/") ? resolved.slice(ROOT.length + 1) : null;
  if (inside === null) {
    const slug = path.posix.normalize(resolved)
      .replace(/^\/+/, "")
      .replace(/\.md$/, "")
      .replace(/\/+$/, "");
    return slug ? { slug, escaped: true } : undefined;
  }
  const slug = inside.replace(/\.md$/, "").replace(/\/+$/, "");
  return slug ? { slug, escaped: false } : undefined;
}

/** Title of a document: .meta.json sidecar → first H1 → prettified filename. */
export function documentTitle(filePath: string, slug: string, markdown: string): string {
  try {
    const meta = JSON.parse(readFileSync(filePath.replace(/\.md$/, ".meta.json"), "utf-8"));
    if (typeof meta.title === "string" && meta.title) return meta.title;
  } catch {
    // no sidecar — fall through
  }
  const h1 = markdown.match(/^# +(.+)$/m);
  if (h1) return h1[1].trim();
  return slug
    .split("/")
    .pop()
    ?.replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? slug;
}

const LINK_RE = /(?<!\!)\[([^\]]*)\]\(([^()\s]+(?:\s+[^()\s]*)?)\)/g;

/** Extract and classify the links of one document. */
export function extractLinks(
  markdown: string,
  fileDir: string,
  knownSlugs: Set<string>,
): DocLink[] {
  const links: DocLink[] = [];
  for (const match of stripFencedCode(markdown).matchAll(LINK_RE)) {
    const text = match[1] || match[2];
    // Drop an optional link title: [t](url "title")
    const target = match[2].replace(/\s+["'][^"']*["']\s*$/, "").trim();
    if (!target) continue;
    if (target.startsWith("#")) continue; // in-page anchor — not "somewhere else"

    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) {
      links.push({ text, href: target, kind: "external" });
      continue;
    }
    const normalized = normalizeTarget(fileDir, target);
    if (!normalized) continue;
    links.push({
      text,
      href: `/${normalized.slug}/`,
      slug: normalized.slug,
      // Escaped targets (outside docs/) have no page: treat as broken.
      kind: normalized.escaped || !knownSlugs.has(normalized.slug) ? "broken" : "internal",
    });
  }
  return links;
}

export function buildLinkGraph(docsDir: string): LinkGraph {
  const slugs = new Set<string>();
  const files: Array<{ slug: string; filePath: string; title: string; links: DocLink[] }> = [];

  for (const filePath of walkMdFiles(docsDir)) {
    const slug = path
      .relative(docsDir, filePath)
      .replace(/\.md$/, "")
      .split(path.sep)
      .join("/");
    // docs/README.md is a GitHub-facing overview, not a site page — keep it
    // out of the link graph (mirrors the exclusion in content.config.ts).
    if (slug === "README") continue;
    slugs.add(slug);
    files.push({ slug, filePath, title: "", links: [] });
  }

  const outgoing = new Map<string, DocLink[]>();
  for (const file of files) {
    const markdown = readFileSync(file.filePath, "utf-8");
    file.title = documentTitle(file.filePath, file.slug, markdown);
    file.links = extractLinks(markdown, file.slug.includes("/") ? file.slug.slice(0, file.slug.lastIndexOf("/")) : ".", slugs);
    if (file.links.length > 0) outgoing.set(file.slug, file.links);
  }

  const incoming = new Map<string, DocLink[]>();
  for (const file of files) {
    for (const link of file.links) {
      if (!link.slug) continue; // external — no target page
      const list = incoming.get(link.slug) ?? [];
      list.push({ text: file.title, href: `/${file.slug}/`, slug: file.slug, kind: link.kind });
      incoming.set(link.slug, list);
    }
  }
  for (const list of incoming.values()) {
    list.sort((a, b) => (a.slug ?? "").localeCompare(b.slug ?? ""));
  }

  return { slugs, outgoing, incoming };
}