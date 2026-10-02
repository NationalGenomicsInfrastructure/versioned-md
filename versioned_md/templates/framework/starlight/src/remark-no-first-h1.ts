// versioned-md documents start with an H1 that duplicates the page title
// Starlight already renders in the page header. Remove the first heading of
// the document when it matches the document's title, so the title appears once.
//
// The title is resolved the same way content.config.ts does — from the
// adjacent .meta.json sidecar when present, otherwise the H1 itself — because
// Astro renders the body before the loader enrichment runs, so the title is
// not available in the frontmatter at this point. The vfile carries the
// document path, which is used to locate the sidecar.
//
// Headings that do not match the title — or that are not in first position —
// are left untouched.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type InlineNode = { type: string; value?: string };
type HeadingNode = { type: "heading"; depth: number; children: InlineNode[] };
type RootNode = { type: "root"; children: Array<HeadingNode | InlineNode> };
type VFile = { path?: string | URL; data: { astro?: { frontmatter?: { title?: string } } } };

function headingText(node: HeadingNode): string {
  return node.children.map((child) => child.value ?? "").join("");
}

// Title from the .meta.json sidecar next to the document, if any.
function sidecarTitle(file: VFile): string | undefined {
  if (!file.path) return undefined;
  try {
    const raw = typeof file.path === "string" ? file.path : file.path.href;
    const docPath = raw.startsWith("file://") ? fileURLToPath(raw) : raw;
    const meta = JSON.parse(readFileSync(docPath.replace(/\.md$/, ".meta.json"), "utf-8"));
    return typeof meta.title === "string" ? meta.title : undefined;
  } catch {
    return undefined;
  }
}

export default function remarkNoFirstH1() {
  return (tree: RootNode, file: VFile) => {
    const [first] = tree.children;
    if (!first || first.type !== "heading" || first.depth !== 1) return;
    const h1 = headingText(first).trim();
    const title = file.data.astro?.frontmatter?.title ?? sidecarTitle(file);
    // Without a sidecar the loader uses the H1 as the title, so it always
    // matches and is duplicated by the page header.
    if (!title || title.trim() === h1) {
      tree.children.shift();
    }
  };
}