# centered-media

Centers images, mermaid diagrams and tables in the article body.

## What it does

Quartz left-aligns the media it renders: a Markdown image is an inline element
that starts at the left margin, a mermaid diagram's `<svg>` sits at the start of
its grid cell, and a narrow table hugs its `1rem` left margin. This plugin makes
those items sit in the middle of the content column instead. A caption line
(the emphasis directly after an image) follows its image to the center, and a
table that is already full width is unaffected.

## How it works

A `transformer` plugin that contributes CSS only: it reads `styles.css` at load
time and returns it through `externalResources()`. Everything is scoped to
`.markdown-rendered`, so the page title, popovers and UI chrome keep their own
layout; images inside external-link pills (`.el-favicon`) are excluded so their
inline sizing is untouched. `htmlPlugins()` is a no-op that exists only because
the loader requires at least one processing hook to accept the plugin as a
transformer.

## Files

- `index.js` — manifest and CSS injection.
- `styles.css` — the stylesheet.
