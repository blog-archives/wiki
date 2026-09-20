# Knowledge Base

This repo is a personal LLM-powered knowledge base managed by the `karpathy-llm-wiki` skill. Load that skill for any ingest, query, or lint task.

## Layout

- `raw/<topic>/` — immutable source material. Read only; never modify.
- `wiki/<topic>/` — compiled knowledge articles, one topic level only. Fully agent-owned.
- `wiki/index.md` — global index: one row per article, grouped by topic.
- `wiki/log.md` — append-only operation log.

## Workflow

- **Ingest** ("add to wiki", drop a URL/file): fetch into `raw/<topic>/YYYY-MM-DD-slug.md`, triage against existing wiki, compile into `wiki/<topic>/`, cascade-update affected articles, update `index.md` and `log.md`.
- **Query** ("what do I know about X"): search `index.md` then full-text; answer in conversation with relative links. Writes nothing unless asked to archive.
- **Lint**: run `python3 ~/.agents/skills/karpathy-llm-wiki/scripts/check_evidence.py .` then apply safe fixes and report judgment issues.

## Rules

- Grounding invariant: every number, date, and quote in `wiki/` must exist verbatim in the linked `raw/` files.
- Inside `wiki/`, links are relative to the current file; in conversation, use project-root-relative paths.
- Never modify `raw/`; never silently rewrite history (use Status blocks for outdated/disputed claims).
