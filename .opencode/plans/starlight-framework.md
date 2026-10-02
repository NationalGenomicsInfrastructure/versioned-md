# WIP: Starlight as optional static-site framework for `versioned-md create`

_Last updated: All-documents overview page added. Branch `starlight` is 10 commits ahead of `main`, ready to merge._

## Status: ✅ DONE (pending merge)

Branch `starlight` is 10 commits ahead of `main`:
- `b35aeae` — Added Starlight as optional static site framework
- `42f045e` — Fixed Starlight scaffold site URL handling
- `de2ad5f` — Fixed empty doc bodies in Starlight scaffold
- `8016110` — Deduplicated document title in Starlight scaffold
- `6c0eab1` — Support subdirectories under category dirs; move SOPs to reference/sop/
- `7591a58` — Rename SOP dir to reference/versioned-md, add glossary example
- `2e23b07` — Add .meta.json sidecars for all template documents
- (+ overview page commit) — All documents overview page from .meta.json sidecars

Working tree clean (only untracked `.opencode/`).

## What was built

`versioned-md create --framework starlight` scaffolds an Astro/Starlight site at the repo
root from `versioned_md/templates/framework/starlight/`:
- `package.json`, `astro.config.mjs`, `tsconfig.json` (Jinja-rendered: name/description/org/repo_name)
- `src/content.config.ts` — loader + minimal schema (the interesting part, see below)
- `src/remark-no-first-h1.ts` — remark plugin deduplicating the document H1 / page-header title
- `src/pages/documents.astro` — “All documents” overview table built from `.meta.json` sidecars
- `src/pages/index.astro` — redirects `/` → `/reference/versioned-md/01-using-versioned-md/`

Tooling integration:
- `create.py`: `SUPPORTED_FRAMEWORKS = ("starlight",)`, `_normalize_framework()`,
  interactive prompt, `render_template` copies `framework/<name>/*` to repo root only
  when selected; `.versioned-md.yml` persists `framework:`
- `sync.py`: reads `framework` back from `.versioned-md.yml`
- `cli.py`: `--framework` option on create
- `templates/.gitignore` + `templates/README.md`: conditional Node/Starlight sections

## Verified
- Fresh `create --framework starlight` → `npm install` → `npm run build`: 12 pages,
  correct titles, sidebar groups (Strict/Drafts/Reference), sitemap
- `npm run dev` / preview: `/` redirects to Getting Started, all doc pages 200
- **Sync round-trip test PASSED** (fresh repo at /tmp/vm-create/fresh-docs):
  1. Maintainer commits customisation to a framework file in `main` (site title)
  2. Template is changed upstream (sidebar label)
  3. `sync` re-renders TEMPLATE branch: picks up template change, `main` untouched
  4. TEMPLATE→main PR diff shows the maintainer's customisation as a revert-to-template
     — maintainer reviews/re-applies. This is standard nf-core-style template semantics:
     framework files are template-owned; maintainer edits survive in main until the sync
     PR is merged, then show up in the diff.
- Note: `sync` CLI flags `--push`/`--pr` are bool Options defaulting True with no
  `--no-` variants — can only be disabled by calling SyncApplication directly (test did).
  Consider `typer.Option(True, "--push", "--no-push" ...)` or Optional[bool] later.

## Key technical decisions (re-check when upgrading Starlight/Astro)
1. **No frontmatter in versioned-md docs** → `docsSchema()` unusable (requires `title`).
   Custom schema defaults everything Starlight reads unguarded:
   `draft: false`, `pagefind: true`, `template: "doc"`, `head: []`, `sidebar: {}`
   (missing defaults → pages silently dropped or mergeHead crash).
2. **Bodies rendered empty with a pure custom loader**: Starlight's
   `routes/common.astro` calls astro:content `render(entry)` which only outputs
   `entry.rendered.html` — never populated for hand-rolled loaders. FIX: wrap Astro's
   `glob({pattern, base})` loader (does the Markdown rendering) and enrich entries.
