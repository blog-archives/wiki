// Build-time previews for external links.
//
// Quartz's built-in popover only handles internal links: it fetches the target
// page same-origin and reads a `.popover-hint` element, neither of which works
// for `a.external-link` (CORS blocks the fetch; external pages lack the hint).
//
// This emitter walks every rendered page, collects the external URLs, fetches
// their content once at build time (Node, no CORS), and writes the result to
// `static/external-previews.json`. GitHub blob links resolve to the exact
// referenced lines via raw.githubusercontent.com; everything else is reduced to
// a readable block list. A small client script (client.js) renders it on hover.
//
// `parse5` comes from Quartz's own rehype stack (see the root lockfile); the
// vendored package.json cannot take a direct dependency, so this plugin relies
// on the transitive install.

import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "parse5"

const here = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_SCRIPT = fsSync.readFileSync(path.join(here, "client.js"), "utf-8")
const CACHE_FILE = path.join(".quartz-cache", "external-link-preview.json")

const CONTENT_MAX_CHARS = 3000
const CONTENT_MAX_BLOCKS = 60
const CODE_MAX_LINES = 30
const DROP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "template",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "iframe",
  "details",
])
const BLOCK_KINDS = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  p: "paragraph",
  li: "list",
  pre: "code",
  blockquote: "quote",
}

export const manifest = {
  name: "external-link-preview",
  displayName: "External Link Preview",
  description:
    "Prefetch external link content at build time and show it in hover previews; GitHub directories preview their README.",
  version: "1.2.0",
  category: "emitter",
  quartzVersion: ">=5.0.0",
  defaultOptions: {
    timeoutMs: 8000,
    concurrency: 6,
    cacheTtlHours: 168,
    maxDescriptionLength: 280,
    userAgent: "Mozilla/5.0 (compatible; quartz-external-link-preview/1.1)",
  },
}

export const emitter = (userOptions = {}) => {
  const options = { ...manifest.defaultOptions, ...userOptions }

  return {
    name: "ExternalLinkPreview",
    externalResources() {
      return {
        js: [{ loadTime: "afterDOMReady", contentType: "inline", script: CLIENT_SCRIPT }],
      }
    },
    emit(ctx, content) {
      return emitPreviews(ctx, content, options)
    },
    partialEmit(ctx, content) {
      return emitPreviews(ctx, content, options)
    },
  }
}

async function emitPreviews(ctx, content, options) {
  const urls = collectExternalUrls(content)
  if (urls.size === 0) return []

  const cachePath = path.join(process.cwd(), CACHE_FILE)
  const cache = await loadCache(cachePath)
  const now = Date.now()
  const { previews, pending } = partitionByCache(urls, cache, options.cacheTtlHours, now)
  const runOptions = { ...options, rawMemo: new Map() }

  await runPool(pending, options.concurrency, async (url) => {
    const preview = await fetchPreview(url, runOptions)
    if (preview) {
      previews[url] = preview
      cache[url] = { fetchedAt: now, preview }
    } else if (cache[url] && cache[url].preview) {
      previews[url] = cache[url].preview
    }
  })

  await saveCache(cachePath, cache)
  return writePreviews(ctx.argv.output, previews)
}

function partitionByCache(urls, cache, ttlHours, now) {
  const ttlMs = ttlHours * 60 * 60 * 1000
  const previews = {}
  const pending = []
  for (const url of urls) {
    const cached = cache[url]
    if (cached && cached.preview && now - cached.fetchedAt < ttlMs) {
      previews[url] = cached.preview
    } else {
      pending.push(url)
    }
  }
  return { previews, pending }
}

async function writePreviews(outputDir, previews) {
  const staticDir = path.join(outputDir, "static")
  await fs.mkdir(staticDir, { recursive: true })
  const outPath = path.join(staticDir, "external-previews.json")
  await fs.writeFile(outPath, JSON.stringify(previews))
  return [outPath]
}

function collectExternalUrls(content) {
  const urls = new Set()
  for (const entry of content) {
    const tree = Array.isArray(entry) ? entry[0] : entry && entry.tree
    walk(tree, (node) => {
      if (node.tagName !== "a") return
      const props = node.properties ?? {}
      if (isExternal(props.className) && typeof props.href === "string") {
        const absolute = absoluteUrl(props.href)
        if (absolute) urls.add(absolute)
      }
    })
  }
  return urls
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return
  if (node.type === "element") visit(node)
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, visit)
  }
}

function isExternal(className) {
  if (Array.isArray(className)) {
    return className.includes("external-link") || className.includes("external")
  }
  return typeof className === "string" && /(^|\s)external(-link)?(\s|$)/.test(className)
}

