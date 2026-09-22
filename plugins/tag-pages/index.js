// Tag listing pages that also cover unlisted notes.
//
// `@quartz-community/tag-page` collects tags and lists pages from listed files
// only (`file.unlisted !== true`). Tags that appear solely on unlisted pages
// (`annotations/`, `raw/`) therefore get no tag page at all, and a tag pill has
// nothing to link to. This `pageType` plugin wraps the stock `TagPage` and
// `TagContent`:
//
//   - `generate()` keeps the stock pages (which carry locale-aware titles) and
//     adds one for every tag that only occurs on unlisted files;
//   - `body()` clears the `unlisted` flag on the files it hands to the stock
//     `TagContent`, so those notes show up in the tag's document list.
//
// Everything else — the tag index page, paging, sorting, styling — is the stock
// implementation. It replaces `@quartz-community/tag-page` in
// `quartz.config.yaml`.

import { TagContent, TagPage as BaseTagPage } from "@quartz-community/tag-page"

export const manifest = {
  name: "tag-pages",
  displayName: "Tag Pages",
  description: "Tag listing pages whose document lists include unlisted notes.",
  version: "1.0.0",
  category: "pageType",
  quartzVersion: ">=5.0.0",
}

const segmentPrefixes = (tag) => {
  const parts = String(tag).split("/")
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"))
}

const joinSlug = (...segments) =>
  segments
    .filter((segment) => segment !== "" && segment !== "/")
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .join("/")

// TagContent's own `isListed` check keys off `unlisted`, so a shallow copy that
// drops the flag is enough to let a note into the listing.
const listable = (file) => (file?.unlisted ? { ...file, unlisted: false } : file)

export const TagPages = (opts = {}) => {
  const base = BaseTagPage(opts)

  const body = (componentOpts) => {
    const inner = base.body(componentOpts)
    const Body = (props) =>
      inner({
        ...props,
        allFiles: (props.allFiles ?? []).map(listable),
      })
    Body.css = inner.css
    return Body
  }

  const generate = (ctx) => {
    const pages = base.generate(ctx)
    const used = new Set(pages.map((page) => page.slug))

    // Existing on-disk tag pages and the stock virtual pages both win.
    for (const [, file] of ctx.content) {
      const slug = file.data?.slug
      if (typeof slug === "string" && slug.startsWith("tags/")) {
        used.add(slug)
      }
    }

    const tags = new Set(
      ctx.content
        .flatMap(([, file]) => file.data?.frontmatter?.tags ?? [])
        .flatMap(segmentPrefixes),
    )
    for (const tag of tags) {
      const slug = joinSlug("tags", tag)
      if (used.has(slug)) continue
      used.add(slug)
      pages.push({ slug, title: tag, data: {} })
    }

    return pages
  }

  return { ...base, body, generate }
}
