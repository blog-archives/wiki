// Center media in the article body.
//
// Quartz left-aligns the media it renders: a Markdown image is an inline
// element that starts at the left margin, a mermaid diagram's <svg> sits at
// the start of its grid cell, and a narrow table hugs its 1rem left margin.
// This transformer injects a small stylesheet (styles.css) that centers
// images, captions, mermaid diagrams and tables within the content column.
// Everything is scoped to `.markdown-rendered`, so the page title, popovers
// and UI chrome keep their own layout.

import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const STYLES = fsSync.readFileSync(path.join(here, "styles.css"), "utf-8")

export const manifest = {
  name: "centered-media",
  displayName: "Centered Media",
  description: "Center images, mermaid diagrams and tables in the rendered article body.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
}

export const transformer = () => ({
  name: "CenteredMedia",
  // No-op: the transformer exists only to contribute CSS, but the loader
  // requires at least one processing hook to accept it as a transformer.
  htmlPlugins() {
    return []
  },
  externalResources() {
    return { css: [{ content: STYLES, inline: true }] }
  },
})
