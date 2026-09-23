// Expand-all / collapse-all control for the left explorer tree.
//
// Quartz builds the tree client-side on every navigation and keeps each
// folder's open state in the `fileTree` localStorage key. This script adds one
// toggle button to the explorer header and, on click, opens every folder or
// closes every folder except the path leading to the page being read. The
// resulting state is written back to the same key, so it survives navigation;
// the stock explorer already force-opens the current page's ancestors on every
// render, so that path stays visible even if its saved state says collapsed.
//
// The tree is rebuilt asynchronously after `nav`, so a MutationObserver keeps
// the button's icon and label in sync with whatever the tree ends up doing.
;(() => {
  const STORAGE_KEY = "fileTree"
  const ICONS = {
    expand: ["m7 15 5 5 5-5", "m7 9 5-5 5 5"],
    collapse: ["m7 4 5 5 5-5", "m7 20 5-5 5 5"],
  }
  const LABELS = { expand: "全部展开", collapse: "全部收缩" }

  const foldersOf = (explorer) => Array.from(explorer.querySelectorAll(".folder-outer"))

  const folderPathOf = (outer) => {
    const container = outer.previousElementSibling
    return container && container.dataset ? container.dataset.folderpath : undefined
  }

  const normalizeSlug = (value) => {
    const slug = String(value || "")
      .split("#")[0]
      .split("?")[0]
      .replace(/\.html$/, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .replace(/\/index$/, "")
    return slug === "index" ? "" : slug
  }

  const currentSlug = () => {
    // Quartz writes the page's slug onto <body data-slug> and micromorph keeps
    // it current across SPA navigations; fall back to the URL just in case.
    const declared = document.body && document.body.dataset && document.body.dataset.slug
    if (declared) return normalizeSlug(declared)
    const basepath =
      (document.body && document.body.dataset && document.body.dataset.basepath) || ""
    let path = window.location.pathname
    if (basepath && basepath !== "/" && path.startsWith(basepath))
      path = path.slice(basepath.length)
    return normalizeSlug(path)
  }

  const writeState = (records) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    } catch {
      // A full or unavailable localStorage must not break the explorer.
    }
  }

  const setButton = (button, action) => {
    const [up, down] = ICONS[action]
    const paths = button.querySelectorAll("path")
    paths[0].setAttribute("d", up)
    paths[1].setAttribute("d", down)
    button.title = LABELS[action]
    button.setAttribute("aria-label", LABELS[action])
  }

  const isExpanded = (explorer) => {
    const folders = foldersOf(explorer)
    return folders.length > 0 && folders.every((folder) => folder.classList.contains("open"))
  }

  const syncButton = (explorer) => {
    const button = explorer.querySelector(":scope > .explorer-expand-all")
    if (button) setButton(button, isExpanded(explorer) ? "collapse" : "expand")
  }

  const applyState = (explorer, action) => {
    const slug = currentSlug()
    const records = []
    for (const folder of foldersOf(explorer)) {
      const path = folderPathOf(folder)
      if (!path) continue
      const folderSlug = normalizeSlug(path)
      const onCurrentPath = slug === folderSlug || slug.startsWith(folderSlug + "/")
      const open = action === "expand" || onCurrentPath
      folder.classList.toggle("open", open)
      // Persist the chosen action, not the visual state. The stock explorer
      // force-opens the current path on every render, so saving ancestors as
      // collapsed leaves "collapse all" meaning "only the current path" even
      // after navigating to another page, instead of reopening every folder
      // that happened to be on the previous path.
      records.push({ path, collapsed: action === "collapse" })
    }
    writeState(records)
    syncButton(explorer)
  }

  const addButton = (explorer) => {
    if (!explorer.querySelector(":scope > .title-button.desktop-explorer")) return
    if (explorer.querySelector(":scope > .explorer-expand-all")) return
    const button = document.createElement("button")
    button.type = "button"
    button.className = "explorer-expand-all"
    button.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 15 5 5 5-5"></path><path d="m7 9 5-5 5 5"></path></svg>'
    setButton(button, "expand")
    button.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      const container = button.closest(".explorer")
      if (container) applyState(container, isExpanded(container) ? "collapse" : "expand")
    })
    explorer.appendChild(button)
  }

  // The tree is fetched and rendered after `nav`, and users can also open or
  // close single folders by hand, so watch each explorer and re-sync the button
  // whenever the tree or a folder's class changes.
  let observers = []
  const observe = () => {
    for (const observer of observers) observer.disconnect()
    observers = []
    for (const explorer of document.querySelectorAll("div.explorer")) {
      let queued = false
      const observer = new MutationObserver(() => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
          queued = false
          syncButton(explorer)
        })
      })
      observer.observe(explorer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      })
      observers.push(observer)
    }
  }

  const enhance = () => {
    for (const explorer of document.querySelectorAll("div.explorer")) {
      addButton(explorer)
      syncButton(explorer)
    }
    observe()
  }

  document.addEventListener("nav", enhance)
  document.addEventListener("render", enhance)
  enhance()
})()
