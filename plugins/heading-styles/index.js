// Sharper typographic hierarchy for in-article headings.
//
// Quartz's base styles give h4/h5/h6 the same size and weight, so deeper
// heading levels are hard to tell apart. This transformer injects a small
// stylesheet (styles.css) that gives every level a distinct size, weight,
// colour and accent. Everything is scoped to `.markdown-rendered`, so the
// article title and UI chrome (TOC, sidebars) keep their own styling.

import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const STYLES = fsSync.readFileSync(path.join(here, "styles.css"), "utf-8")

export const manifest = {
  name: "heading-styles",
  displayName: "Heading Styles",
  description: "Differentiate in-article heading levels by size, weight, colour and accent.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
}

export const transformer = () => ({
  name: "HeadingStyles",
  // No-op: the transformer exists only to contribute CSS, but the loader
  // requires at least one processing hook to accept it as a transformer.
  htmlPlugins() {
    return []
  },
  externalResources() {
    return { css: [{ content: STYLES, inline: true }] }
  },
})
