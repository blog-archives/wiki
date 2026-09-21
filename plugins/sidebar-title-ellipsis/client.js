// Reveal full table-of-contents titles on hover.
//
// styles.css clips long titles with an ellipsis, which hides the tail of the
// text. Copying each title into the `title` attribute lets the browser show a
// native tooltip on hover. Runs after every Quartz navigation.
(() => {
  function labelTocLinks() {
    for (const link of document.querySelectorAll("ul.toc-content.overflow > li > a")) {
      if (!link.title) link.title = link.textContent.trim()
    }
  }

  document.addEventListener("nav", labelTocLinks)
  document.addEventListener("render", labelTocLinks)
  labelTocLinks()
})()
