// Marks every page under `raw/` as unlisted. Such pages are still emitted and
// reachable through the links in wiki articles, but are dropped from the
// explorer, search index, graph, backlinks and folder listings. Keeps the
// immutable `raw/` sources free of frontmatter.

export const manifest = {
  name: "raw-unlisted",
  displayName: "Raw Unlisted",
  description: "Hide raw/ source pages from listings while keeping them link-reachable.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
}

const rawUnlisted = () => (_tree, file) => {
  const rel = file.data?.relativePath
  if (typeof rel === "string" && (rel === "raw" || rel.startsWith("raw/"))) {
    file.data.unlisted = true
  }
}

export const transformer = () => ({
  name: "RawUnlisted",
  htmlPlugins() {
    return [rawUnlisted]
  },
})
