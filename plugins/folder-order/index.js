// Sorts a folder page's article list by a document's `order` frontmatter.
//
// `@quartz-community/folder-page` renders its listing with a `sort` option that
// is fixed when the plugin is constructed, so it cannot be supplied from
// quartz.config.yaml (which has no way to express a function). This plugin wraps
// the stock FolderPage and injects an order-aware comparator: entries that
// declare a numeric `order` sort first by it, ascending, and an ordered entry
// sorts before an unordered one; ties and un-ordered entries keep the stock
// date/alphabetical order (folders first).
//
// It replaces `@quartz-community/folder-page` in quartz.config.yaml.

import { FolderContent, FolderPage as BaseFolderPage } from "@quartz-community/folder-page"
import { byDateAndAlphabeticalFolderFirst } from "@quartz-community/folder-page/components"

export const manifest = {
  name: "folder-order",
  displayName: "Folder Order",
  description: "Sort a folder page's article list by a document's `order` frontmatter.",
  version: "1.0.0",
  category: "pageType",
  quartzVersion: ">=5.0.0",
}

const numericOrder = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

const fallbackSort = byDateAndAlphabeticalFolderFirst()

const orderSort = (a, b) => {
  const ao = numericOrder(a.frontmatter?.order)
  const bo = numericOrder(b.frontmatter?.order)
  if (ao !== undefined && bo !== undefined && ao !== bo) return ao - bo
  if (ao !== undefined && bo === undefined) return -1
  if (ao === undefined && bo !== undefined) return 1
  return fallbackSort(a, b)
}

export const FolderPage = (opts = {}) => {
  const base = BaseFolderPage(opts)
  return {
    ...base,
    body: () => FolderContent({ ...opts, sort: opts.sort ?? orderSort }),
  }
}
