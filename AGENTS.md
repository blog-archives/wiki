# Knowledge Base

This repo is a personal LLM-powered knowledge base managed by the `karpathy-llm-wiki` skill. Load that skill for any ingest, query, or lint task.

## Layout

- `wiki/<topic>/` — compiled knowledge articles, one topic level only. Fully agent-owned.
- `wiki/images/` — single shared tree for every image under `wiki/`, grouped by source (`wiki/images/<source>/`); articles reference it as `../images/<source>/<file>`.
- `wiki/annotations/` — link-only annotation notes. Kept out of listings (see below); articles link to them for hover-preview "comments".
- `wiki/index.md` — global index: one row per article, grouped by topic.
- `wiki/log.md` — append-only operation log.

## Site

The published site is built with [Quartz 5](https://quartz.jzhao.xyz/) from `wiki/`. `make build` runs `npx quartz build -d wiki -o public`; `make serve` previews at http://localhost:8080. Config lives in `quartz.config.yaml`. Hover previews (`enablePopovers`), graph view, backlinks and full-text search are enabled; the UI locale is `zh-CN`.

Each document states its title once, as frontmatter `title:`, and its last-updated date as frontmatter `updated:`. The body must **not** repeat the title as a `# heading` — Quartz renders the frontmatter title as the page heading, and the local `plugins/title-from-h1` transformer promotes a leading H1 to the title and strips it. `log.md` is excluded via `ignorePatterns`. Pages under `wiki/annotations/` are published and reachable through article links (including hover previews), but marked *unlisted* by the local `plugins/unlisted-paths` transformer so they stay out of the explorer, search, graph and folder listings. The plugin takes a `prefixes` option listing the path prefixes to hide (currently `annotations`).

## Customization boundary

Quartz is vendored **unmodified**: `quartz/` and the framework files at the repo root (`package.json`, `package-lock.json`, `tsconfig.json`, `quartz.ts`, `Dockerfile`, …) are byte-identical to upstream v5, so an upgrade can replace them wholesale. All our behaviour changes are extensions upstream does not own:

- `quartz.config.yaml` — plugin list, layout, theme, locale (upstream ships only `quartz.config.default.yaml`).
- `plugins/<name>/` — local Quartz plugins, wired in via `source: "./plugins/<name>"`.
- `scripts/` — project tooling (`format-markdown.mjs`).
- `.github/workflows/deploy.yml` — our Pages deploy; upstream's CI workflows are intentionally not vendored.

Never edit `quartz/` or the vendored framework files for project needs — add a plugin or a config entry instead. `wiki/` is content and is untouched by framework updates.

## Workflow

- **Ingest** ("add to wiki", drop a URL/file): fetch the source, triage against existing wiki, compile into `wiki/<topic>/`, cascade-update affected articles, update `index.md` and `log.md`.
- **Query** ("what do I know about X"): search `index.md` then full-text; answer in conversation with relative links. Writes nothing unless asked to archive.
- **Format**: run `make format` (or `node scripts/format-markdown.mjs wiki`) to apply pangu spacing and safe layout to every `wiki/*.md`; `make format-check` reports drift without writing. The script skips frontmatter, code and link targets.

## Rules

- Inside `wiki/`, links are relative to the current file; in conversation, use project-root-relative paths.
- All images under `wiki/` live in the single `wiki/images/` tree, grouped by source (`wiki/images/<source>/`); articles reference them as `../images/<source>/<file>`.
- Never silently rewrite history (use Status blocks for outdated/disputed claims).

## Formatting preferences

- Use lists only for short, one-line items. For longer reasoning, write prose paragraphs instead of paragraph-length list items.
- For multi-point reasoning, give each point a short bold title line (a numbered item like `1. **Title**`, or a `###` subheading) and put the explanation in a separate paragraph below it.
- Don't leave prose as flat text: bold the thesis sentence of a paragraph and key terms, and use italics for sharp contrasts, so the reader can scan the argument.
