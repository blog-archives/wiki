// Marks every page under the configured path prefixes as unlisted. Such pages
// are still emitted and reachable through the links in wiki articles (including
// hover previews), but are dropped from the explorer, search index, graph,
// backlinks and folder listings. Keeps the immutable `raw/` sources free of
// frontmatter, and lets directories such as `annotations/` stay link-only.

export const manifest = {
  name: "unlisted-paths",
  displayName: "Unlisted Paths",
  description: "Hide configured directories from listings while keeping them link-reachable.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
  defaultOptions: {
    prefixes: ["raw"],
  },
}

const unlistedPaths = (prefixes) => () => (_tree, file) => {
  const rel = file.data?.relativePath
  if (typeof rel !== "string") return
  const hidden = prefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
  if (hidden) {
    file.data.unlisted = true
  }
}

export const transformer = (options = {}) => {
  const prefixes = (options.prefixes ?? manifest.defaultOptions.prefixes).map((prefix) =>
    prefix.replace(/\/+$/, ""),
  )

  return {
    name: "UnlistedPaths",
    htmlPlugins() {
      return [unlistedPaths(prefixes)]
    },
  }
}
