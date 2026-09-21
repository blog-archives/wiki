// Keep sidebar titles on a single line.
//
// Quartz's explorer and table of contents let long titles wrap onto a second
// line, which makes the sidebars uneven. This transformer injects a small
// stylesheet (styles.css) that forces every sidebar title onto one line and
// clips overflow with an ellipsis. A tiny client script (client.js) then
// mirrors each truncated table-of-contents title into a native `title`
// tooltip, so hovering still reveals the full text.

import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const STYLES = fsSync.readFileSync(path.join(here, "styles.css"), "utf-8")
const CLIENT_SCRIPT = fsSync.readFileSync(path.join(here, "client.js"), "utf-8")

export const manifest = {
  name: "sidebar-title-ellipsis",
  displayName: "Sidebar Title Ellipsis",
  description: "Truncate long explorer and table-of-contents titles with an ellipsis.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
}

export const transformer = () => ({
  name: "SidebarTitleEllipsis",
  // No-op: the transformer exists only to contribute CSS and JS, but the
  // loader requires at least one processing hook to accept it as a transformer.
  htmlPlugins() {
    return []
  },
  externalResources() {
    return {
      css: [{ content: STYLES, inline: true }],
      js: [{ loadTime: "afterDOMReady", contentType: "inline", script: CLIENT_SCRIPT }],
    }
  },
})
