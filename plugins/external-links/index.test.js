import test from "node:test"
import assert from "node:assert/strict"
import { transformer } from "./index.js"

const node = (tagName, children = [], properties = {}) => ({
  type: "element",
  tagName,
  properties,
  children,
})
const text = (value) => ({ type: "text", value })
const link = (href = "https://github.com/example/repo") =>
  node("a", [text("Project"), node("svg", [], { class: "external-icon" })], {
    href,
    className: ["external"],
    target: "_blank",
  })
const siteLink = (href = "../other") =>
  node("a", [text("Page")], { href, className: ["internal", "internal-link"] })
function run(tree, options = {}) {
  const plugin = transformer(options)
  plugin.htmlPlugins({ cfg: { configuration: { baseUrl: "wiki.lllllan.cn" } } })[0]()(tree)
  return tree
}
const all = (tree) => [tree, ...(tree.children ?? []).flatMap(all)]

test("decorates external text once, replaces stock arrow and preserves markup", () => {
  const anchor = link()
  anchor.children.unshift(node("em", [text("Read ")]))
  const tree = node("p", [anchor])
  run(tree)
  const first = structuredClone(tree)
  run(tree)
  assert.deepEqual(tree, first)
  assert.ok(anchor.properties.className.includes("el-pill"))
  assert.equal(all(tree).filter((n) => n.properties?.className?.includes("el-arrow")).length, 1)
  assert.ok(all(tree).some((n) => n.tagName === "em"))
  assert.ok(anchor.properties.rel.includes("noopener"))
})

test("styles site links as pills with a line-symbol logo but no arrow or domain", () => {
  const anchor = siteLink()
  const tree = node("p", [text("见 "), anchor, text(" 页")])
  run(tree)
  const first = structuredClone(tree)
  run(tree)
  assert.deepEqual(tree, first)
  assert.ok(anchor.properties.className.includes("el-pill"))
  assert.ok(anchor.properties.className.includes("el-internal"))
  assert.ok(anchor.properties.className.includes("internal"))
  const svgs = all(anchor).filter((n) => n.tagName === "svg")
  assert.equal(svgs.length, 1)
  assert.equal(svgs[0].properties.className.includes("el-symbol"), true)
  assert.ok(!all(anchor).some((n) => n.tagName === "img"))
  assert.ok(!all(anchor).some((n) => n.properties?.className?.includes?.("el-arrow")))
  assert.ok(!all(anchor).some((n) => n.properties?.className?.includes?.("el-domain")))
})

test("site-link logo accepts built-in names, custom paths and none", () => {
  const named = siteLink()
  run(node("p", [named]), { internalLogo: "hash" })
  assert.ok(all(named).some((n) => n.tagName === "svg"))

  const custom = siteLink()
  run(node("p", [custom]), { internalLogo: ["M4 4h16v16H4z"] })
  const customSvg = all(custom).find((n) => n.tagName === "svg")
  assert.equal(customSvg.children[0].properties.d, "M4 4h16v16H4z")

  const bare = siteLink()
  run(node("p", [bare]), { internalLogo: "none" })
  assert.equal(all(bare).filter((n) => n.tagName === "svg").length, 0)

  assert.throws(() => transformer({ internalLogo: "nope" }), /internalLogo/)
  assert.throws(() => transformer({ internalLogo: [123] }), /internalLogo/)
})

test("site links can be left untouched", () => {
  const anchor = siteLink()
  const before = structuredClone(anchor)
  run(node("p", [anchor]), { internal: false })
  assert.deepEqual(anchor, before)
})

test("ignores same-host, special protocols, anchors and image links", () => {
  for (const href of [
    "#section",
    "https://wiki.lllllan.cn/page",
    "mailto:a@b.com",
    "javascript:alert(1)",
    "tel:+123",
    "https://[",
  ]) {
    const anchor = link(href)
    const before = structuredClone(anchor)
    run(node("p", [anchor]))
    assert.deepEqual(anchor, before)
  }
  const image = node("a", [node("img", [], { src: "test.png" })], { href: "https://example.com" })
  const before = structuredClone(image)
  run(node("p", [image]))
  assert.deepEqual(image, before)
})

test("block style applies only to links alone in a paragraph", () => {
  for (const style of ["card", "list"]) {
    const standalone = link(),
      inline = link()
    run(node("div", [node("p", [text("\n"), standalone]), node("p", [text("See "), inline])]), {
      standaloneStyle: style,
    })
    assert.ok(standalone.properties.className.includes(`el-${style}`))
    assert.ok(inline.properties.className.includes("el-pill"))
    assert.ok(all(standalone).some((n) => n.value === "github.com"))
  }
})

test("all style and arrow combinations; no-logo mode has no image requests or client script", () => {
  for (const style of ["text", "tag", "pill"])
    for (const arrow of ["diagonal", "external", "chevron", "none"]) {
      const anchor = link()
      run(node("p", [anchor]), { style, arrow, logo: "none" })
      assert.ok(anchor.properties.className.includes(`el-${style}`))
      assert.equal(all(anchor).filter((n) => n.tagName === "svg").length, arrow === "none" ? 0 : 1)
      assert.ok(!all(anchor).some((n) => n.tagName === "img"))
    }
  assert.equal(transformer({ logo: "none" }).externalResources().js.length, 0)
})

test("favicon overrides use exact hostname; fallback excludes paths and queries", () => {
  const anchor = link("https://example.com/path?token=private")
  run(node("p", [anchor]))
  assert.equal(
    all(anchor).find((n) => n.tagName === "img").properties.src,
    "https://example.com/favicon.ico",
  )
  const custom = link()
  run(node("p", [custom]), { icons: { "github.com": "/static/github.svg" } })
  assert.equal(all(custom).find((n) => n.tagName === "img").properties.src, "/static/github.svg")
  assert.throws(() => transformer({ style: "typo" }), /style/)
  assert.throws(() => transformer({ icons: { "github.com": "javascript:alert(1)" } }), /icon URLs/)
})
