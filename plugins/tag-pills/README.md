# tag-pills

Shows a page's tags as a row of capsule links directly beneath the article title.

## What it does

Reads `file.data.frontmatter.tags` and renders each entry as a `#tag` pill that
links to the matching `tags/<tag>` page. Pages without tags render nothing.

## How it works

A `component` plugin: `index.js` carries the manifest the loader reads, and
`components/index.js` exports the `TagPills` component plus its stylesheet. The
tags are already slugified and de-duplicated by the `note-properties`
transformer, so the component only has to turn them into relative links — the
same `pathToRoot` + `tags/<tag>` shape `@quartz-community/tag-list` uses. The
local `tag-pages` page type guarantees a `tags/<tag>` page exists for every tag,
so every pill is clickable; the component still checks `allFiles` and falls back
to a plain capsule if a target is ever missing.

`note-properties` stays enabled as the frontmatter parser, but its own
properties table is hidden via `hidePropertiesView: true`, so this component is
the single place tags appear.

## Wiring

Declared in `quartz.config.yaml` at `beforeBody` priority 15 — the slot the
properties table used to occupy, between the title (priority 10) and the
date/reading time (priority 20).
