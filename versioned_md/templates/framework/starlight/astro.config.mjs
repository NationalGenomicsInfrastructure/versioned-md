import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import remarkNoFirstH1 from "./src/remark-no-first-h1";

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
      // The "All documents" page is a manual entry (see src/pages/documents.astro).
      // Free to customise (labels, ordering, grouping).
      sidebar: [
        { label: "All documents", link: "/documents/" },
        { label: "Strict", autogenerate: { directory: "docs/strict" } },
        { label: "Drafts", autogenerate: { directory: "docs/drafts" } },
        { label: "Reference", autogenerate: { directory: "docs/reference" } },
      ],
    }),
  ],
  // Documents already start with an H1 matching the page title, which
  // Starlight renders in the page header; drop the duplicate from the body.
  // Note: this must be Astro's top-level markdown config — Starlight's
  // `markdown` option only supports `headingLinks`.
  markdown: {
    remarkPlugins: [remarkNoFirstH1],
  },
});
