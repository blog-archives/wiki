// Renders hover previews for external links from the content prefetched at
// build time by plugins/external-link-preview/index.js.
//
// Quartz's built-in popover fetches same-origin pages, so it can't reach
// external URLs (CORS). This mirrors its output instead: the same `.popover` /
// `.popover-inner` card, a `.popover-hint` header and an
// `<article class="popover-hint">` body inside `.markdown-preview-view
// .markdown-rendered`, so the site styles (including the heading-styles plugin)
// render external previews exactly like internal ones.
(() => {
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

  // Render the prefetched blocks as plain Markdown elements, so the same
  // `.markdown-rendered` styles apply as on a real page.
  function renderBlocks(container, blocks) {
    let list = null
    for (const block of blocks) {
      if (block.t === "list") {
        if (!list) {
          list = document.createElement("ul")
          container.appendChild(list)
        }
        const li = document.createElement("li")
        li.textContent = block.text
        list.appendChild(li)
        continue
      }
      list = null
      if (block.t === "heading") {
        const level = Math.min(Math.max(block.level || 2, 1), 6)
        const heading = document.createElement(`h${level}`)
        heading.textContent = block.text
        container.appendChild(heading)
      } else if (block.t === "code") {
        const pre = document.createElement("pre")
        const code = document.createElement("code")
        code.textContent = block.text
        pre.appendChild(code)
        container.appendChild(pre)
      } else if (block.t === "quote") {
        const quote = document.createElement("blockquote")
        const p = document.createElement("p")
        p.textContent = block.text
        quote.appendChild(p)
        container.appendChild(quote)
      } else {
        const p = document.createElement("p")
        p.textContent = block.text
        container.appendChild(p)
      }
    }
  }

  function createPopover(preview, anchor) {
    const el = document.createElement("div")
    el.className = "popover external-popover"
    const inner = document.createElement("div")
    inner.className = "popover-inner"
    el.appendChild(inner)

    const header = document.createElement("div")
    header.className = "popover-hint"
    const title = document.createElement("h1")
    title.className = "article-title"
    title.textContent = preview.title || preview.siteName || anchor.hostname
    header.appendChild(title)
    const meta = document.createElement("p")
    meta.className = "content-meta"
    meta.textContent = preview.siteName || anchor.hostname
    header.appendChild(meta)
    inner.appendChild(header)

    const article = document.createElement("article")
    article.className = "popover-hint"
    const body = document.createElement("div")
    body.className = "markdown-preview-view markdown-rendered"
    if (Array.isArray(preview.content)) renderBlocks(body, preview.content)
    if (preview.code) {
      const pre = document.createElement("pre")
      const code = document.createElement("code")
      code.textContent = preview.code.text
      pre.appendChild(code)
      body.appendChild(pre)
    }
    if (preview.image) {
      const img = document.createElement("img")
      img.src = preview.image
      img.alt = ""
      img.loading = "lazy"
      body.appendChild(img)
    }
    if (preview.description) {
      const p = document.createElement("p")
      p.textContent = preview.description
      body.appendChild(p)
    }
    article.appendChild(body)
    inner.appendChild(article)
    return el
  }

  function render(anchor, preview) {
    removePopovers()
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
