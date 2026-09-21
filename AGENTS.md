# Knowledge Base

This repo is a personal LLM-powered knowledge base managed by the `karpathy-llm-wiki` skill. Load that skill for any ingest, query, or lint task.

## Layout

- `wiki/<topic>/` — compiled knowledge articles. A topic may hold one level of sub-topic directories for a focused series (e.g. `wiki/ai-agent/interrupt-resume/`); no deeper nesting. Fully agent-owned.
- `wiki/images/` — single shared tree for every image under `wiki/`, grouped by source (`wiki/images/<source>/`); articles reference it as `../images/<source>/<file>`.
- `wiki/annotations/` — link-only annotation notes. Kept out of listings (see below); articles link to them for hover-preview "comments".
- `raw/` — archive for sources that are *ephemeral or likely to be lost*: session-scoped Q&A links, pasted text, offline documents. A durable public original (a page or repo that stays reachable) is linked directly in the article instead, never archived. Flat (no topic subdirectories), stored verbatim with a metadata header. Files are named by timestamp, `YYYY-MM-DD-HHMMSS.md` (a day can hold several sources, so the name goes down to the second). Surfaced to the build through the `wiki/raw` symlink (see below), so its pages are published and link-reachable but unlisted.
- `wiki/index.md` — global index: one row per article, grouped by topic.
- `wiki/log.md` — append-only operation log.

## Site

The published site is built with [Quartz 5](https://quartz.jzhao.xyz/) from `wiki/`. `make build` runs `npx quartz build -d wiki -o public`; `make serve` previews at http://localhost:8080. Config lives in `quartz.config.yaml`. Hover previews (`enablePopovers`), graph view, backlinks and full-text search are enabled; the UI locale is `zh-CN`.

Each document states its title once, as frontmatter `title:`, and its last-updated date as frontmatter `updated:`. The body must **not** repeat the title as a `# heading` — Quartz renders the frontmatter title as the page heading, and the local `plugins/title-from-h1` transformer promotes a leading H1 to the title and strips it. `log.md` is excluded via `ignorePatterns`. Pages under `wiki/annotations/` are published and reachable through article links (including hover previews), but marked *unlisted* by the local `plugins/unlisted-paths` transformer so they stay out of the explorer, search, graph and folder listings. The plugin takes a `prefixes` option listing the path prefixes to hide (currently `annotations` and `raw`). The `raw/` source archive gets the same treatment: `wiki/raw` is a symlink to the repo-root `raw/`, so raw pages are built and link-reachable but never listed.

The explorer sidebar can be ordered with a document's `order:` frontmatter. Quartz's stock explorer builds its tree client-side from `static/contentIndex.json`, which carries only title/links/tags/content, so the local `plugins/explorer-order` component wraps it: every render embeds a `slug → order` map built from all files' frontmatter, and the client-side sort places siblings that declare a numeric `order` first by it (ascending, ordered before unordered), falling back to the stock alphabetical, folders-first order otherwise. It replaces `@quartz-community/explorer` in the plugin list. The same `order` drives the article list on a folder page: the local `plugins/folder-order` page type wraps `@quartz-community/folder-page` with an order-aware comparator (ordered entries ascending first, then the stock date/alphabetical order). The left tree's rows are aligned by the local `plugins/explorer-align` transformer, which reserves the folder chevron's 17px gutter on file rows and puts a matching document glyph in it, and redraws the folder chevron from the same stroke icon, so folder and file titles line up at every depth.

## Customization boundary

Quartz is vendored **unmodified**: `quartz/` and the framework files at the repo root (`package.json`, `package-lock.json`, `tsconfig.json`, `quartz.ts`, `Dockerfile`, …) are byte-identical to upstream v5, so an upgrade can replace them wholesale. All our behaviour changes are extensions upstream does not own:

- `quartz.config.yaml` — plugin list, layout, theme, locale (upstream ships only `quartz.config.default.yaml`).
- `plugins/<name>/` — local Quartz plugins, wired in via `source: "./plugins/<name>"`.
- `scripts/` — project tooling (`format-markdown.mjs`).
- `.github/workflows/deploy.yml` — our Pages deploy; upstream's CI workflows are intentionally not vendored.

Never edit `quartz/` or the vendored framework files for project needs — add a plugin or a config entry instead. `wiki/` is content and is untouched by framework updates.

## Workflow

- **Ingest** ("add to wiki", drop a URL/file): fetch the source; archive it to `raw/` only if it is ephemeral or likely to be lost, otherwise cite the durable original inline. Then triage against existing wiki, compile into `wiki/<topic>/`, cascade-update affected articles, update `index.md` and `log.md`.
- **Query** ("what do I know about X"): search `index.md` then full-text; answer in conversation with relative links. Writes nothing unless asked to archive.
- **Format**: run `make format` (or `node scripts/format-markdown.mjs wiki`) to apply pangu spacing and safe layout to every `wiki/*.md`; `make format-check` reports drift without writing. The script skips frontmatter, code and link targets.

## Rules

- Inside `wiki/`, links are relative to the current file; in conversation, use project-root-relative paths.
- All images under `wiki/` live in the single `wiki/images/` tree, grouped by source (`wiki/images/<source>/`); articles reference them as `../images/<source>/<file>`.
- When an article is a summary or translation of one specific source, open the body with a one-line blockquote that says so and links the original inline, e.g. `> 本文是 [DeepWiki | anthropics/claude-code/3-core-systems](https://deepwiki.com/anthropics/claude-code/3-core-systems) 一章的中文译文。`. Keep it to that single line — no separate `原文：` line and no long overview. When only a passage or sentence is drawn from a source, link it inline in that paragraph or sentence instead.
- Never silently rewrite history (use Status blocks for outdated/disputed claims).

## Formatting preferences

- Use lists only for short, one-line items. For longer reasoning, write prose paragraphs instead of paragraph-length list items.
- For multi-point reasoning, give each point a short bold title line (a numbered item like `1. **Title**`, or a `###` subheading) and put the explanation in a separate paragraph below it.
- Don't leave prose as flat text: bold the thesis sentence of a paragraph and key terms, and use italics for sharp contrasts, so the reader can scan the argument.
