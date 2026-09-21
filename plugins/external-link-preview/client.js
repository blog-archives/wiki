// Renders hover previews for external links from the content prefetched at
// build time by plugins/external-link-preview/index.js. Reuses the built-in
// `.popover` / `.popover-inner` styles so the card matches internal previews.
(() => {
  const STYLE_ID = "external-popover-style"
  const STYLE = `
.external-popover .popover-inner { display: flex; flex-direction: column; gap: 0.35rem; user-select: text; }
.external-popover-image { width: 100%; max-height: 10rem; object-fit: cover; border-radius: 4px; margin: 0 0 0.35rem 0; }
.external-popover-title { font-weight: 600; font-size: 1rem; line-height: 1.3; }
.external-popover-host { color: var(--gray); font-size: 0.8rem; }
.external-popover-description { color: var(--darkgray); font-size: 0.9rem; line-height: 1.4; }
.external-popover-paragraph, .external-popover-list { font-size: 0.9rem; line-height: 1.45; margin: 0; }
.external-popover-list { padding-left: 1rem; position: relative; }
.external-popover-list::before { content: "•"; position: absolute; left: 0.15rem; color: var(--gray); }
.external-popover-heading { font-weight: 600; font-size: 0.95rem; margin: 0.35rem 0 0; }
.external-popover-quote { border-left: 2px solid var(--lightgray); padding-left: 0.6rem; color: var(--darkgray); font-size: 0.9rem; margin: 0; }
.external-popover-code { font-family: var(--codeFont); font-size: 0.78rem; line-height: 1.4; white-space: pre; margin: 0; }
`

  let previewsPromise = null

  function basePath() {
    return (document.body && document.body.dataset && document.body.dataset.basepath) || ""
  }

  // Previews are optional: a failed fetch just means no popovers.
  function getPreviews() {
    if (!previewsPromise) {
      previewsPromise = fetch(`${basePath()}/static/external-previews.json`)
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({}))
    }
    return previewsPromise
  }

  // Must match absoluteUrl() in index.js, which keys the build-time lookup:
  // both resolve to an absolute URL and keep the fragment.
  function keyFor(href) {
    try {
      return new URL(href, document.baseURI).toString()
    } catch {
      return href
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = STYLE
    document.head.appendChild(style)
  }

  function removePopovers() {
    for (const el of document.querySelectorAll(".external-popover")) el.remove()
  }

  function position(el, anchor) {
    const rect = anchor.getBoundingClientRect()
    const gap = 8
    const width = el.offsetWidth
    const height = el.offsetHeight
    let x = rect.left
    let y = rect.bottom + gap
    if (x + width > window.innerWidth - 12) x = window.innerWidth - width - 12
    if (x < 12) x = 12
    if (y + height > window.innerHeight - 12) {
      const above = rect.top - gap - height
      y = above >= 12 ? above : Math.max(12, window.innerHeight - height - 12)
    }
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  }

  function blockElement(block) {
    const tag =
      block.t === "code"
        ? "pre"
        : block.t === "list"
          ? "div"
          : block.t === "quote"
            ? "blockquote"
            : block.t === "heading"
              ? "div"
              : "p"
    const el = document.createElement(tag)
    el.className = `external-popover-${block.t}`
    el.textContent = block.text
    return el
  }

  function appendBody(inner, preview) {
    if (preview.code) {
      const pre = document.createElement("pre")
      pre.className = "external-popover-code"
      pre.textContent = preview.code.text
      inner.appendChild(pre)
      return
    }
    if (Array.isArray(preview.content) && preview.content.length > 0) {
      for (const block of preview.content) inner.appendChild(blockElement(block))
      return
    }
    if (preview.image) {
      const img = document.createElement("img")
      img.className = "external-popover-image"
      img.src = preview.image
      img.alt = ""
      img.loading = "lazy"
      inner.appendChild(img)
    }
    if (preview.description) {
      const desc = document.createElement("div")
      desc.className = "external-popover-description"
      desc.textContent = preview.description
      inner.appendChild(desc)
    }
  }

  function createPopover(preview, anchor) {
    const el = document.createElement("div")
    el.className = "popover external-popover"
    const inner = document.createElement("div")
    inner.className = "popover-inner"
    el.appendChild(inner)

    const title = document.createElement("div")
    title.className = "external-popover-title"
    title.textContent = preview.title || preview.siteName || anchor.hostname
    inner.appendChild(title)

    const host = document.createElement("div")
    host.className = "external-popover-host"
    host.textContent = preview.siteName || anchor.hostname
    inner.appendChild(host)

    appendBody(inner, preview)
    return el
  }

  function render(anchor, preview) {
    removePopovers()
    ensureStyle()
    const el = createPopover(preview, anchor)
    document.body.appendChild(el)
    position(el, anchor)
    const img = el.querySelector("img")
    if (img) img.addEventListener("load", () => position(el, anchor), { once: true })
    el.classList.add("active-popover")
  }

  async function onEnter(event) {
    const anchor = event.currentTarget
    if (anchor.dataset && anchor.dataset.noPopover === "true") return
    const previews = await getPreviews()
    if (!anchor.matches(":hover")) return
    const preview = previews[keyFor(anchor.href)]
    if (preview) render(anchor, preview)
  }

  function onLeave() {
    for (const el of document.querySelectorAll(".external-popover.active-popover")) {
      el.classList.remove("active-popover")
    }
  }

  function setup() {
    const links = document.querySelectorAll("a.external-link")
    for (const link of links) {
      link.addEventListener("mouseenter", onEnter)
      link.addEventListener("mouseleave", onLeave)
      if (window.addCleanup) {
        window.addCleanup(() => {
          link.removeEventListener("mouseenter", onEnter)
          link.removeEventListener("mouseleave", onLeave)
        })
      }
    }
  }

  document.addEventListener("nav", removePopovers)
  document.addEventListener("nav", setup)
  document.addEventListener("render", setup)
})()
