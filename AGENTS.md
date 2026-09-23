# Knowledge Base

This repo is a personal LLM-powered knowledge base managed by the `karpathy-llm-wiki` skill. Load that skill for any ingest, query, or lint task.

## Layout

- `wiki/<topic>/` — compiled knowledge articles. A topic may hold one level of sub-topic directories for a focused series (e.g. `wiki/ai-agent/interrupt-resume/`); no deeper nesting. Fully agent-owned.
- `wiki/images/` — single shared tree for every image under `wiki/`, grouped by source (`wiki/images/<source>/`); articles reference it as `../images/<source>/<file>`.
- `wiki/annotations/` — link-only annotation notes. Kept out of listings (see below); articles link to them for hover-preview "comments".
- `raw/` — archive for sources that are *ephemeral or likely to be lost*: session-scoped Q&A links, pasted text, offline documents. A durable public original (a page or repo that stays reachable) is linked directly in the article instead, never archived. Flat (no topic subdirectories), stored verbatim with a metadata header. Files are named by timestamp, `YYYY-MM-DD-HHMMSS.md` (a day can hold several sources, so the name goes down to the second). Surfaced to the build through the `wiki/raw` symlink (see below), so its pages are published and link-reachable but unlisted.
- `wiki/index.md` — global index: one row per article, grouped by topic.
- `wiki/log.md` — append-only operation log.

## Raw metadata

Every raw file carries `tags:` in its frontmatter (add a frontmatter block if the file has none), so retrieval can judge a source's scope before opening it. Tags are lowercase and hyphen-separated; reuse existing ones instead of inventing near-duplicates. Aim for at least five, covering four dimensions:

- **来源** — the repo or product the source analyses: `openai-codex`, `anthropics-claude-code`, `charmbracelet-crush`, `cloudwego-eino`.
- **主题** — the wiki area it feeds: `context-engineering`, `context-assembly`, `context-storage`, `context-compaction`, `context-integrity`, `long-term-memory`, `task-state`, `interrupt-resume`, `multi-agent`, `tool-call`, `model-retry`, `error-handling`, `system-prompt-design`, `task-planning`, `agent-skills`, `interview-questions`.
- **内容类型** — `deepwiki-qa`, `source-code`, `prompt-template`.
- **关键对象或概念** — `rollout`, `session`, `goal`, `plan`, `sub-agent`, `checkpoint`, `token-budget`, `summary`, `watermark`, `memory-write`, `memory-read`, `consolidation`.

Wiki articles carry the same tags in their frontmatter, combining one topic tag with the sources they analyse and the concepts they explain (for example `interrupt-resume` + `cloudwego-eino` + `tool-call`). The `plugins/tag-normalize` transformer canonicalises every tag, and `tag-pills` / `tag-pages` surface them, so article and raw tags share one namespace and one tag page.

Raw pages are unlisted, so they stay out of the explorer, graph, backlinks and search; the tags mainly drive agent-side retrieval. They do get tag listing pages, though: the local `plugins/tag-pages` page type wraps `@quartz-community/tag-page` so that every tag — including one that occurs only on unlisted pages — has a `tags/<tag>` page listing the notes that carry it. Spelling variants are folded together by the local `plugins/tag-normalize` transformer — case, whitespace and underscores all collapse to the lowercase hyphen form, so `AA tag`, `aa_tag` and `aa-tag` are one tag.

## Site

