# explorer-align

Aligns folder and file rows in the left explorer tree.

## What it does

A folder row leads with an 18px icon plus a 5px gap (23px total), while a file
row had no leading element, so file titles started 23px further left than the
folder titles beside them. This plugin reserves the same 23px gutter on file rows
and puts a matching document glyph in it, so folder and file titles line up at
every depth. Files also get the folder rows' line-height and a hover colour.

Each glyph is a filled (solid) silhouette rather than an outline: a
`--secondary` blue folder, the filled open-folder while the folder is expanded,
and a neutral `--darkgray` document for files. The whole shape carries the
colour, so the folder/file distinction reads from solid colour rather than a
stroke. Folder and document share an 18px width; the document is portrait
(`--explorer-file-height`, 20px) so it reads as a page rather than a squat tile,
while the folder stays short and wide. Row text is 17px
(`--explorer-font-size`), so the glyphs sit just above the text size, and folder
titles take the file rows' typeface, weight and resting colour. Every row reads
as one list, and the only emphasised row is the file currently being viewed
(bolded, with its text and solid glyph tinted `--tertiary`).

## How it works

A `transformer` plugin that contributes CSS only: it reads `styles.css` at load
time and returns it through `externalResources()`. The stylesheet masks filled
Material Symbols paths into the reserved gutter (a document `::before` on file
rows, and the folder/open-folder onto the folder `<svg>`, hiding the original
inline chevron so the collapse click target still works), neutralises the old
chevron rotation, unifies the folder and file typography, and turns the folder
title wrapper into a centred flex row. `htmlPlugins()` is a no-op that exists
only because the loader requires at least one processing hook to accept the
plugin as a transformer.

## Files

- `index.js` — manifest and CSS injection.
- `styles.css` — the stylesheet.
