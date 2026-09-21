# folder-order

Sorts a folder page's article list by a document's `order` frontmatter.

## What it does

Entries that declare a numeric `order` sort first by it, ascending, and an
ordered entry sorts before an unordered one. Ties and unordered entries keep the
stock date/alphabetical order (folders first). The same `order` also drives the
sidebar via `explorer-order`.

## How it works

`@quartz-community/folder-page` renders its listing with a `sort` option fixed
at construction, so it cannot be supplied from `quartz.config.yaml` (which has
no way to express a function). This `pageType` plugin wraps the stock
`FolderPage` and overrides its `body()` to pass an order-aware comparator into
`FolderContent`, falling back to `byDateAndAlphabeticalFolderFirst` when no
explicit `sort` is given. `numericOrder` accepts numbers and numeric strings.

## Wiring

Replaces `@quartz-community/folder-page` in `quartz.config.yaml`.
