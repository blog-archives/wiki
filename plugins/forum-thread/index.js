// Forum-thread ("楼中楼") markdown syntax.
//
// A block of consecutive lines becomes a forum thread. A question opens a floor
// with `|>` and its answers follow with `|`; a deeper line becomes a sub-floor
// of the question above it:
//
//   |> 父问题，支持 **加粗**、[链接](https://example.com) 与 `代码`
//   | 父问题的回答
//   |> 对回答的追问           <- 顶格，与父楼同层
//   | 追问的回答
//     |> 更深一层的追问       <- 缩进两格，成为「楼中楼」
//     | 更深一层追问的回答
//
// Depth is the leading indentation plus the extra bar count: `|` is the base
// marker, two spaces of indentation add one level, and `||` also adds a level.
// The shallowest line in a block is normalised to depth 0.
//
// The first question of a floor becomes its title. The answer lines stay
// visible under it, and when the floor has deeper sub-floors a small
// checkbox + chevron at the right edge of the question collapses just those
// sub-floors. The checkbox is the switch, so no JavaScript is involved.
// Markdown strips a paragraph's leading indentation before the mdast exists, so
// the remark plugin reads the indentation back from the raw source lines the
// paragraph spans; the bars, role and inline body still come from the mdast,
// keeping inline Markdown parsing intact.

import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const STYLES = fsSync.readFileSync(path.join(here, "styles.css"), "utf-8")

const defaults = {
  // One character repeated at the start of a line marks the base level.
  bar: ["|", "｜", "│"],
  // Written right after the bars, it marks the line as a question.
  question: [">", "＞"],
  // Leading spaces per nesting level; a tab counts as one level.
  indentSize: 2,
  // Wrap a question and its content in a <details> toggle (open by default).
  collapsible: true,
}

const ANSWER_CLASS = "forum-post-a"

const asArray = (value) => (Array.isArray(value) ? value : [value])
const isSpace = (char) => char === " " || char === "\t"

function symbolList(value, name) {
  const symbols = asArray(value)
  if (symbols.some((symbol) => typeof symbol !== "string" || symbol.length === 0)) {
    throw new Error(`ForumThread: ${name} must be a symbol or an array of symbols`)
  }
  return symbols
}

function configuration(options) {
  const config = { ...defaults, ...options }
  const bar = symbolList(config.bar, "bar")
  if (bar.length === 0) throw new Error("ForumThread: bar must not be empty")
  if (new Set(bar).size !== bar.length) throw new Error("ForumThread: bar symbols must be unique")
  const question = symbolList(config.question, "question")
  if (question.length === 0) throw new Error("ForumThread: question must not be empty")
  if (!Number.isInteger(config.indentSize) || config.indentSize < 1) {
    throw new Error("ForumThread: indentSize must be a positive integer")
  }
  if (typeof config.collapsible !== "boolean") {
    throw new Error("ForumThread: collapsible must be a boolean")
  }
  return {
    barSet: new Set(bar),
    questionSet: new Set(question),
    indentSize: config.indentSize,
    collapsible: config.collapsible,
  }
}

// Width of the paragraph indentation the Markdown parser dropped, measured in
// spaces; a tab counts as one level.
function leadingWidth(line, config) {
  let width = 0
  for (const char of line) {
    if (char === " ") width++
    else if (char === "\t") width += config.indentSize
    else break
  }
  return width
}

// Turns one line into `{ spaces, bars, role, body }`, or null when the line
// does not start with a bar run. `rawLine` is the same physical line before the
// parser stripped its indentation; the prefix itself lives in the first mdast
// text node.
function parseLine(nodes, rawLine, config) {
  const head = nodes[0]
  if (!head || head.type !== "text") return null
  const value = head.value

  let pos = 0
  while (pos < value.length && isSpace(value[pos])) pos++
  let bars = 0
  while (pos < value.length && config.barSet.has(value[pos])) {
    bars++
    pos++
  }
  if (bars === 0) return null

  const isQuestion = config.questionSet.has(value[pos])
  if (isQuestion) pos++
  while (pos < value.length && isSpace(value[pos])) pos++

  const text = value.slice(pos)
  const body = text ? [{ type: "text", value: text }] : []
  return {
    spaces: leadingWidth(rawLine ?? "", config),
    bars,
    role: isQuestion ? "question" : "answer",
    body: body.concat(nodes.slice(1)),
  }
}

// Splits a paragraph's inline children on soft/hard line breaks. Soft breaks
// arrive as `\n` inside text nodes; `break` nodes are explicit hard breaks.
function splitLines(nodes) {
  const lines = [[]]
  for (const node of nodes) {
    if (node.type === "text") {
      const parts = node.value.split("\n")
      parts.forEach((part, index) => {
        if (index > 0) lines.push([])
        if (part.length > 0) lines[lines.length - 1].push({ type: "text", value: part })
      })
    } else if (node.type === "break") {
      lines.push([])
    } else {
      lines[lines.length - 1].push(node)
    }
  }
  return lines.filter((line) => line.length > 0)
}

