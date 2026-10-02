import { defineCollection, z } from "astro:content";
import type { LoaderContext } from "astro:content";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Serve the versioned-md docs/ directory directly.
//
// versioned-md documents carry no frontmatter — their metadata lives in the
// .meta.json sidecars — so docsSchema() (which requires a `title` in
// frontmatter) cannot be used, and the plain glob loader cannot read the
// sidecars. This small custom loader walks docs/, reads each .md file, and
// enriches the entry with `title`/`description` from the adjacent
// .meta.json when present (falling back to a prettified filename).
//
// If you add frontmatter to your documents, you can replace this loader with
// the glob loader from "astro/loaders" and switch the schema to
// docsSchema() from "@astrojs/starlight/schema" (or starlightSchema() in
// newer Starlight versions).

const DOCS_DIR = "docs";

// Walk a directory recursively, returning paths of .md files relative to it.
async function findMarkdownFiles(dir: string, root: string): Promise<string[]> {
  const results: string[] = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) {
      results.push(...(await findMarkdownFiles(full, root)));
    } else if (name.endsWith(".md")) {
      results.push(path.relative(root, full));
    }
  }
  return results.sort();
}

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
    const files = await findMarkdownFiles(DOCS_DIR, DOCS_DIR);
    for (const relPath of files) {
      const id = relPath.replace(/\.md$/, "");
      const body = await readFile(path.join(DOCS_DIR, relPath), "utf-8");

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
        title = headingOf(body) ?? prettifyFilename(path.basename(relPath, ".md"));
      }

      const data = await ctx.parseData({ id, data: { title, description } });
      ctx.store.set({
        id,
        body,
        data,
        digest: ctx.generateDigest(body),
        filePath: path.join(DOCS_DIR, relPath),
      });
    }
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

export const collections = { docs };