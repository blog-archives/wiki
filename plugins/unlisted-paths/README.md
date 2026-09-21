# unlisted-paths

Hides configured directories from every listing while keeping their pages
built, published and link-reachable.

## What it does

Pages whose path sits under a configured prefix are marked unlisted, so they
drop out of the explorer, search index, graph, backlinks and folder listings.
They are still emitted and reachable through article links, including hover
previews. This lets directories like `annotations/` and `raw/` stay link-only
without frontmatter on every note.

## How it works

A `transformer` plugin whose `htmlPlugins()` hook returns a rehype plugin. It
reads `file.data.relativePath` and sets `file.data.unlisted = true` when the
path equals a prefix or starts with `prefix/`. Prefixes are normalized by
stripping trailing slashes.

## Options

- `prefixes` (`string[]`, default `[]`) — path prefixes to hide.

## Wiring

Declared as a transformer in `quartz.config.yaml` with
`prefixes: [annotations, raw]`.
