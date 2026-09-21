// Aligns folder and file rows in the left explorer tree.
//
// A folder row leads with a 12px collapse chevron plus a 5px gap, while a file
// row has no leading element, so file titles start 17px further left than the
// folder titles they sit beside. This transformer injects a small stylesheet
// (styles.css) that reserves the same 17px gutter on file rows and puts a
// matching document glyph in it, so folder and file titles line up at every
// depth. Files also get the folder rows' 1.5rem line-height and a hover colour.

import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const STYLES = fsSync.readFileSync(path.join(here, "styles.css"), "utf-8")

export const manifest = {
  name: "explorer-align",
  displayName: "Explorer Align",
  description: "Align folder and file titles in the left explorer tree.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
}

export const transformer = () => ({
  name: "ExplorerAlign",
  // No-op: the transformer exists only to contribute CSS, but the loader
  // requires at least one processing hook to accept it as a transformer.
  htmlPlugins() {
    return []
  },
  externalResources() {
    return { css: [{ content: STYLES, inline: true }] }
  },
})
