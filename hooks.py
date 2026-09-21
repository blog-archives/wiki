"""MkDocs build hooks for the knowledge base.

1. ``on_page_markdown`` rewrites the repo-relative source links that wiki
   articles use (``../../raw/<topic>/<file>.md``). Those paths escape
   ``docs_dir`` (``wiki/``), so MkDocs cannot resolve them and leaves
   them pointing at ``.md`` URLs that are never emitted.
2. ``on_page_content`` copies each table's header labels onto the body
   cells as ``data-label`` attributes, so the mobile stylesheet can stack
   wide comparison tables into labelled cards without horizontal scroll.
"""

import html
import re

_RAW_LINK_RE = re.compile(r"\]\(((?:\.\./)+)raw/([^)\s]+?)\.md(#[^)\s]*)?\)")

_TABLE_RE = re.compile(r"<table>.*?</table>", re.DOTALL)
_THEAD_RE = re.compile(r"<thead>(.*?)</thead>", re.DOTALL)
_TBODY_RE = re.compile(r"<tbody>(.*?)</tbody>", re.DOTALL)
_ROW_RE = re.compile(r"<tr>(.*?)</tr>", re.DOTALL)
_TH_RE = re.compile(r"<th[^>]*>(.*?)</th>", re.DOTALL)
_TD_RE = re.compile(r"<td[^>]*>")
_TAG_RE = re.compile(r"<[^>]+>")


def on_page_markdown(markdown, page, config, files):
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
