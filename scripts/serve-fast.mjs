#!/usr/bin/env node
// Local dev fast mode: serve the wiki without the `raw/` archive.
//
// A cold `make serve` spends almost all of its time on the raw archive: its
// ~1.4 MB across 26 files carry around 930 fenced code blocks, and highlighting
// them with shiki — plus parsing the Markdown — accounts for roughly 90% of the
// build. Dropping them takes a cold start from ~9 s to under a second. The
// custom plugins themselves are not involved (they measure ~0.1% of the build).
//
// This mirrors every top-level entry of `wiki/` into a temp directory through
// symlinks, leaving `raw` out, and points Quartz at that directory. Nothing in
// the repo is touched, and `make build` / CI keep reading `wiki/` as before, so
// the published site still includes the raw pages.
//
// Trade-off: raw pages do not exist in this mode, so the article links and
// hover previews that target `raw/...` 404 locally.
//
// Usage:
//   node scripts/serve-fast.mjs [quartz build options]
//   make serve-fast

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const wiki = path.join(root, "wiki")

// The archive is the only thing worth excluding: it is unlisted, and each file
// is far larger than the articles it backs.
const EXCLUDED = new Set(["raw"])

const mirror = fs.mkdtempSync(path.join(os.tmpdir(), "quartz-fast-"))
for (const entry of fs.readdirSync(wiki)) {
  if (EXCLUDED.has(entry)) continue
  fs.symlinkSync(path.join(wiki, entry), path.join(mirror, entry))
}

const cleanup = () => fs.rmSync(mirror, { recursive: true, force: true })
process.on("exit", cleanup)

console.log("Fast mode: serving wiki/ without raw/ (links to raw/ will 404).")

const child = spawn(
  process.execPath,
  [
    path.join(root, "quartz", "bootstrap-cli.mjs"),
    "build",
    "--serve",
    "-d",
    mirror,
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: "inherit" },
)

child.on("error", (err) => {
  console.error(`Failed to start Quartz: ${err.message}`)
  cleanup()
  process.exit(1)
})

const stop = (signal) => () => {
  if (!child.killed) child.kill(signal)
}
process.on("SIGINT", stop("SIGINT"))
process.on("SIGTERM", stop("SIGTERM"))

child.on("exit", (code) => {
  cleanup()
  process.exit(code ?? 0)
})
