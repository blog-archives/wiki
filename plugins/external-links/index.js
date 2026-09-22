import { readFileSync } from "node:fs"

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8")
const client = readFileSync(new URL("./client.js", import.meta.url), "utf8")
const defaults = {
  style: "pill",
  standaloneStyle: "inline",
  logo: "favicon",
  arrow: "diagonal",
  showDomain: false,
  icons: {},
}

export const manifest = {
  name: "external-links",
  displayName: "External Links",
  description: "Configurable external link labels, icons and source cards.",
  version: "1.0.0",
  category: "transformer",
  quartzVersion: ">=5.0.0",
  defaultOptions: defaults,
}

const paths = {
  globe: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M3 12h18", "M12 3c5 5 5 13 0 18-5-5-5-13 0-18"],
  diagonal: ["M6 18 18 6M6 6h12v12"],
  external: ["M14 3h7v7M10 14 21 3", "M10 3H3v18h18v-7"],
  chevron: ["m9 5 7 7-7 7"],
}
const text = (value) => ({ type: "text", value })
const element = (tagName, properties, children = []) => ({
  type: "element",
  tagName,
  properties,
  children,
})
const classes = (node) =>
  String(node.properties?.className ?? node.properties?.class ?? "").split(/[ ,]+/)
const hasMedia = (node) =>
  ["img", "svg", "picture", "video", "audio"].includes(node.tagName) ||
  node.children?.some(hasMedia)

function icon(name, className) {
  return element(
    "svg",
    {
      className: [className],
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ariaHidden: "true",
    },
    paths[name].map((d) => element("path", { d })),
  )
}

function configuration(options) {
  const config = { ...defaults, ...options }
  for (const [key, choices] of Object.entries({
    style: ["text", "tag", "pill"],
    standaloneStyle: ["inline", "card", "list"],
    logo: ["favicon", "globe", "none"],
    arrow: ["diagonal", "external", "chevron", "none"],
  })) {
    if (!choices.includes(config[key]))
      throw new Error(`ExternalLinks: ${key} must be one of ${choices.join(", ")}`)
  }
  if (typeof config.showDomain !== "boolean")
    throw new Error("ExternalLinks: showDomain must be a boolean")
  if (!config.icons || typeof config.icons !== "object" || Array.isArray(config.icons))
    throw new Error("ExternalLinks: icons must map hostnames to image URLs")
  for (const src of Object.values(config.icons)) {
    if (typeof src !== "string" || !/^(https?:\/\/|\/(?!\/))/.test(src))
      throw new Error("ExternalLinks: icon URLs must use http(s) or a root-relative path")
  }
  return config
}

function externalUrl(node, ownHost) {
  const href = node.properties?.href
  if (typeof href !== "string" || !/^(https?:)?\/\//i.test(href)) return
  try {
    const url = new URL(href, "https://external.invalid")
    if (url.host !== ownHost) return url
  } catch {
    // Malformed destinations remain ordinary links rather than failing the build.
  }
}

function logo(url, config) {
  const children = [icon("globe", "el-globe")]
  if (config.logo === "favicon") {
    children.push(
      element("img", {
        className: ["el-favicon"],
        src: config.icons[url.hostname] ?? `${url.origin}/favicon.ico`,
        alt: "",
        width: 16,
        height: 16,
        loading: "lazy",
        decoding: "async",
        referrerPolicy: "no-referrer",
      }),
    )
  }
  return element("span", { className: ["el-logo"], ariaHidden: "true" }, children)
}

function decorate(node, url, style, config) {
  const label = element("span", { className: ["el-label"] }, node.children)
  const body = [label]
  if (config.showDomain || ["card", "list"].includes(style))
    body.push(element("span", { className: ["el-domain"] }, [text(url.host)]))
  node.children = [element("span", { className: ["el-body"] }, body)]
  if (config.logo !== "none") node.children.unshift(logo(url, config))
  if (config.arrow !== "none") node.children.push(icon(config.arrow, "el-arrow"))
  node.properties.className = [...classes(node).filter(Boolean), "el-link", `el-${style}`]
  if (node.properties.target === "_blank") {
    const rel = String(node.properties.rel ?? "")
      .split(/[ ,]+/)
      .filter(Boolean)
    node.properties.rel = [...new Set([...rel, "noopener", "noreferrer"])]
  }
}

function transformTree(tree, ownHost, config) {
  function walk(node, parent) {
    if (["pre", "code"].includes(node.tagName)) return
    if (node.tagName === "a") {
      const url = externalUrl(node, ownHost)
      if (!url || classes(node).includes("el-link") || classes(node).includes("external-plain"))
        return
      // Remove only Quartz's generated arrow; authored linked images are left intact.
      const content = node.children.filter((child) => !classes(child).includes("external-icon"))
      if (content.some(hasMedia) || !content.length) return
      node.children = content
      const standalone =
        parent?.tagName === "p" &&
        parent.children.every(
          (child) => child === node || (child.type === "text" && !child.value.trim()),
        )
      const style =
        standalone && config.standaloneStyle !== "inline" ? config.standaloneStyle : config.style
      decorate(node, url, style, config)
      return
    }
    for (const child of node.children ?? []) walk(child, node)
  }
  walk(tree)
}

export const transformer = (options = {}) => {
  const config = configuration(options)
  return {
    name: "ExternalLinks",
    htmlPlugins(ctx) {
      const base = ctx.cfg.configuration.baseUrl
      const ownHost = base
        ? new URL(/^https?:\/\//.test(base) ? base : `https://${base}`).host
        : undefined
      return [() => (tree) => transformTree(tree, ownHost, config)]
    },
    externalResources() {
      return {
        css: [{ content: styles, inline: true }],
        js:
          config.logo === "favicon"
            ? [{ loadTime: "afterDOMReady", contentType: "inline", script: client }]
            : [],
      }
    },
  }
}
