import test from "node:test"
import assert from "node:assert/strict"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { transformer } from "./index.js"

async function render(markdown, options) {
  const plugin = transformer(options)
  const tree = unified().use(remarkParse).parse(markdown)
  for (const md of plugin.markdownPlugins({})) md()(tree, { value: markdown })
  return unified().use(remarkRehype).run(tree)
}

const walk = (node, visit) => {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
const hasClass = (node, className) => node?.properties?.className?.includes(className)
const all = (tree, className) => {
  const found = []
  walk(tree, (node) => {
    if (hasClass(node, className)) found.push(node)
  })
  return found
}
const childrenOf = (parent, className) => (parent.children ?? []).filter((node) => hasClass(node, className))
const inputsOf = (node) => {
  const found = []
  walk(node, (child) => {
    if (child.tagName === "input") found.push(child)
  })
  return found
}
const titleOf = (floor) => childrenOf(floor, "forum-floor-title")[0]
const contentOf = (floor) => childrenOf(floor, "forum-floor-content")[0]
const answersOf = (floor) => childrenOf(contentOf(floor), "forum-post-a")
const subfloorsOf = (floor) => childrenOf(contentOf(floor), "forum-subfloors")[0]
const text = (node) => {
  let value = ""
  walk(node, (child) => {
    if (child.type === "text") value += child.value
  })
  return value
}
const depths = (tree) => all(tree, "forum-floor").map((floor) => floor.properties["data-depth"])

test("puts a question and its answer in one floor", async () => {
  const tree = await render(["|> 父问题 **加粗**", "| 父回答 [链接](https://example.com)"].join("\n"))
  const floors = all(tree, "forum-floor")
  assert.equal(floors.length, 1)
  assert.match(text(titleOf(floors[0])), /父问题/)
  assert.equal(answersOf(floors[0]).length, 1)
  assert.equal(inputsOf(tree).length, 0, "no toggle without sub-floors")
  const json = JSON.stringify(floors[0])
  assert.ok(json.includes('"tagName":"strong"'), "bold should survive")
  assert.ok(json.includes('"tagName":"a"'), "link should survive")
})

test("collapses only the sub-floors, never the answers", async () => {
  const tree = await render(["|> 问题", "| 答案", "  |> 一层", "  | 一层答案"].join("\n"))
  assert.deepEqual(depths(tree), ["0", "1"])
  const [root, nested] = all(tree, "forum-floor")
  // The answer is a direct child of the content, outside the collapsible box.
  assert.equal(answersOf(root).length, 1)
  const subfloors = subfloorsOf(root)
  assert.ok(subfloors, "expected a sub-floors group")
  assert.deepEqual(childrenOf(subfloors, "forum-floor"), [nested])
  // Exactly one toggle, checked (open) by default.
  assert.equal(inputsOf(root).length, 1)
  assert.equal(inputsOf(root)[0].properties.checked, true)
  assert.equal(all(root, "forum-chevron").length, 1)
  // The nested floor has no sub-floors of its own, so no toggle.
  assert.equal(inputsOf(nested).length, 0)
})

test("reads depth from repeated indentation and from extra bars", async () => {
  const indented = await render(
    ["|> 根", "| 答", "  |> 一层", "  | 一层答", "    |> 二层", "    | 二层答"].join("\n"),
  )
  assert.deepEqual(depths(indented), ["0", "1", "2"])

  const barred = await render(["|> 问题一", "| 答案一", "||> 追问", "|| 回答", "|||> 更深"].join("\n"))
  assert.deepEqual(depths(barred), ["0", "1", "2"])
})

test("merges consecutive answer lines into one wrapping answer", async () => {
  const tree = await render(["|> Q1", "| A1", "| A1b"].join("\n"))
  const answers = answersOf(all(tree, "forum-floor")[0])
  assert.equal(answers.length, 1)
  assert.ok(JSON.stringify(answers[0]).includes('"tagName":"br"'), "answer lines should break")
  assert.match(text(answers[0]), /A1/)
  assert.match(text(answers[0]), /A1b/)
})

test("keeps a question with nothing under it as a bare title", async () => {
  const tree = await render("|> 只有问题")
  const floor = all(tree, "forum-floor")[0]
  assert.match(text(titleOf(floor)), /只有问题/)
  assert.equal(all(tree, "forum-floor-content").length, 0)
  assert.equal(inputsOf(tree).length, 0)
})

test("leaves ordinary paragraphs and a lone bar line untouched", async () => {
  for (const markdown of ["普通一段话。", "| 孤立的一行", "前置说明 | 中间竖线 | 后置"]) {
    const tree = await render(markdown)
    assert.equal(all(tree, "forum-thread").length, 0, markdown)
  }
})

test("honours custom symbols, indent size and collapsible", async () => {
  const tree = await render(["!? 问题", "! 回答", "    !? 一层"].join("\n"), {
    bar: "!",
    question: "?",
    indentSize: 4,
    collapsible: false,
  })
  assert.deepEqual(depths(tree), ["0", "1"])
  assert.equal(inputsOf(tree).length, 0, "collapsible off means no toggle")
  assert.ok(subfloorsOf(all(tree, "forum-floor")[0]), "sub-floors still render")
})

test("rejects invalid options", () => {
  assert.throws(() => transformer({ bar: [] }), /bar/)
  assert.throws(() => transformer({ bar: ["|", "|"] }), /unique/)
  assert.throws(() => transformer({ question: [] }), /question/)
  assert.throws(() => transformer({ indentSize: 0 }), /indentSize/)
  assert.throws(() => transformer({ collapsible: "yes" }), /collapsible/)
})
