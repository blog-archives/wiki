// Adds an expand-all / collapse-all control to the left explorer tree.
//
// Quartz builds the tree client-side on every navigation, so the button cannot
// be rendered by the server. This transformer injects a small stylesheet
// (styles.css) and a client script (client.js): the script places one toggle
// button in the explorer header, and a click opens every folder or closes every
// folder except the path leading to the page being read. Folder state is
// written back to the same `fileTree` localStorage key the stock explorer uses,
// so it survives navigation.

import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const STYLES = fsSync.readFileSync(path.join(here, "styles.css"), "utf-8")
const CLIENT_SCRIPT = fsSync.readFileSync(path.join(here, "client.js"), "utf-8")

export const manifest = {
  name: "explorer-expand-all",
  displayName: "Explorer Expand All",
  description:
    "Expand or collapse the whole left explorer tree, keeping the current page's path open.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
}

export const transformer = () => ({
  name: "ExplorerExpandAll",
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
