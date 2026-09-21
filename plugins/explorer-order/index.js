// Sorts the file explorer by a document's `order` frontmatter.
//
// Quartz's explorer builds its tree client-side from `static/contentIndex.json`,
// which carries only title/links/tags/content — a file's frontmatter `order`
// never reaches the browser, so no client-side sort can see it.
//
// This plugin closes that gap with a single component: ExplorerOrder wraps the
// stock Explorer and, on every render, embeds a `slug -> order` map (built from
// the frontmatter of all files) as an inline script, plus a sort function that
// reads that map. Siblings that declare a numeric `order` are ordered by it
// first, ascending, and an ordered entry sorts before an unordered one; ties and
// un-ordered entries keep Quartz's default alphabetical, folders-first order.
//
// It replaces `@quartz-community/explorer` in quartz.config.yaml.

export const manifest = {
  name: "explorer-order",
  displayName: "Explorer Order",
  description: "Sort the file explorer by a document's `order` frontmatter.",
  version: "1.0.0",
  category: "component",
  quartzVersion: ">=5.0.0",
  components: {
    ExplorerOrder: {
      displayName: "Explorer Order",
      defaultPosition: "left",
      defaultPriority: 50,
    },
  },
}
