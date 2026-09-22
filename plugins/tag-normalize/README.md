# tag-normalize

Treats different spellings of a tag as the same tag.

## What it does

Collapses casing, whitespace and underscore variants into one canonical tag, so
`AA tag`, `aa tag`, `aa_tag`, `aa-tag` and `AA    tag` all become `aa-tag` and
share a single tag page and pill.

## How it works

A `transformer` plugin that runs after `note-properties` (which parses the
frontmatter and initially slugs each tag). `slugTag` lowercases and turns spaces
into hyphens, but it keeps underscores and keeps every hyphen, so
`AA    tag` arrives as `aa----tag`. The normaliser applies, per `/`-separated
segment:

1. `trim()` and `toLowerCase()`
2. runs of whitespace and underscores → a single `-`
3. repeated `-` collapsed to one
4. leading/trailing `-` removed

Segments that become empty are dropped, then duplicates are removed. The rewrite
lands in `frontmatter.tags` before tag pages are generated and before the
content index is written, so pills, tag pages and search all see the same tag.
The plugin also updates the (hidden) properties-view copy for pages that opt
back in with `quartz-properties: true`.

## Wiring

Declared in `quartz.config.yaml` with `order: 7`, after `note-properties`
(`order: 5`) and before the tag page type and `tag-pills` consume the tags.
