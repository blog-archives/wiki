# explorer-order

Sorts the left file explorer by a document's `order` frontmatter.

## What it does

Siblings that declare a numeric `order` are sorted by it first, ascending, and
an ordered entry sorts before an unordered one. Ties and unordered entries keep
Quartz's default alphabetical, folders-first order. This gives a topic's
articles a deliberate sequence in the sidebar.

## How it works

Quartz's explorer builds its tree client-side from `static/contentIndex.json`,
which carries only title/links/tags/content — frontmatter `order` never reaches
the browser. This `component` plugin closes that gap: `ExplorerOrder` wraps
`@quartz-community/explorer` and, on every render, builds a `slug → order` map
from `props.allFiles` and embeds it as an inline script
(`window.__explorerOrderMap`). The injected `sortFn` is serialized with
`.toString()` and re-evaluated in the browser, so it is self-contained and reads
that map. The component forwards `css`, `beforeDOMLoaded` and `afterDOMLoaded`
from the stock explorer unchanged.

## Files

- `index.js` — manifest and component registration.
- `components/index.js` — the `ExplorerOrder` wrapper.

## Wiring

Replaces `@quartz-community/explorer` in `quartz.config.yaml`; the manifest
exports the `./components` entry point.
