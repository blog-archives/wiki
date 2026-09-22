// Canonicalises tag spellings so different ways of writing the same tag share
// one tag page and one pill.
//
// Quartz already runs each tag through `slugTag`, which lowercases and turns
// spaces into hyphens, but it leaves underscores in place and keeps every
// hyphen it produces. So "AA    tag" becomes "aa----tag" and "aa_tag" stays
// "aa_tag" — three spellings, three tags. This transformer runs after
// `note-properties` (which owns frontmatter parsing and the initial slugging)
// and rewrites `frontmatter.tags` to one canonical form:
//
//   lowercase, runs of whitespace/underscores collapsed to a single hyphen,
//   repeated hyphens collapsed, and no leading/trailing hyphen.
//
// "/" still separates hierarchy segments, so each segment is normalised on its
// own. Applying it to the already-slugged value also covers the leading and
// trailing hyphens `slugTag` leaves behind (" aa tag " -> "-aa-tag-").
//
// The rewrite happens before tag pages are generated and before the content
// index is written, so pills, tag pages and search all agree.

const canonicalSegment = (segment) =>
  String(segment)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")

const canonicalize = (tags) =>
  Array.isArray(tags)
    ? [
        ...new Set(
          tags.map((tag) => String(tag).split("/").map(canonicalSegment).filter(Boolean).join("/")),
        ),
      ].filter((tag) => tag !== "")
    : tags

export const manifest = {
  name: "tag-normalize",
  displayName: "Tag Normalize",
  description: "Treat casing, whitespace and underscore variants of a tag as the same tag.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
}

export const transformer = () => ({
  name: "TagNormalize",
  markdownPlugins() {
    return [
      () => (_tree, file) => {
        const frontmatter = file.data?.frontmatter
        if (frontmatter && Array.isArray(frontmatter.tags)) {
          frontmatter.tags = canonicalize(frontmatter.tags)
        }

        // note-properties has already collected the properties view's copy by
        // the time this runs; keep it consistent in case a page opts back in
        // with `quartz-properties: true`.
        const properties = file.data?.noteProperties?.properties
        if (properties && Array.isArray(properties.tags)) {
          properties.tags = canonicalize(properties.tags)
        }
      },
    ]
  },
})