3. **Astro 5.18.2 loader-store quirks** (in `content.config.ts`):
   - `glob(...).load(ctx)` returns `undefined`; it populates `ctx.store` directly
   - scoped `store.entries()` yields `[id, entry]` tuples
   - `store.set()` with an unchanged digest is a NO-OP → enriched re-set must use a
     modified digest (we hash body + title + description)
   - no `store.update()` method in this version
4. **Title/description enrichment**: `.meta.json` sidecar when present (strict/draft docs),
   else document H1, else prettified filename (reference docs + README).
   This is the hook for future `.meta.json` rendering (version/reviewers/history).
5. **Sidebar**: `[{ label, autogenerate: { directory: "docs/<cat>" } }]`; directory must
   include the `docs/` prefix (matched against entry filePath).
6. **`site` option**: pre-filled `https://{{ org }}.github.io/{{ repo_name }}/` (sitemap/
   canonical). Beware: with `site` set, `Astro.url` carries the production origin — the
   index redirect uses a plain path for this reason.
7. **Duplicate title**: docs start with an H1 that Starlight also renders as the page
   header → `remark-no-first-h1.ts` strips the first heading when it matches the title.
   Gotchas found while implementing:
   - must be registered in **Astro's top-level** `markdown.remarkPlugins` — Starlight's
     `starlight({ markdown })` option only supports `headingLinks` (zod strips the rest)
   - the body is rendered **before** loader enrichment, so `file.data.astro.frontmatter`
     is empty at remark time → the plugin re-resolves the title from the `.meta.json`
     sidecar via `file.path` (plain path string, not a `file://` URL, in this pipeline;
     both handled)
   - verified both branches: matching H1 stripped (1 h1 on page), differing H1 kept (2)
8. **Custom pages (Starlight 0.34.x API)**: there is **no** `Document.astro` layout and
   no `StarlightBody` export in 0.34.8 (old docs are stale). Custom pages wrap content in
   `<StarlightPage frontmatter={...}>` from
   `@astrojs/starlight/components/StarlightPage.astro`.
9. **docMeta collection** (powers `/documents/`): pure custom loader with its own
   `fs.readdir` walk. Why not the glob loader: (a) it mangles double-extension ids
   (`strict/1001.meta.json` → id `strict/1001meta`), (b) it validates raw entries
   against the collection schema *before* a wrapper can enrich them — the docs
   collection survives this only because its schema fields are all optional/defaulted.
   Entry id = sidecar path relative to docs/ = the document URL slug (`/strict/1001/`).
10. **Jinja in scaffold files**: `create` renders every template file through Jinja2 —
    avoid literal `{{` in scaffold source (the `documents.astro` frontmatter object is
    defined in a variable for exactly this reason). `{%` and `{#` too.

## Test fixtures
- `/tmp/vm-create/test-docs` — full repo, node_modules installed, `npm run build` green,
  preview via `npm run preview -- --port 4321`
- `/tmp/vm-create/fresh-docs` — sync round-trip test repo

## Next (if continuing)
1. **Merge `starlight` → main** (or open a PR)
2. Optional: `--no-push`/`--no-pr` variants for the sync CLI
3. Backlog from earlier review (unchanged):
   - no test suite yet (pytest, esp. metadata/doc/create/sync)
   - drift between `versioned_md/metadata.py` and `versioned_md/templates/lib/metadata.py`
     (and reviewers.py) — consider a test asserting they match, or generating the template
     from the package
   - static site does not render `.meta.json` data (version/reviewers/history) — future:
     custom Starlight theme or frontmatter generation step (the loader enrichment is the hook)
   - no CI for the tool repo itself (ruff + pytest workflow)
   - README typo: "drafts/get auto-assigned docId"
   - `doc import`: `--document-id -d` and `--directory -d` share a short flag (verify/fix)

## Notes
- `render_template` fallback silently copies files when Jinja rendering throws —
  consider making that a warning, not debug-only
- `docs/README.md` shows up at `/README/` but in no sidebar group — acceptable
- test repos are disposable; recreate via `create` after template changes