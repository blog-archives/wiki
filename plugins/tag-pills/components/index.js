// Renders `file.data.frontmatter.tags` as a row of capsule links. The tags are
// already slugified and de-duplicated by the note-properties transformer, so
// each one maps directly onto a `tags/<tag>` page.
//
// The local `tag-pages` page type generates a listing page for every tag
// (including tags that only occur on unlisted notes), so pills are clickable.
// The `hasTagPage` check is only a guard against a missing target; in a normal
// build the page always exists.

import { h } from "preact"

const classNames = (...classes) => classes.filter(Boolean).join(" ")

// Relative path from the current page back to the site root ("" -> ".").
const pathToRoot = (slug) => {
  const parents = String(slug ?? "")
    .split("/")
    .filter((segment) => segment !== "")
    .slice(0, -1)
  return parents.length === 0 ? "." : parents.map(() => "..").join("/")
}

const tagHref = (slug, tag) => `${pathToRoot(slug)}/tags/${tag}`

const hasTagPage = (allFiles, tag) =>
  Array.isArray(allFiles) && allFiles.some((file) => file?.slug === `tags/${tag}`)

const CSS = `
.tag-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.45rem;
  margin: 0.7rem 0 0.2rem;
  padding: 0;
  list-style: none;
}

.tag-pills > li {
  margin: 0;
}

.tag-pills .tag-pill {
  display: inline-block;
  padding: 0.05rem 0.7rem;
  border-radius: 999px;
  background: var(--highlight);
  color: var(--secondary);
  font-size: 0.8rem;
  line-height: 1.7;
  text-decoration: none;
  white-space: nowrap;
}

.tag-pills .tag-pill::before {
  content: "#";
  margin-right: 0.15em;
  color: var(--gray);
}

a.tag-pill {
  transition: background-color 0.15s ease, color 0.15s ease;
}

a.tag-pill:hover,
a.tag-pill:focus-visible {
  background: var(--secondary);
  color: var(--light);
}

a.tag-pill:hover::before,
a.tag-pill:focus-visible::before {
  color: inherit;
}

a.tag-pill:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

/* Match the stock tag list: keep previews clean. */
.popover .tag-pills {
  display: none;
}
`

const TagPills = () => {
  const Component = ({ fileData, allFiles, displayClass }) => {
    const tags = fileData?.frontmatter?.tags
    if (!Array.isArray(tags) || tags.length === 0) return null

    const slug = fileData?.slug ?? ""
    return h(
      "ul",
      { class: classNames(displayClass, "tag-pills") },
      tags.map((tag) => {
        const label = h("span", { class: "tag-pill" }, tag)
        return h(
          "li",
          { key: tag },
          hasTagPage(allFiles, tag)
            ? h("a", { class: "internal tag-pill", href: tagHref(slug, tag) }, tag)
            : label,
        )
      }),
    )
  }

  Component.css = CSS
  return Component
}

export { TagPills }
