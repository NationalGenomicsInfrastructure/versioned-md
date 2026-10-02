import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

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
      // Free to customise (labels, ordering, grouping).
      sidebar: [
        { label: "Strict", autogenerate: { directory: "docs/strict" } },
        { label: "Drafts", autogenerate: { directory: "docs/drafts" } },
        { label: "Reference", autogenerate: { directory: "docs/reference" } },
      ],
    }),
  ],
});