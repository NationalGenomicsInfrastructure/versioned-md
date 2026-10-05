// Appends link summary sections to the end of every document that has
// links to show:
//
//   ## Links on this page   — links this document makes (to other documents
//                             or external URLs, in source order)
//   ---
//   ## Links to this page   — documents linking here (backlinks, sorted)
//
// Sections are omitted when empty, and separated by a thematic break when
// both are present.
//
// Runs on the MDAST before rendering, so the appended headings and lists get
// Starlight's normal document treatment (heading anchors, TOC entries).
//
// The link graph is built once at config-load time (see link-graph.ts) and
// passed in — the plugin itself does no I/O.

import type { LinkGraph } from "./link-graph";

type Node = {
  type: string;
  depth?: number;
  url?: string;
  title?: string | null;
  value?: string;
  children?: Node[];
};

function text(value: string): Node {
  return { type: "text", value };
}

function heading(level: number, value: string): Node {
  return { type: "heading", depth: level, children: [text(value)] };
}

function link(textValue: string, url: string): Node {
  return { type: "link", url, title: null, children: [text(textValue)] };
}

function list(items: Array<Node | Node[]>): Node {
  return {
    type: "list",
    ordered: false,
    start: undefined,
    spread: false,
    children: items.map((item) => ({
      type: "listItem",
      spread: false,
      checked: null,
      children: [
        { type: "paragraph", children: Array.isArray(item) ? item : [item] },
      ],
    })),
  };
}

export default function remarkLinkSummaries(graph: LinkGraph) {
  return (tree: { children: Node[] }, file: { path?: string | URL; data: unknown }) => {
    const slug = slugFromFilePath(file.path);
    if (!slug) return;
    const outgoing = graph.outgoing.get(slug);
    const incoming = graph.incoming.get(slug);
    const hasOutgoing = outgoing?.length > 0;
    const hasIncoming = incoming?.length > 0;
    if (!hasOutgoing && !hasIncoming) return;

    if (hasOutgoing) {
      tree.children.push(heading(2, "Links on this page"));
      tree.children.push(
        list(
          outgoing.map((l) =>
            l.kind === "broken"
              ? [link(l.text, l.href), text(" · missing")]
              : [link(l.text, l.href)],
          ),
        ),
      );
    }
    if (hasOutgoing && hasIncoming) {
      tree.children.push({ type: "thematicBreak" });
    }
    if (hasIncoming) {
      tree.children.push(heading(2, "Links to this page"));
      tree.children.push(
        list(
          // No "missing" marker here: a backlink entry exists for a page that
          // exists; a source's broken link to us is already flagged on that
          // source's own "Links on this page" section.
          incoming.map((l) => [link(l.text, l.href)]),
        ),
      );
    }
  };
}

/**
 * Document slug (path relative to docs/, no .md) from the vfile path.
 * In this pipeline the path is project-root-relative ("docs/strict/1001.md"),
 * but absolute paths and file:// URLs are handled too. Mirrors the path
 * handling in remark-no-first-h1.ts.
 */
function slugFromFilePath(filePath: string | URL | undefined): string | undefined {
  if (!filePath) return undefined;
  const raw = typeof filePath === "string" ? filePath : filePath.href;
  const normalized = (raw.startsWith("file://") ? raw.slice("file://".length) : raw).replace(/\\/g, "/");
  let slug: string | undefined;
  if (normalized.startsWith("docs/")) {
    slug = normalized.slice("docs/".length);
  } else {
    const idx = normalized.lastIndexOf("/docs/");
    if (idx !== -1) slug = normalized.slice(idx + "/docs/".length);
  }
  if (!slug || !slug.endsWith(".md")) return undefined;
  return slug.slice(0, -".md".length) || undefined;
}