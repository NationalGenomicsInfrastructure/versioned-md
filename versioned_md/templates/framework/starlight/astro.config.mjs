import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { buildLinkGraph } from "./src/link-graph";
import remarkNoFirstH1 from "./src/remark-no-first-h1";
import remarkDocMetadata from "./src/remark-doc-metadata";
import remarkLinkSummaries from "./src/remark-link-summaries";

// Link graph over all documents (outgoing + incoming), built once at
// config-load time. Powers the per-document link summary sections appended
// by the remark-link-summaries plugin (see src/link-graph.ts).
const linkGraph = buildLinkGraph(fileURLToPath(new URL("./docs", import.meta.url)));

// https://starlight.astro.build/configuration
export default defineConfig({
  // Set to your deployment URL (used for canonical links, sitemap and RSS).
  // Adjust if you host somewhere other than GitHub Pages:
  site: "https://{{ org }}.github.io/{{ repo_name }}/",
  integrations: [
    starlight({
      title: {{ name | tojson }},
      description: {{ description | tojson }},
      // Sidebar groups are auto-generated from the versioned-md categories.
      // The "Documents overview" page is a manual entry (see src/pages/documents.astro).
      // Free to customise (labels, ordering, grouping).
      sidebar: [
        { label: "Documents overview", link: "/documents/" },
        { label: "Strict", autogenerate: { directory: "docs/strict" } },
        { label: "Drafts", autogenerate: { directory: "docs/drafts" } },
        { label: "Reference", autogenerate: { directory: "docs/reference" } },
      ],
      // Custom styles (the muted .doc-meta line, see src/remark-doc-metadata.ts).
      customCss: ["/src/styles/custom.css"],
    }),
  ],
  // Documents already start with an H1 matching the page title, which
  // Starlight renders in the page header; drop the duplicate from the body.
  // remark-doc-metadata renders the .meta.json sidecar as a muted line
  // under the header (Document ID, last update, reviewer).
  // remark-link-summaries appends a "Links on this page" section at the end
  // of each document (fed by the link graph computed above).
  // Note: this must be Astro's top-level markdown config — Starlight's
  // `markdown` option only supports `headingLinks`.
  markdown: {
    remarkPlugins: [remarkNoFirstH1, remarkDocMetadata, [remarkLinkSummaries, linkGraph]],
  },
});
