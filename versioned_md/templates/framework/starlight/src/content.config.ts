import { defineCollection, z } from "astro:content";
import type { LoaderContext } from "astro:content";
import { glob } from "astro/loaders";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Serve the versioned-md docs/ directory directly.
//
// versioned-md documents carry no frontmatter — their metadata lives in the
// .meta.json sidecars — so docsSchema() (which requires a `title` in
// frontmatter) cannot be used directly. We wrap Astro's glob loader (which
// does the actual Markdown rendering) and enrich each entry with
// `title`/`description` from the adjacent .meta.json when present, falling
// back to the document's H1 and then a prettified filename.
//
// If you add frontmatter to your documents, you can replace this loader with
// the bare glob loader from "astro/loaders" and switch the schema to
// docsSchema() from "@astrojs/starlight/schema" (or starlightSchema() in
// newer Starlight versions).

const DOCS_DIR = "docs";

// "01-using-versioned-md" -> "01 using versioned md"; "1001" -> "1001".
function prettifyFilename(stem: string): string {
  return stem.replace(/[-_]+/g, " ").trim();
}

// First "# heading" in a markdown body, if any.
function headingOf(body: string): string | undefined {
  const match = body.match(/^\s{0,3}#\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

const loader = {
  name: "versioned-md",
  load: async (ctx: LoaderContext) => {
    // The glob loader scans the directory and renders the Markdown; the
    // wrapper below only enriches the parsed data.
    const base = await glob({ pattern: "**/*.md", base: DOCS_DIR }).load(ctx);
    void base; // the glob loader populates ctx.store directly
    for (const [id, entry] of ctx.store.entries()) {
      let title: string | undefined;
      let description: string | undefined;
      try {
        const meta = JSON.parse(
          await readFile(path.join(DOCS_DIR, `${id}.meta.json`), "utf-8"),
        );
        title = meta.title;
        description = meta.description;
      } catch {
        // No .meta.json sidecar — fall back to the document's H1, then the
        // filename.
        title =
          entry.data.title ??
          headingOf(entry.body) ??
          prettifyFilename(path.basename(id));
      }
      // A modified digest: re-setting with the same digest is a no-op.
      ctx.store.set({
        ...entry,
        data: { ...entry.data, title, description },
        digest: ctx.generateDigest(entry.body + `|${title}|${description}`),
      });
    }
    // docs/README.md is a GitHub-facing overview of the docs directory, not
    // a site page: it is not in any sidebar group, and keeping it out of the
    // build stops it surfacing at /readme/ and in link summaries. The file
    // stays on disk. (The glob loader keys entries by their slug, which is
    // githubSlug-lowercased — hence "readme", not "README".)
    ctx.store.delete("readme");
  },
};

const docs = defineCollection({
  loader,
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
    pagefind: z.boolean().default(true),
    template: z.enum(["doc", "splash"]).default("doc"),
    head: z
      .array(
        z.object({
          tag: z.enum([
            "title",
            "base",
            "link",
            "style",
            "meta",
            "script",
            "noscript",
            "template",
          ]),
          attrs: z
            .record(z.union([z.string(), z.boolean(), z.undefined()]))
            .optional(),
          content: z.string().optional(),
        }),
      )
      .default([]),
    sidebar: z
      .object({
        order: z.number().optional(),
        label: z.string().optional(),
        hidden: z.boolean().default(false),
      })
      .default({}),
  }),
});

// ---------------------------------------------------------------------------
// docMeta: one entry per .meta.json sidecar, powering the "All documents"
// overview page (src/pages/documents.astro). Pure data — no Markdown
// rendering involved, so a plain loader is sufficient here.
// ---------------------------------------------------------------------------

// Recursively yield the paths of all .meta.json files under *dir*.
async function* walkMetaFiles(dir: string): AsyncGenerator<string> {
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // directory missing — nothing to do
  }
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      yield* walkMetaFiles(full);
    } else if (item.name.endsWith(".meta.json")) {
      yield full;
    }
  }
}

const docMetaLoader = {
  name: "versioned-md-meta",
  load: async (ctx: LoaderContext) => {
    // Pure custom loader (no glob loader): the files are plain JSON, so no
    // Markdown rendering is involved, and a glob loader would validate the
    // raw entries against the schema before we could enrich them. Entry ids
    // are the sidecar paths relative to docs/ ("strict/1001"), which map
    // directly to document URLs ("/strict/1001/").
    for await (const filePath of walkMetaFiles(DOCS_DIR)) {
      const slug = path
        .relative(DOCS_DIR, filePath)
        .replace(/\.meta\.json$/, "")
        .split(path.sep)
        .join("/");
      const stem = path.basename(slug);
      let meta: Record<string, unknown>;
      try {
        meta = JSON.parse(await readFile(filePath, "utf-8"));
      } catch {
        continue; // skip unparseable sidecars
      }
      const data = {
        title: typeof meta.title === "string" ? meta.title : prettifyFilename(stem),
        documentId:
          typeof meta.documentId === "string" ? meta.documentId : stem,
        category:
          typeof meta.category === "string" ? meta.category : path.dirname(slug).split(path.sep)[0] || "",
        lastUpdated:
          typeof meta.lastUpdated === "string" ? meta.lastUpdated : "",
        updatedBy: typeof meta.updatedBy === "string" ? meta.updatedBy : "",
        version: typeof meta.version === "string" ? meta.version : "",
      };
      ctx.store.set({
        id: slug,
        data,
        body: "",
        filePath,
        digest: ctx.generateDigest(JSON.stringify(data)),
      });
    }
  },
};

const docMeta = defineCollection({
  loader: docMetaLoader,
  schema: z.object({
    title: z.string(),
    documentId: z.string(),
    category: z.string(),
    lastUpdated: z.string(),
    updatedBy: z.string(),
    version: z.string(),
  }),
});

export const collections = { docs, docMeta };