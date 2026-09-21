// Enforces the single-source title convention: a document's title lives in
// frontmatter, never as a duplicated `# Heading` in the body.
//
// - Leading H1 with no explicit title (e.g. immutable raw/ sources) -> promoted
//   to the frontmatter title.
// - Leading H1 alongside an explicit title -> the H1 is dropped; frontmatter wins.
//
// Either way the body H1 is removed so the title renders exactly once.

export const manifest = {
  name: "title-from-h1",
  displayName: "Title From H1",
  description: "Promote a leading H1 to the frontmatter title and drop the duplicate heading.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
}

const textContent = (node) => {
  if (!node) return ""
  if (node.type === "text") return node.value
  if (Array.isArray(node.children)) return node.children.map(textContent).join("")
  return ""
}

const leadingH1Index = (children) => {
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type === "text" && node.value.trim() === "") continue
    if (node.type === "comment") continue
    return node.type === "element" && node.tagName === "h1" ? i : -1
  }
  return -1
}

const titleFromH1 = () => (tree, file) => {
  const children = tree.children
  if (!Array.isArray(children)) return

  const index = leadingH1Index(children)
  if (index === -1) return

  const text = textContent(children[index]).trim()
  const frontmatter = (file.data.frontmatter ??= {})
  if (text && (!frontmatter.title || frontmatter.title === file.stem)) {
    frontmatter.title = text
  }
  children.splice(index, 1)
}

export const transformer = () => ({
  name: "TitleFromH1",
  htmlPlugins() {
    return [titleFromH1]
  },
})
