import { h, Fragment } from "preact"
import { Explorer } from "@quartz-community/explorer"

// A self-contained sort function: it is serialized with `.toString()` and
// re-evaluated in the browser, so it must not reference anything outside its
// own body. The order map is published as `window.__explorerOrderMap` by an
// inline script rendered next to the explorer.
const orderSortFn = (a, b) => {
  const map = (typeof window !== "undefined" && window.__explorerOrderMap) || {}
  const ao = a.data && typeof map[a.data.slug] === "number" ? map[a.data.slug] : undefined
  const bo = b.data && typeof map[b.data.slug] === "number" ? map[b.data.slug] : undefined
  if (ao !== undefined && bo !== undefined && ao !== bo) return ao - bo
  if (ao !== undefined && bo === undefined) return -1
  if (ao === undefined && bo !== undefined) return 1
  const sameKind = (!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)
  if (sameKind) {
    return (a.displayName || "").localeCompare(b.displayName || "", undefined, {
      numeric: true,
      sensitivity: "base",
    })
  }
  return a.isFolder ? -1 : 1
}

const numericOrder = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

const orderMapFromFiles = (allFiles) => {
  const map = {}
  for (const file of allFiles ?? []) {
    const order = numericOrder(file.frontmatter?.order)
    if (order !== undefined && file.slug) map[file.slug] = order
  }
  return map
}

export const ExplorerOrder = (opts = {}) => {
  const inner = Explorer({ ...opts, sortFn: opts.sortFn ?? orderSortFn })

  const component = (props) => {
    const map = orderMapFromFiles(props.allFiles)
    const publish = h("script", {
      dangerouslySetInnerHTML: { __html: `window.__explorerOrderMap=${JSON.stringify(map)}` },
    })
    return h(Fragment, null, [inner(props), publish])
  }

  component.displayName = "ExplorerOrder"
  component.css = inner.css
  component.beforeDOMLoaded = inner.beforeDOMLoaded
  component.afterDOMLoaded = inner.afterDOMLoaded
  return component
}
