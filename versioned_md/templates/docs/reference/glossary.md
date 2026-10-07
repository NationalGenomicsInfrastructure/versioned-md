# Glossary

A glossary of terms used throughout this documentation repository and by the `versioned-md` tooling.

## Documents

- **Document** — A single Markdown file under `docs/` with a companion `.meta.json` file holding its metadata.
- **Strict document** — A published document in `docs/strict/` with a 4-digit `documentId` (e.g. `1001.md`). The filename must match the documentId exactly.
- **Draft document** — A work-in-progress document in `docs/drafts/`. Drafts receive an auto-assigned `documentId` on first merge.
- **Reference document** — A static document in `docs/reference/` with a descriptive `documentId` and filename (e.g. `glossary.md`). Reference documents are versioned by CI like all other documents.

## Metadata

- **`.meta.json`** — The companion metadata file for a document. The single source of truth for all document metadata; documents themselves contain no frontmatter.
- **Protected fields** — Metadata fields (`version`, `lastUpdated`, `updatedBy`, `reviewer`, `commitHash`, `prNumber`, `category`, `documentId`, `status`) that only CI may modify. PRs that change them are rejected.
- **Mutable fields** — Metadata fields (`title`, `description`, `responsible`) that document authors may edit in a PR.
- **`version_history`** — The append-only log of a document's versions. Each entry records the version, date, author, reviewers, commit SHA, and PR number.

## Workflow

- **Promotion** — The process of moving a draft document to `docs/strict/`, assigning it a strict `documentId`, and initialising its version at `1`.
- **TEMPLATE branch** — A read-only reference branch holding a pristine render of the `versioned-md` template. Used as the baseline when syncing template updates.
- **Sync** — A `versioned-md sync` run that re-renders the template and opens a PR merging template changes back into `main`, preserving maintainer edits on `main`.
- **people.json** — The repository's team registry. PR authors and approved reviewers must be listed here for CI to pass.