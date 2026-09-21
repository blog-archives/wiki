# sidebar-title-ellipsis

Keeps sidebar titles on a single line, clipped with an ellipsis.

## What it does

Long explorer and table-of-contents titles would otherwise wrap onto a second
line and make the sidebars uneven. This plugin forces every sidebar title onto
one line, and mirrors each truncated table-of-contents title into a native
`title` tooltip so hovering still reveals the full text.

## How it works

A `transformer` plugin that contributes both CSS and JS. It reads `styles.css`
and `client.js` at load time and returns them through `externalResources()`:
the stylesheet (scoped to the explorer and TOC) applies the single-line
ellipsis, and the client script runs `afterDOMReady` and copies TOC link text
into the `title` attribute on every `nav`/`render` event. `htmlPlugins()` is a
no-op that exists only because the loader requires at least one processing hook
to accept the plugin as a transformer.

## Files

- `index.js` — manifest, CSS and client-script injection.
- `styles.css` — the sidebar rules.
- `client.js` — the hover-tooltip script.
