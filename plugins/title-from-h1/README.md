# title-from-h1

Enforces the single-source title convention: a document's title lives in
frontmatter, never as a duplicated `# Heading` in the body.

## What it does

A leading H1 is either promoted to the frontmatter title (when no explicit
title exists, or the existing title is just the file stem) or dropped (when an
explicit title wins). Either way the body H1 is removed, so Quartz renders the
title exactly once.

## How it works

A `transformer` plugin whose `htmlPlugins()` hook returns a small rehype plugin.
The plugin scans `tree.children` for the first real node, skipping blank text
and comments; if that node is an `h1` it takes its text content, writes it into
`file.data.frontmatter.title` when appropriate, and splices the node out.

## Wiring

Declared as a transformer in `quartz.config.yaml`. No options.
