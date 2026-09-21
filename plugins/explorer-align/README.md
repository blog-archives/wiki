# explorer-align

Aligns folder and file rows in the left explorer tree.

## What it does

A folder row leads with a 12px collapse chevron plus a 5px gap (17px total),
while a file row has no leading element, so file titles started 17px further
left than the folder titles beside them. This plugin reserves the same 17px
gutter on file rows and puts a matching document glyph in it, so folder and file
titles line up at every depth. Files also get the folder rows' line-height and a
hover colour.

## How it works

A `transformer` plugin that contributes CSS only: it reads `styles.css` at load
time and returns it through `externalResources()`. The stylesheet masks a lucide
document icon into the reserved gutter, redraws the folder chevron from the same
stroke icon (hiding the original inline polyline so collapse still works), and
turns the folder title wrapper into a centred flex row. `htmlPlugins()` is a
no-op that exists only because the loader requires at least one processing hook
to accept the plugin as a transformer.

## Files

- `index.js` — manifest and CSS injection.
- `styles.css` — the stylesheet.
