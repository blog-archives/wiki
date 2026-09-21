#!/usr/bin/env python3
"""Run the karpathy-llm-wiki evidence checker against this project's format.

This project keeps each document's title and Updated date in frontmatter and
puts the Sources/Raw citations at the end of the article. The upstream checker
(``~/.agents/skills/karpathy-llm-wiki/scripts/check_evidence.py``) instead
expects the title as an H1 followed immediately by the metadata blockquote.

Rather than fork that skill, this adapter rewrites each article into the shape
the upstream checker expects inside a throwaway project, then runs the upstream
script there and relays its report. ``raw/`` is symlinked, so no sources are
copied or modified. ``wiki/annotations/`` holds link-only notes that are not
grounded in sources, so it is skipped.

Usage: check_evidence.py [project-root]   (defaults to the current directory)
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL_CHECKER = (
    Path.home() / ".agents" / "skills" / "karpathy-llm-wiki" / "scripts" / "check_evidence.py"
)
SKIP_FILES = {"index.md", "log.md"}
SKIP_DIRS = {"annotations"}

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)
FIELD_RE = re.compile(r"\s*(title|updated):\s*(.+?)\s*$")
METADATA_LINE_RE = re.compile(r"^>\s*(Raw|Archived):")


def normalize(text: str) -> str:
    """Rewrite a frontmatter/references article into the upstream layout."""
    match = FRONTMATTER_RE.match(text)
    if not match:
        return text

    title = updated = None
    for line in match.group(1).splitlines():
        field = FIELD_RE.match(line)
        if not field:
            continue
        value = field.group(2).strip().strip("\"'")
        if field.group(1) == "title":
            title = value
        else:
            updated = value
    if not title:
        return text

    lines = match.group(2).split("\n")
    start = 0
    while start < len(lines) and lines[start].strip() == "":
        start += 1

    end = len(lines)
    while end > start and lines[end - 1].strip() == "":
        end -= 1
    block_start = end
    while block_start > start and lines[block_start - 1].lstrip().startswith(">"):
        block_start -= 1
    block = lines[block_start:end]

    if not any(METADATA_LINE_RE.match(line.strip()) for line in block):
        return text

    header = list(block)
    if updated and not any(re.match(r"^>\s*Updated:", line.strip()) for line in header):
        header.append(f"> Updated: {updated}")

    body = "\n".join(lines[start:block_start]).strip()
    return f"# {title}\n\n" + "\n".join(header) + f"\n\n{body}\n"


def main(argv: list[str]) -> int:
    root = Path(argv[1]).resolve() if len(argv) > 1 else Path.cwd()
    wiki = root / "wiki"
    raw = root / "raw"
    if not wiki.is_dir():
        print(f"no wiki/ directory under {root}")
        return 1
    if not SKILL_CHECKER.is_file():
        print(f"upstream checker not found: {SKILL_CHECKER}")
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="evidence-check-"))
    try:
        (tmp / "wiki").mkdir()
        if raw.is_dir():
            (tmp / "raw").symlink_to(raw.resolve(), target_is_directory=True)
        for path in sorted(wiki.rglob("*.md")):
            rel = path.relative_to(wiki)
            if rel.parts and rel.parts[0] in SKIP_DIRS:
                continue
            dest = tmp / "wiki" / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(normalize(path.read_text(encoding="utf-8")), encoding="utf-8")

        result = subprocess.run([sys.executable, str(SKILL_CHECKER), str(tmp)])
        return result.returncode
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
