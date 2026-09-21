# heading-styles

Gives in-article heading levels a distinct visual hierarchy.

## What it does

Quartz's base styles give h4/h5/h6 the same size and weight, so deeper heading
levels are hard to tell apart. This plugin gives every level its own size,
weight, colour and accent (rules, bars, tracking) that fade as levels deepen.

## How it works

A `transformer` plugin that contributes CSS only: it reads `styles.css` at load
time and returns it through `externalResources()`. Everything is scoped to
`.markdown-rendered`, so the page title and UI chrome (TOC, sidebars) keep their
own styling. `htmlPlugins()` is a no-op that exists only because the loader
requires at least one processing hook to accept the plugin as a transformer.

## Files

- `index.js` — manifest and CSS injection.
- `styles.css` — the stylesheet.