// Keys the runtime lookup in client.js: both sides keep the fragment, because
// GitHub code links encode the referenced line range in it.
function absoluteUrl(href) {
  try {
    const url = new URL(href)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

async function fetchPreview(url, options) {
  const github = parseGitHubBlob(url)
  if (github) return fetchGitHubPreview(github, options)
  const tree = parseGitHubTree(url)
  if (tree) return fetchGitHubTreePreview(tree, options)
  return fetchPagePreview(url, options)
}

function parseGitHubBlob(url) {
  const match = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(?:\?.*)?(?:#.*)?$/,
  )
  if (!match) return null
  const [, owner, repo, ref, filePath] = match
  const fragment = url.includes("#") ? url.slice(url.indexOf("#") + 1) : ""
  const range = fragment.match(/L(\d+)(?:-L?(\d+))?/)
  return {
    owner,
    repo,
    ref,
    filePath,
    startLine: range ? Number(range[1]) : undefined,
    endLine: range ? Number(range[2] ?? range[1]) : undefined,
  }
}

function parseGitHubTree(url) {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/?#]+)(?:\/([^?#]+))?/)
  if (!match) return null
  const [, owner, repo, ref, rawPath] = match
  const filePath = rawPath ? rawPath.replace(/\/+$/, "") : ""
  return { owner, repo, ref, filePath }
}

async function fetchGitHubPreview(blob, options) {
  const rawUrl = `https://raw.githubusercontent.com/${blob.owner}/${blob.repo}/${blob.ref}/${blob.filePath}`
  const text = await fetchMemoizedText(rawUrl, options)
  if (text === null) return null

  const lines = text.split("\n")
  const start = blob.startLine ?? 1
  const end = blob.endLine ?? Math.min(lines.length, start + CODE_MAX_LINES - 1)
  return {
    title: `${blob.filePath} · ${blob.owner}/${blob.repo}`,
    siteName: "GitHub",
    url: `https://github.com/${blob.owner}/${blob.repo}/blob/${blob.ref}/${blob.filePath}`,
    code: { text: lines.slice(start - 1, end).join("\n"), startLine: start },
  }
}

// A GitHub directory page renders its README client-side, so the HTML we fetch
// holds only the file list. Read the directory's README from the raw endpoint
// instead and show it the way the page would.
async function fetchGitHubTreePreview(tree, options) {
  const base = `https://raw.githubusercontent.com/${tree.owner}/${tree.repo}/${tree.ref}`
  const prefix = tree.filePath ? `${tree.filePath}/` : ""
  for (const name of ["README.md", "readme.md", "README.markdown"]) {
    const text = await fetchMemoizedText(`${base}/${prefix}${name}`, options)
    if (text === null) continue
    const suffix = tree.filePath ? `/${tree.filePath}` : ""
    return {
      title: `${tree.filePath || tree.repo} · ${tree.owner}/${tree.repo}`,
      siteName: "GitHub",
      url: `https://github.com/${tree.owner}/${tree.repo}/tree/${tree.ref}${suffix}`,
      content: markdownToBlocks(text),
    }
  }
  return null
}

// Minimal Markdown → block list, enough to preview a README the way GitHub
// renders it: headings, paragraphs, list items, quotes and fenced code.
function markdownToBlocks(markdown) {
  const blocks = []
  const state = { chars: 0 }
  const lines = markdown.split("\n")
  let i = 0
  while (i < lines.length && state.chars < CONTENT_MAX_CHARS && blocks.length < CONTENT_MAX_BLOCKS) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      const body = []
      i += 1
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      i += 1
      addBlock(blocks, state, { t: "code", text: body.join("\n") })
      continue
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (heading) {
      addBlock(blocks, state, {
        t: "heading",
        level: heading[1].length,
        text: cleanInline(heading[2]),
      })
      i += 1
      continue
    }
    const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/)
    if (item) {
      addBlock(blocks, state, { t: "list", text: cleanInline(item[1]) })
      i += 1
      continue
    }
    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      addBlock(blocks, state, { t: "quote", text: cleanInline(quote[1]) })
      i += 1
      continue
    }
    if (line.trim() === "") {
      i += 1
      continue
    }
    const paragraph = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```)/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim())
      i += 1
    }
    addBlock(blocks, state, { t: "paragraph", text: cleanInline(paragraph.join(" ")) })
  }
  return blocks
}

function addBlock(blocks, state, block) {
  const text = (block.text ?? "").trim()
  const room = CONTENT_MAX_CHARS - state.chars
  if (!text || room <= 0) return
  const clipped = text.slice(0, room)
  blocks.push({ ...block, text: clipped })
  state.chars += clipped.length
}

// Strip image syntax, unwrap links and drop code backticks so raw Markdown
// reads as plain text (underscores are left alone to keep identifiers intact).
function cleanInline(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// One raw file can back many line-anchored links; fetch it once per build.
function fetchMemoizedText(url, options) {
  if (!options.rawMemo.has(url)) {
    options.rawMemo.set(url, fetchText(url, options))
  }
  return options.rawMemo.get(url)
}

async function fetchPagePreview(url, options) {
  const page = await fetchHtml(url, options)
  if (!page) return null
  const tree = parse(page.html)
  const meta = extractMeta(tree, page.url, options)
  const content = extractContent(tree)
  if (!meta && content.length === 0) return null
  return { ...(meta ?? {}), url: page.url, content }
}

// Best-effort by contract: a timeout, non-HTML response, or network error
// returns null so one dead link can never fail the build.
async function fetchHtml(url, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": options.userAgent, accept: "text/html,application/xhtml+xml" },
    })
    if (!res.ok) return null
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return null
    return { html: await res.text(), url: res.url || url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(url, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": options.userAgent },
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function extractMeta(tree, baseUrl, options) {
  const tags = {}
  let titleTag
  walkElements(tree, (node) => {
    if (node.tagName === "title" && titleTag === undefined) titleTag = textOf(node)
    if (node.tagName !== "meta") return
    const key = (attr(node, "property") || attr(node, "name") || "").toLowerCase()
    const content = attr(node, "content")
    if (key && content && !(key in tags)) tags[key] = content
  })

  const meta = {}
  const title = pick(tags["og:title"], tags["twitter:title"], titleTag)
  const description = pick(
    tags["og:description"],
    tags["twitter:description"],
    tags["description"],
  )
  const image = pick(tags["og:image"], tags["twitter:image"], tags["twitter:image:src"])
  const siteName = pick(tags["og:site_name"])
  if (title) meta.title = truncate(collapse(title), 200)
  if (description) meta.description = truncate(collapse(description), options.maxDescriptionLength)
  if (image) meta.image = resolveUrl(image.trim(), baseUrl)
  if (siteName) meta.siteName = collapse(siteName)
  return Object.keys(meta).length > 0 ? meta : null
}

function extractContent(tree) {
  const root = pickContentRoot(tree)
  if (!root) return []
  const blocks = []
  collectBlocks(root, blocks, { chars: 0 })
  return blocks
}

function pickContentRoot(tree) {
  const candidates = []
  walkElements(tree, (node) => {
    if (node.tagName === "article" || node.tagName === "main" || hasContentHint(node)) {
      candidates.push(node)
    }
  })
  let best = null
  for (const node of candidates) {
    const length = textOf(node).length
    if (!best || length > best.length) best = { length, node }
  }
  return best && best.length > 200 ? best.node : findElement(tree, "body")
}

function hasContentHint(node) {
  const hint = `${attr(node, "class") ?? ""} ${attr(node, "id") ?? ""}`
  return /prose|markdown|article|entry-content|post-content/i.test(hint)
}

function collectBlocks(node, blocks, state) {
  if (state.chars >= CONTENT_MAX_CHARS || blocks.length >= CONTENT_MAX_BLOCKS) return
  if (DROP_TAGS.has(node.tagName)) return

  const kind = BLOCK_KINDS[node.tagName]
  if (kind) {
    const raw = kind === "code" ? textOf(node).trim() : collapse(textOf(node))
    if (raw) {
      const text = raw.slice(0, Math.max(0, CONTENT_MAX_CHARS - state.chars))
      if (text) {
        blocks.push(
          kind === "heading"
            ? { t: kind, level: Number(node.tagName[1]), text }
            : { t: kind, text },
        )
        state.chars += text.length
      }
    }
    return
  }
  for (const child of node.childNodes ?? []) collectBlocks(child, blocks, state)
}

function walkElements(node, visit) {
  if (node.tagName) visit(node)
  for (const child of node.childNodes ?? []) walkElements(child, visit)
}

function findElement(node, tag) {
  if (node.tagName === tag) return node
  for (const child of node.childNodes ?? []) {
    const found = findElement(child, tag)
    if (found) return found
  }
  return null
}

function textOf(node) {
  if (node.nodeName === "#text") return node.value
  if (DROP_TAGS.has(node.tagName)) return ""
  let out = ""
  for (const child of node.childNodes ?? []) out += textOf(child)
  return out
}

function attr(node, name) {
  const found = (node.attrs ?? []).find((a) => a.name === name)
  return found ? found.value : undefined
}

function pick(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value
  }
  return undefined
}

function collapse(value) {
  return value.replace(/\s+/g, " ").trim()
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value
}

function resolveUrl(value, base) {
  try {
    return new URL(value, base).toString()
  } catch {
    return undefined
  }
}

async function runPool(items, limit, worker) {
  const queue = [...items]
  const size = Math.max(1, Math.min(limit, queue.length))
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length > 0) {
        await worker(queue.shift())
      }
    }),
  )
}

async function loadCache(cachePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(cachePath, "utf-8"))
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function saveCache(cachePath, cache) {
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true })
    await fs.writeFile(cachePath, JSON.stringify(cache))
  } catch {
    // a missing cache only costs time on the next build
  }
}
