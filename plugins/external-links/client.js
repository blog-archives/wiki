;(() => {
  function updateIcon(image) {
    if (image.complete)
      image.parentElement.classList.toggle("el-icon-loaded", image.naturalWidth > 0)
  }
  function initializeIcons() {
    for (const image of document.querySelectorAll("img.el-favicon")) updateIcon(image)
  }
  function onImageSettled(event) {
    if (event.target instanceof HTMLImageElement && event.target.matches(".el-favicon"))
      updateIcon(event.target)
  }
  // Capture covers lazy images and images inserted by Quartz's hover previews.
  document.addEventListener("load", onImageSettled, true)
  document.addEventListener("error", onImageSettled, true)
  document.addEventListener("nav", initializeIcons)
  document.addEventListener("render", initializeIcons)
  initializeIcons()
})()
