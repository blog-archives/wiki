"""MkDocs build hooks for the knowledge base.

1. ``on_page_markdown`` rewrites the repo-relative source links that wiki
   articles use (``../../raw/<topic>/<file>.md``). Those paths escape
   ``docs_dir`` (``wiki/``), so MkDocs cannot resolve them and leaves
   them pointing at ``.md`` URLs that are never emitted.
2. ``on_page_markdown`` also repairs the archived upstream docs under
   ``ai-agent-book/``. Those files are kept byte-for-byte as published,
   so their relative links still point at the upstream repo layout
   (``book/chapter1.md``, ``docs/zh-CN/LEARNING.md``, ...). Every such
   link that does not resolve inside ``docs_dir`` is redirected to the
   file on GitHub, which keeps ``--strict`` link checking useful for our
   own articles instead of flagging the archive.
3. ``on_page_content`` copies each table's header labels onto the body
   cells as ``data-label`` attributes, so the mobile stylesheet can stack
   wide comparison tables into labelled cards without horizontal scroll.
"""

import html
import os
import posixpath
import re

_RAW_LINK_RE = re.compile(r"\]\(((?:\.\./)+)raw/([^)\s]+?)\.md(#[^)\s]*)?\)")

_MD_LINK_RE = re.compile(r"\]\(([^)\s]+)\)")

_ARCHIVE_PREFIX = "ai-agent-book/"
_ARCHIVE_UPSTREAM = "https://github.com/bojieli/ai-agent-book/"
_ARCHIVE_UPSTREAM_DIR_DEFAULT = "book/"
_ARCHIVE_UPSTREAM_DIRS = {
    "README.md": "",
    "LEARNING.md": "docs/zh-CN/",
}
_ARCHIVE_EXTERNAL_PREFIXES = ("http://", "https://", "mailto:", "#", "/", "data:")


def _archive_upstream_url(path, base):
    kind = "tree" if path.endswith("/") else "blob"
    ref = posixpath.normpath(posixpath.join(base, path))
    return f"{_ARCHIVE_UPSTREAM}{kind}/main/{ref}"


def _rewrite_archive_links(markdown, page, config):
    src_path = page.file.src_path
    if not src_path.startswith(_ARCHIVE_PREFIX):
        return markdown

    docs_dir = config["docs_dir"]
    page_dir = posixpath.dirname(src_path)
    base = _ARCHIVE_UPSTREAM_DIRS.get(
        posixpath.basename(src_path), _ARCHIVE_UPSTREAM_DIR_DEFAULT
    )

    def repl(match):
        target = match.group(1)
        if target.startswith(_ARCHIVE_EXTERNAL_PREFIXES):
            return match.group(0)
        path, _, anchor = target.partition("#")
        if not path:
            return match.group(0)
        if os.path.exists(os.path.join(docs_dir, posixpath.normpath(posixpath.join(page_dir, path)))):
            return match.group(0)
        suffix = f"#{anchor}" if anchor else ""
        return f"]({_archive_upstream_url(path, base)}{suffix})"

    return _MD_LINK_RE.sub(repl, markdown)

_TABLE_RE = re.compile(r"<table>.*?</table>", re.DOTALL)
_THEAD_RE = re.compile(r"<thead>(.*?)</thead>", re.DOTALL)
_TBODY_RE = re.compile(r"<tbody>(.*?)</tbody>", re.DOTALL)
_ROW_RE = re.compile(r"<tr>(.*?)</tr>", re.DOTALL)
_TH_RE = re.compile(r"<th[^>]*>(.*?)</th>", re.DOTALL)
_TD_RE = re.compile(r"<td[^>]*>")
_TAG_RE = re.compile(r"<[^>]+>")


def on_page_markdown(markdown, page, config, files):
    markdown = _rewrite_archive_links(markdown, page, config)

    depth = page.file.src_path.count("/")
    prefix = f'{"../" * depth}raw/'

    def repl(match):
        anchor = match.group(3) or ""
        return f"]({prefix}{match.group(2)}.md{anchor})"

    return _RAW_LINK_RE.sub(repl, markdown)


def _label_table(table_html):
    thead = _THEAD_RE.search(table_html)
    tbody = _TBODY_RE.search(table_html)
    if not thead or not tbody:
        return table_html

    labels = [
        html.unescape(_TAG_RE.sub("", cell)).strip()
        for cell in _TH_RE.findall(thead.group(1))
    ]
    if not labels:
        return table_html

    def label_row(row):
        index = 0

        def label_cell(cell):
            nonlocal index
            label = labels[index] if index < len(labels) else ""
            index += 1
            if not label:
                return cell.group(0)
            attr = html.escape(label, quote=True)
            return cell.group(0).replace("<td", f'<td data-label="{attr}"', 1)

        return f"<tr>{_TD_RE.sub(label_cell, row.group(1))}</tr>"

    body = _ROW_RE.sub(label_row, tbody.group(1))
    return table_html.replace(tbody.group(1), body)


def on_page_content(html, page, config, files):
    return _TABLE_RE.sub(lambda match: _label_table(match.group(0)), html)
