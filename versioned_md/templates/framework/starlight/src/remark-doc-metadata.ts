// Renders the document's .meta.json sidecar as a muted metadata table under
// the page header:
//
//   | Document ID  | 1001              |
//   | Last updated | 2026-06-25        |
//   | Updated by   | johannes          |
//   | Reviewed by  | sarah, mike       |
//
// The top-level sidecar fields (documentId, lastUpdated, updatedBy,
// reviewer) are rewritten by CI together on every update, so they describe
// the document "at that time" — the last update. Documents without a
// sidecar get no table.
//
// The table is a raw HTML node styled by src/styles/custom.css (.doc-meta),
// so it stays out of the table of contents.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Node = {
  type: string;
  depth?: number;
  value?: string;
};

// Escape a sidecar value for embedding in raw HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Path of the .meta.json sidecar next to the document. The vfile path is
// project-root-relative ("docs/strict/1001.md") in this pipeline; absolute
// paths and file:// URLs are handled too. Mirrors remark-no-first-h1.ts.
function sidecarPath(filePath: string | URL | undefined): string | undefined {
  if (!filePath) return undefined;
  const raw = typeof filePath === "string" ? filePath : filePath.href;
  const docPath = raw.startsWith("file://") ? fileURLToPath(raw) : raw;
  return docPath.replace(/\.md$/, ".meta.json");
}

export default function remarkDocMetadata() {
  return (tree: { children: Node[] }, file: { path?: string | URL }) => {
    const metaPath = sidecarPath(file.path);
    if (!metaPath) return;
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    } catch {
      return; // no sidecar — nothing to show
    }
    const rows: Array<[string, string]> = [];
    if (typeof meta.documentId === "string" && meta.documentId) {
      rows.push(["Document ID", escapeHtml(meta.documentId)]);
    }
    if (typeof meta.lastUpdated === "string" && meta.lastUpdated) {
      rows.push(["Last updated", escapeHtml(meta.lastUpdated)]);
    }
    if (typeof meta.updatedBy === "string" && meta.updatedBy) {
      rows.push(["Updated by", escapeHtml(meta.updatedBy)]);
    }
    if (Array.isArray(meta.reviewer) && meta.reviewer.length > 0) {
      rows.push([
        "Reviewed by",
        meta.reviewer.map((r) => escapeHtml(String(r))).join(", "),
      ]);
    }
    if (rows.length === 0) return;
    const body = rows
      .map(([label, value]) => `<tr><th scope="row">${label}</th><td>${value}</td></tr>`)
      .join("");
    const node: Node = {
      type: "html",
      value: `<table class="doc-meta"><tbody>${body}</tbody></table>`,
    };
    // Insert under the header: after the body's H1 when it is still first
    // (remark-no-first-h1.ts runs earlier and removes it when it duplicates
    // the page title), otherwise at the very top of the body.
    const [first] = tree.children;
    const at = first && first.type === "heading" && first.depth === 1 ? 1 : 0;
    tree.children.splice(at, 0, node);
  };
}