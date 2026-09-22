#!/usr/bin/env node
// Pangu-style Markdown formatter for the wiki.
//
// Three jobs, all conservative:
//   1. Pangu spacing — insert a space between CJK and half-width Latin letters
//      or digits ("中文abc" -> "中文 abc").
//   2. Emphasis spacing — a `**` touching CJK gets a space on its outer side
//      ("我要**加粗**文本" -> "我要 **加粗** 文本"), which also repairs the
//      CommonMark flanking failure that makes "是**「x」**" render literally.
//   3. Safe layout — trim trailing whitespace, collapse runs of blank lines,
//      put exactly one blank line around headings / fences / tables / quotes /
//      lists, normalize heading, blockquote and list-marker spacing, and end
//      the file with a single newline.
//
// Never touches YAML frontmatter, fenced code, inline code, link destinations,
// bare URLs, autolinks or reference definitions. `*` is intentionally left as a
// list marker (too ambiguous with emphasis). The transform is idempotent.
//
// Usage:
//   node scripts/format-markdown.mjs [paths...] [--check] [--dry-run] [--quiet]
//
// Defaults to `wiki`. `--check` reports files that would change and exits 1.

import fs from "node:fs"
import path from "node:path"

const CJK =
  "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u3040-\\u30ff\\uac00-\\ud7af"
const LATIN =
  "A-Za-z0-9\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u024f"
const RE_CJK_LATIN = new RegExp(`([${CJK}])([${LATIN}])`, "g")
const RE_LATIN_CJK = new RegExp(`([${LATIN}])([${CJK}])`, "g")

const RE_FENCE = /^\s*(`{3,}|~{3,})/
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/
const RE_HEADING = /^(#{1,6})[ \t]*(\S.*?)?[ \t]*$/
const RE_QUOTE = /^((?:[ \t]*>)+)[ \t]*(.*)$/
const RE_TABLE = /^\s*\|/
const RE_REF_DEF = /^\s*\[[^\]]+\]:\s*\S/

function isHeading(line) {
  if (!RE_HEADING.test(line)) return false
  // A lone `#word` is an Obsidian inline tag, not a heading.
  return !/^#[^#\s]/.test(line)
}

function isList(line) {
  if (RE_HR.test(line)) return false
  if (/^\s*[-+][ \t]*\S/.test(line)) return true
  if (/^\s*[-+]\S/.test(line) && !/^\s*--/.test(line)) return true
  return /^\s*\d+[.)](?![0-9])/.test(line)
}

function pangu(text) {
  return text.replace(RE_CJK_LATIN, "$1 $2").replace(RE_LATIN_CJK, "$1 $2")
}

// Emphasis and CJK do not mix without a space. Two things go wrong:
//   1. Convention — pangu spacing puts a space between CJK and half-width
//      tokens, so `**` should be spaced too: "我要**加粗**文本" reads as
//      "我要 **加粗** 文本".
//   2. Rendering — CommonMark only lets a delimiter open/close emphasis when it
//      is "flanking": an opener must not be followed by whitespace and, if
//      followed by punctuation, must be preceded by whitespace or punctuation;
//      a closer is the mirror image. A `**` wedged between a CJK word character
//      and CJK punctuation ("是**「x」**") fails that test and the bold silently
//      disappears. The space from rule 1 also fixes this.
// So: put a space on the outside of every delimiter that touches a CJK
// character, and additionally whenever the delimiter could not otherwise be
// flanking (e.g. Latin word + CJK punctuation).
const RE_PUNCT = /\p{P}/u
const RE_CJK_CHAR = new RegExp(`[${CJK}]`)

const isPunct = (ch) => ch !== undefined && RE_PUNCT.test(ch)
const isSpace = (ch) => ch === undefined || /\s/.test(ch)
const isCJK = (ch) => ch !== undefined && RE_CJK_CHAR.test(ch)

function spaceEmphasis(line) {
  const positions = []
  const re = /\*\*/g
  let match
  while ((match = re.exec(line)) !== null) positions.push(match.index)
  // An odd number of delimiters is ambiguous; leave the line alone.
  if (positions.length === 0 || positions.length % 2 !== 0) return line

  const insertAt = new Set()
  for (let i = 0; i < positions.length; i += 2) {
    const open = positions[i]
    const close = positions[i + 1]
    const content = line.slice(open + 2, close)
    if (content.length === 0) continue

    const before = open > 0 ? line[open - 1] : undefined
    const after = close + 2 < line.length ? line[close + 2] : undefined
    const first = content[0]
    const last = content[content.length - 1]

    const canOpen =
      !isSpace(first) && (!isPunct(first) || isSpace(before) || isPunct(before))
    if (!isSpace(before) && (isCJK(before) || !canOpen)) insertAt.add(open)

    const canClose =
      !isSpace(last) && (!isPunct(last) || isSpace(after) || isPunct(after))
    if (!isSpace(after) && (isCJK(after) || !canClose)) insertAt.add(close + 2)
  }

  if (insertAt.size === 0) return line
  let out = ""
  for (let i = 0; i < line.length; i++) {
    if (insertAt.has(i)) out += " "
    out += line[i]
  }
  if (insertAt.has(line.length)) out += " "
  return out
}

