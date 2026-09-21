# external-link-preview

Hover previews for external links, prefetched at build time.

## What it does

Quartz's built-in popover only handles internal links: it fetches the target
page same-origin and reads a `.popover-hint` element, neither of which works for
`a.external-link` (CORS blocks the fetch; external pages lack the hint). This
plugin fetches external link content once during the build and renders it in a
card that matches the internal popover exactly.

## How it works

An `emitter` plugin. On `emit`/`partialEmit` it walks every rendered page's
tree, collects the absolute URLs of `a.external-link` anchors, and fetches each
one in Node (no CORS) with bounded concurrency. Results are cached in
`.quartz-cache/external-link-preview.json` with a TTL, and written to
`static/external-previews.json`.

Three source shapes are handled:

- **GitHub blob links** resolve to the exact referenced lines through
  `raw.githubusercontent.com`.
- **GitHub directory links** (`/tree/`) read that directory's README, since
  GitHub renders it client-side, and convert it to the same block list.
- **Other pages** are parsed with `parse5` and reduced to a readable
  heading/paragraph/list/quote/code block list, with OpenGraph metadata kept as
  a fallback.

A small `client.js` runs `afterDOMReady`, loads the JSON, and on hover builds
the same `.popover` / `.popover-inner` card with a `.popover-hint` header and
`<article class="popover-hint">` body inside `.markdown-preview-view
.markdown-rendered`, so external previews render exactly like internal ones.
Individual fetch failures are skipped, never fatal.

`parse5` comes from Quartz's own rehype stack (see the root lockfile); the
vendored `package.json` cannot take a direct dependency, so this plugin relies
on the transitive install.

## Options

- `timeoutMs` (default `8000`)
- `concurrency` (default `6`)
- `cacheTtlHours` (default `168`)
- `maxDescriptionLength` (default `280`)
- `userAgent`

## Files

- `index.js` — emitter, fetch/cache logic and HTML/Markdown reduction.
- `client.js` — the hover-preview renderer.