The published site is built with [Quartz 5](https://quartz.jzhao.xyz/) from `wiki/`. `make build` runs `npx quartz build -d wiki -o public`; `make serve` previews at http://localhost:8080. Config lives in `quartz.config.yaml`. Hover previews (`enablePopovers`), graph view, backlinks and full-text search are enabled; the UI locale is `zh-CN`.

Each document states its title once, as frontmatter `title:`, and its last-updated date as frontmatter `updated:`. The body must **not** repeat the title as a `# heading` — Quartz renders the frontmatter title as the page heading, and the local `plugins/title-from-h1` transformer promotes a leading H1 to the title and strips it. `log.md` is excluded via `ignorePatterns`. Pages under `wiki/annotations/` are published and reachable through article links (including hover previews), but marked *unlisted* by the local `plugins/unlisted-paths` transformer so they stay out of the explorer, search, graph and folder listings. The plugin takes a `prefixes` option listing the path prefixes to hide (currently `annotations` and `raw`). The `raw/` source archive gets the same treatment: `wiki/raw` is a symlink to the repo-root `raw/`, so raw pages are built and link-reachable but never listed. A page's tags are shown under the title by the local `plugins/tag-pills` component, each as a capsule linking to its `tags/<tag>` listing page. The `note-properties` table itself is hidden with `hidePropertiesView: true`.

The explorer sidebar can be ordered with a document's `order:` frontmatter. Quartz's stock explorer builds its tree client-side from `static/contentIndex.json`, which carries only title/links/tags/content, so the local `plugins/explorer-order` component wraps it: every render embeds a `slug → order` map built from all files' frontmatter, and the client-side sort places siblings that declare a numeric `order` first by it (ascending, ordered before unordered), falling back to the stock alphabetical, folders-first order otherwise. It replaces `@quartz-community/explorer` in the plugin list. The same `order` drives the article list on a folder page: the local `plugins/folder-order` page type wraps `@quartz-community/folder-page` with an order-aware comparator (ordered entries ascending first, then the stock date/alphabetical order). The left tree's rows are aligned by the local `plugins/explorer-align` transformer, which reserves the folder chevron's 17px gutter on file rows and puts a matching document glyph in it, and redraws the folder chevron from the same stroke icon, so folder and file titles line up at every depth. The local `plugins/explorer-expand-all` transformer adds an expand-all / collapse-all toggle to the explorer header; collapsing always keeps the path to the page being read open, and the choice is persisted through the same `fileTree` state the stock explorer uses.

## Customization boundary

Quartz is vendored **unmodified**: `quartz/` and the framework files at the repo root (`package.json`, `package-lock.json`, `tsconfig.json`, `quartz.ts`, `Dockerfile`, …) are byte-identical to upstream v5, so an upgrade can replace them wholesale. All our behaviour changes are extensions upstream does not own:

- `quartz.config.yaml` — plugin list, layout, theme, locale (upstream ships only `quartz.config.default.yaml`).
- `plugins/<name>/` — local Quartz plugins, wired in via `source: "./plugins/<name>"`.
- `scripts/` — project tooling (`format-markdown.mjs`).
- `.github/workflows/deploy.yml` — our Pages deploy; upstream's CI workflows are intentionally not vendored.

Never edit `quartz/` or the vendored framework files for project needs — add a plugin or a config entry instead. `wiki/` is content and is untouched by framework updates.

## Workflow

- **Ingest** ("add to wiki", drop a URL/file): fetch the source; archive it to `raw/` only if it is ephemeral or likely to be lost, otherwise cite the durable original inline. When archiving, write the frontmatter `tags` (see Raw metadata). Then triage against existing wiki, compile into `wiki/<topic>/`, cascade-update affected articles, update `index.md` and `log.md`.
- **Query** ("what do I know about X"): search `index.md` then full-text; answer in conversation with relative links. Writes nothing unless asked to archive.
- **Format**: run `make format` (or `node scripts/format-markdown.mjs wiki`) to apply pangu spacing, emphasis spacing and safe layout to every `wiki/*.md`; `make format-check` reports drift without writing. The script skips frontmatter, code and link targets.
- **Write/revise**: load the `technical-writing` skill (`.opencode/skills/technical-writing/`) before drafting or editing an article. It carries the project's Chinese tone rules and the problem-chain structure.

## Rules

- Inside `wiki/`, links are relative to the current file; in conversation, use project-root-relative paths.
- All images under `wiki/` live in the single `wiki/images/` tree, grouped by source (`wiki/images/<source>/`); articles reference them as `../images/<source>/<file>`.
- When an article is a summary or translation of one specific source, open the body with a one-line blockquote that says so and links the original inline, e.g. `> 本文是 [DeepWiki | anthropics/claude-code/3-core-systems](https://deepwiki.com/anthropics/claude-code/3-core-systems) 一章的中文译文。`. Keep it to that single line — no separate `原文：` line and no long overview. When only a passage or sentence is drawn from a source, link it inline in that paragraph or sentence instead.
- Never silently rewrite history (use Status blocks for outdated/disputed claims).

## Formatting preferences

- Use lists only for short, one-line items. For longer reasoning, write prose paragraphs instead of paragraph-length list items.
- For multi-point reasoning, give each point a short bold title line (a numbered item like `1. **Title**`, or a `###` subheading) and put the explanation in a separate paragraph below it.
- Don't leave prose as flat text: bold the thesis sentence of a paragraph and key terms, and use italics for sharp contrasts, so the reader can scan the argument.
- When using `**` for bold (or other emphasis), put a space on each side where it meets CJK text — `我要 **加粗** 文本`. Without it `是**「x」**` hits CommonMark's flanking rules and renders literal asterisks instead of bold. Write it spaced from the start; `make format` enforces the spacing.

## 文档梳理与表达习惯

[内部中断实现](wiki/ai-agent/interrupt-resume/internal-interrupt.md)及其修改过程是重要的写作参考。**参考的是如何理解材料、确定重点、取舍细节和组织解释，不是复用它的章节结构。** 以下原则用于日常知识整理；其中源码和代码片段的要求适用于实现解析。按当前主题和读者需要组织文章，不规定章节数量、先后顺序或固定结尾。

[上下文工程专题](wiki/ai-agent/context-engineering/index.md)补充了设计思路类文章的写作参考：[存储篇](wiki/ai-agent/context-engineering/context-storage.md)展示如何说明对象与保存位置的对应关系，[预算篇](wiki/ai-agent/context-engineering/budget-and-compaction.md)展示如何简化核心流程，[完整性篇](wiki/ai-agent/context-engineering/context-integrity.md)展示如何把原则落实为具体操作，[长期记忆篇](wiki/ai-agent/context-engineering/long-term-memory.md)展示如何从场景出发用一条问题链推进到完整生命周期。借鉴解释方式，不照搬篇章安排。

### 用问题链推进，而不是按清单罗列

**技术文档先给一个具体场景或问题，再让每一步设计都由上一步留下的麻烦逼出来。** 默认的推进顺序是：从真实场景引出需求，说明首要目标如何达成，接着处理新做法带来的问题（容量膨胀、新旧冲突、陈旧失效），最后把各环节收敛成完整流程或生命周期。不要按模块清单、源码目录或功能列表平铺。

**每一步都要交代“为什么现在讲它”，让新增的机制显得必要，而不是功能罗列。** 检验方法是看某一段去掉后后文还能不能读懂：如果还能，说明它没落在问题链上，应当并入相邻环节，或压缩成就近的简短说明。

**设计类文章的重点是取舍。** 讲清每个机制解决谁的痛点、代价是什么、边界在哪里；配置项、字段名和函数名只在支撑取舍时出现，能用一句话说清就不铺开。

### 从要解释的问题确定重点

**先明确读者读完应该理解什么，再决定写哪些内容。** 判断本题是在解释使用方式、运行过程、内部机制还是方案选择，避免把相关概念都铺开。背景知识只补足理解所必需的部分；讲中断时先抓住进度如何保存，而不是从 Model / Agent / Runner 等通用概念讲起。

### 从材料中梳理因果关系

**阅读源码和文档是为了还原“为什么能工作”，而不是按原文目录或文件顺序转述。** 找出关键对象、状态、触发条件、处理动作和结果之间的联系，分清业务、框架与应用各自负责什么。先理解完整链路，再选择能支撑解释的材料；不要把函数清单、API 名称或宽泛概括当作机制说明。

**用户讨论中的猜测是待核对的问题，不是实现依据。** 源码问答的结论也要与所附代码相互核对；涉及计量和触发条件时，追到实际计算与判断的位置，不能只凭函数名或问答概括下结论。

### 按解释目标分配细节

**不同对象可以沿用同一种分析方法，但不必使用相同篇幅、代码粒度或结构。** 介绍框架用法时，重点是必要配置、关键接口以及调用后的运行过程；解释手写实现时，要展开使功能成立的数据结构、判断条件和状态更新。这里的粒度取决于文章目的；如果主题是框架内部原理，同样应深入其实现，不能只讲 API。

**设计思路类文章先提炼主流程，再决定哪些实现细节值得留下。** 正文直接讲机制，避免反复使用“源码显示”“材料展示”的解析口吻。特殊配置、补偿计算和兼容分支若不影响核心理解，可以省略或放在就近的简短说明中；简化后的公式或流程要注明是核心思路，不能冒充完整实现。讲存储时，先说清保存对象、位置、对应关系和格式，再补必要字段，不堆路径和函数清单。

### 让原则落到实际动作

**不能只列“需要保留什么”，还要让读者知道怎样从处理前变成处理后。** 说明何时触发、拿什么作输入、按什么条件处理、谁执行以及结果怎样用于下一步。模型参与整理时，交代提示词如何指导取舍、程序承担哪些规则；必要时给一个短提示词或前后对照，并区分实际实现与设计示例。

### 用词要能对应具体对象

**第一次出现容易混淆的概念时，用一个具体例子解释，并在正文、公式和图表中保持同一含义。** 例如“已写入历史”不等于“已被模型统计”；用于阈值比较的合计值，也不等于最近一次返回的 usage。优先使用读者能理解的名称，避免未经解释的“本地条目”“当前占用”等概括。公式中的每一项都应说明来源和作用，不为完整而塞入未解释的次要项。

### 让核心代码构成可读的逻辑链

**代码要足以说明关键行为，同时省去不影响理解的外围细节。** 只写“处理事件”不够，应露出决定行为的判断和后续处理；但不必为此粘贴整个函数。可以把分散在辅助函数里的相关片段拼接起来，使触发、处理和继续执行之间的关系直接可见。注明截取、拼接及重要省略，保持真实语义、执行顺序和边界，不因简化而暗示错误行为。

### 围绕共同机制取舍与合并

**不同案例若说明同一个机制，可以合并讲清共性，再用短例子交代差别。** 不因源码拆成多个函数，就把文档拆成多个章节；也不为追求简短而删掉解释机制必需的环节。正文说明代码背后的原因与约束，避免逐行复述代码；同一事实在不同位置出现时，应有新的解释作用。

### 根据要表达的关系选择呈现方式

**先确定读者需要看清什么，再选择段落、代码、图或表。** 因果解释适合文字，关键操作适合代码，参与者之间的交接适合时序图，字段或阶段的变化适合状态表。图不是越完整越好；过长、重复代码或需要大量滚动的图，应合并节点或换一种形式。表格也不必用于方案对比，它可以直接展示状态变化。

### 收束观点，妥善安放来源与边界

**总结只保留值得带走的认识，不重新复述整章，也不强制另设总结章节。** 限制条件放在影响理解的地方说明，不在结尾堆叠已有细节。实现结论就近链接源码；官方文档可在前面引出，也可放到文末参考文档，避免在章节收尾突然展开旁支知识。

**系列文章应让前一篇尚未解决的问题自然引出下一篇。** 共用基础概念优先链接已讲清的文章，避免重复铺陈；每篇仍要独立说清自己的核心问题。必要的争议记录和证据边界保留，但不反复打断主线。

### 仅在对象具有可比性且确有必要时对比

**只有竞品或相似事物、方案之间，才考虑通过对比回答具体问题。** 先确认它们解决的是可比较的问题，再选有意义的比较维度。引用多个项目、库或案例本身不是做对比的理由；是否对比取决于读者是否需要理解差异或作出选择。结尾也不固定要求提炼机制或比较方案，应服务于文章本身的问题。