// Replace protected substrings with sentinels so pangu cannot reach them.
function mask(line) {
  const spans = []
  const hide = (re) => {
    line = line.replace(re, (m) => `\u0000${spans.push(m) - 1}\u0000`)
  }
  hide(/(`+)[\s\S]*?\1/g)
  hide(/\]\([^)\n]*\)/g)
  hide(/<[^>\n]+>/g)
  hide(/https?:\/\/[^\s)\]]+/g)
  return { line, spans }
}

function unmask(line, spans) {
  return line.replace(/\u0000(\d+)\u0000/g, (_, i) => spans[Number(i)])
}

function transformLine(line) {
  let out = line.replace(/[ \t]+$/, "")
  if (isHeading(out)) {
    out = out.replace(RE_HEADING, (m, hashes, text) =>
      text ? `${hashes} ${text}` : hashes,
    )
  }
  out = out.replace(RE_QUOTE, (m, marks, rest) =>
    rest ? `${marks} ${rest}` : marks,
  )
  if (isList(out)) {
    out = out
      .replace(/^(\s*[-+])[ \t]*(\S)/, "$1 $2")
      .replace(/^(\s*\d+[.)])[ \t]*([^\s\d])/, "$1 $2")
  }
  if (RE_REF_DEF.test(out)) return out
  const { line: hidden, spans } = mask(out)
  return unmask(spaceEmphasis(pangu(hidden)), spans)
}

function typeOf(line, state) {
  if (state.inFence) {
    if (RE_FENCE.test(line)) state.inFence = false
    return "code"
  }
  if (RE_FENCE.test(line)) {
    state.inFence = true
    return "fence"
  }
  if (line.trim() === "") return "blank"
  if (isHeading(line)) return "heading"
  if (RE_TABLE.test(line)) return "table"
  if (RE_QUOTE.test(line)) return "quote"
  if (RE_HR.test(line)) return "hr"
  if (isList(line)) return "list"
  return "text"
}

const BEFORE_BLOCK = new Set(["heading", "fence", "table", "quote", "hr"])
const AFTER_BLOCK = new Set(["heading", "fence", "table", "quote", "hr", "list"])

function needsBlank(prev, cur) {
  if (!prev || !cur || cur === "blank" || cur === "frontmatter") return false
  if (cur === "code" || prev === "code") return false
  if (prev === cur && (prev === "quote" || prev === "table" || prev === "list")) {
    return false
  }
  if (prev === "frontmatter") return true
  if (AFTER_BLOCK.has(prev) && prev !== "list") return true
  if (prev === "list" && cur !== "list") return true
  if (BEFORE_BLOCK.has(cur)) return true
  if (cur === "list" && prev !== "list") return true
  return false
}

function transform(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  while (lines.length > 0 && lines[0].trim() === "") lines.shift()

  let frontmatterEnd = -1
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        frontmatterEnd = i
        break
      }
    }
  }

  const typed = []
  const state = { inFence: false }
  for (let i = 0; i < lines.length; i++) {
    if (i <= frontmatterEnd) {
      typed.push({ type: "frontmatter", text: lines[i].replace(/[ \t]+$/, "") })
      continue
    }
    const type = typeOf(lines[i], state)
    const text = type === "code" ? lines[i] : transformLine(lines[i])
    typed.push({ type, text })
  }

  const out = []
  for (const node of typed) {
    if (node.type === "blank") {
      if (out.length > 0 && out[out.length - 1].type !== "blank") {
        out.push({ type: "blank", text: "" })
      }
      continue
    }
    const prev = out[out.length - 1]
    if (needsBlank(prev?.type, node.type) && prev.type !== "blank") {
      out.push({ type: "blank", text: "" })
    }
    out.push(node)
  }
  while (out.length > 0 && out[out.length - 1].type === "blank") out.pop()

  return out.map((n) => n.text).join("\n") + "\n"
}

function collectFiles(target) {
  const stat = fs.statSync(target)
  if (stat.isFile()) return target.endsWith(".md") ? [target] : []
  const found = []
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) found.push(...collectFiles(full))
    else if (entry.isFile() && entry.name.endsWith(".md")) found.push(full)
  }
  return found
}

function unifiedDiff(before, after, file) {
  const a = before.split("\n")
  const b = after.split("\n")
  const lines = [`--- ${file}`, `+++ ${file}`]
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) lines.push(`-${a[i]}`)
      if (b[i] !== undefined) lines.push(`+${b[i]}`)
    }
  }
  return lines.join("\n")
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")))
  const targets = argv.filter((a) => !a.startsWith("--"))
  const check = flags.has("--check")
  const dryRun = flags.has("--dry-run")
  const quiet = flags.has("--quiet")
  const roots = targets.length > 0 ? targets : ["wiki"]

  const files = []
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      console.error(`skip: ${root} (not found)`)
      process.exitCode = 2
      continue
    }
    files.push(...collectFiles(root))
  }

  let changed = 0
  for (const file of files) {
    const before = fs.readFileSync(file, "utf8")
    const after = transform(before)
    if (before === after) continue
    changed++
    if (check) {
      if (!quiet) console.log(file)
    } else if (dryRun) {
      if (!quiet) console.log(unifiedDiff(before, after, file))
    } else {
      fs.writeFileSync(file, after)
      if (!quiet) console.log(`formatted ${file}`)
    }
  }

  if (!quiet) {
    const verb = check ? "would change" : dryRun ? "would change" : "formatted"
    console.log(`${changed} of ${files.length} file(s) ${verb}`)
  }
  if (check && changed > 0) process.exitCode = 1
}

main(process.argv.slice(2))