// Returns the parsed lines with a normalised `depth` when the node is a top
// level paragraph whose every line follows the syntax and the block carries
// some structure, otherwise null. A bare `| 普通文字` paragraph is left alone.
function blockLines(node, sourceLines, config) {
  if (node.type !== "paragraph" || !node.position) return null
  const lines = splitLines(node.children)
  if (lines.length === 0) return null
  const firstLine = node.position.start.line - 1
  const rawLines = sourceLines.slice(firstLine, firstLine + lines.length)
  if (rawLines.length !== lines.length) return null

  const parsed = lines.map((line, index) => parseLine(line, rawLines[index], config))
  if (parsed.some((line) => line === null)) return null

  const levels = parsed.map((line) => Math.floor(line.spaces / config.indentSize) + (line.bars - 1))
  const shallowest = Math.min(...levels)
  if (!parsed.some((line) => line.role === "question") && !levels.some((level) => level > shallowest)) {
    return null
  }
  parsed.forEach((line, index) => {
    line.depth = levels[index] - shallowest
  })
  return parsed
}

// Groups lines into floors: a question starts one, following answers at the
// same depth join it, and a deeper line starts a floor nested inside it.
function groupFloors(lines) {
  const roots = []
  const stack = []
  let openDepth = null
  for (const line of lines) {
    const top = stack[stack.length - 1]
    if (line.role === "answer" && line.depth === openDepth && top && top.depth === openDepth) {
      top.rows.push(line)
      continue
    }
    while (stack.length > 0 && stack[stack.length - 1].depth >= line.depth) stack.pop()
    const floor = { depth: line.depth, rows: [line], children: [] }
    if (stack.length > 0) stack[stack.length - 1].children.push(floor)
    else roots.push(floor)
    stack.push(floor)
    openDepth = line.depth
  }
  return roots
}

const blockElement = (hName, className, children, extra = {}) => ({
  type: "blockquote",
  data: { hName, hProperties: { className: asArray(className), ...extra } },
  children,
})

const inlineElement = (hName, className, children, extra = {}) => ({
  type: "paragraph",
  data: { hName, hProperties: { className: asArray(className), ...extra } },
  children,
})

// A void element (no children). The checkbox class is left off on purpose:
// Quartz's Obsidian transformer rewrites checkbox classes, so the stylesheet
// targets `.forum-chevron input` structurally instead.
const voidElement = (hName, extra = {}) => ({
  type: "paragraph",
  data: { hName, hProperties: { ...extra } },
  children: [],
})

function renderAnswer(nodes) {
  const content = inlineElement(
    "div",
    "forum-post-content",
    nodes.length > 0 ? nodes : [{ type: "text", value: "" }],
  )
  return blockElement("div", ["forum-post", ANSWER_CLASS], [content])
}

// A floor's first question becomes its title. When the floor has sub-floors, a
// checkbox + chevron at the right edge of the title toggles just those
// sub-floors; the answers always stay visible. The checkbox is the CSS-only
// switch, so no JavaScript is involved.
function renderFloor(floor, config) {
  const parts = []
  const hasChildren = floor.children.length > 0
  const first = floor.rows[0]
  let answers = floor.rows

  if (first.role === "question") {
    const title = [
      inlineElement("span", "forum-title-text", first.body.length > 0 ? first.body : [{ type: "text", value: "" }]),
    ]
    if (config.collapsible && hasChildren) {
      title.push(
        inlineElement("label", "forum-chevron", [
          voidElement("input", { type: "checkbox", checked: true, ariaLabel: "收起或展开追问" }),
        ]),
      )
    }
    parts.push(blockElement("div", "forum-floor-title", title))
    answers = floor.rows.slice(1)
  }

  // Consecutive answer lines are one answer with line breaks, not separate
  // posts.
  const content = []
  if (answers.length > 0) {
    const nodes = []
    answers.forEach((row, index) => {
      if (index > 0) nodes.push({ type: "break" })
      nodes.push(...row.body)
    })
    content.push(renderAnswer(nodes))
  }
  if (hasChildren) {
    content.push(
      blockElement(
        "div",
        "forum-subfloors",
        floor.children.map((child) => renderFloor(child, config)),
      ),
    )
  }
  if (content.length > 0) {
    parts.push(blockElement("div", "forum-floor-content", content))
  }

  return blockElement("div", "forum-floor", parts, { "data-depth": String(floor.depth) })
}

function buildThread(lines, config) {
  const floors = groupFloors(lines)
  const maxDepth = Math.max(...lines.map((line) => line.depth))
  return blockElement("div", "forum-thread", floors.map((floor) => renderFloor(floor, config)), {
    "data-max-depth": String(maxDepth),
  })
}

// Replaces every top level paragraph that matches the syntax with the rendered
// thread. Top level only: a paragraph nested in a list or quote would shift its
// raw indentation.
function transformTree(tree, source, config) {
  if (!Array.isArray(tree.children)) return
  const sourceLines = source.split(/\r?\n/)
  tree.children = tree.children.map((child) => {
    const lines = blockLines(child, sourceLines, config)
    return lines ? buildThread(lines, config) : child
  })
}

export const transformer = (options = {}) => {
  const config = configuration(options)
  return {
    name: "ForumThread",
    markdownPlugins() {
      return [() => (tree, file) => transformTree(tree, String(file?.value ?? ""), config)]
    },
    externalResources() {
      return { css: [{ content: STYLES, inline: true }] }
    },
  }
}

export const manifest = {
  name: "forum-thread",
  displayName: "Forum Thread",
  description: "Render a |>/| Q/A block as forum floors; a question's chevron collapses only its sub-floors.",
  version: "5.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
  defaultOptions: {
    bar: defaults.bar,
    question: defaults.question,
    indentSize: defaults.indentSize,
    collapsible: defaults.collapsible,
  },
}
