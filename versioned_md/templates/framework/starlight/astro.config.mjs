import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://starlight.astro.build/configuration
export default defineConfig({
  // Uncomment and set to your deployment URL (used for canonical links / RSS):
  // site: "https://your-org.github.io/{{ repo_name }}/",
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