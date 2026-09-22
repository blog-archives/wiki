# tag-pages

Tag listing pages whose document lists include unlisted notes.

## What it does

Generates a `tags/<tag>` page for every tag used anywhere in the content,
including tags that only appear on unlisted notes (`annotations/`, `raw/`). Each
page lists the notes carrying that tag, and the tag index at `tags/` lists all
tags with their notes.

## How it works

`@quartz-community/tag-page` collects tags and lists pages from listed files
only (`file.unlisted !== true`), so a tag that occurs solely on unlisted notes
would get no page — and `tag-pills` would have nothing to link to. This
`pageType` plugin wraps the stock `TagPage` and `TagContent`:

- `generate()` runs the stock generator (which produces locale-aware pages for
  listed tags plus the `tags/` index) and then appends a page for every
  remaining tag, skipping any slug an on-disk tag page already owns.
- `body()` passes the stock `TagContent` a copy of `allFiles` with the
  `unlisted` flag cleared, so unlisted notes appear in the tag's document list.
  Nothing else about those notes changes — they stay out of the explorer,
  search, graph, backlinks and folder listings.

Everything else (paging, sorting, styling) is the stock implementation.

## Wiring

Replaces `@quartz-community/tag-page` in `quartz.config.yaml`. Paired with the
local `tag-pills` component, which links each tag to its listing page.
