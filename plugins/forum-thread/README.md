# forum-thread

Renders a `|>` / `|` block as a forum thread. A question opens a floor and
doubles as its collapsible title: the answers and any deeper 「楼中楼」 sub-floors
sit under it, with a single toggle at the right edge of the question.

## Syntax

A question opens a floor with `|>`, and its answers follow with `|`:

```
|> 父问题，支持 **加粗**、[链接](https://example.com) 与 `代码`
| 父问题的回答
```

Indent a reply by two spaces and it becomes a sub-floor of the question above:

```
|> 父问题
| 父回答
  |> 对回答的追问
  | 追问的回答
    |> 更深一层的追问
    | 更深一层追问的回答
  |> 同一层的另一个追问
  | 它的回答
```

Rules that matter:

- Each line is one post. A question (`|>`), plus the answer lines (`|`) under
  it, form one floor; several `|` lines in a row all join that floor.
- Depth is the leading indentation plus the extra bars: `|>` is depth 0, `  |>`
  and `||>` are depth 1, `    |>` and `|||>` are depth 2. The shallowest line in
  a block is normalised to depth 0.
- Each floor's question is its title. A small chevron at the right edge of the
  question toggles **only the sub-floors**; the answers always stay visible. It
  is a hidden checkbox, so no JavaScript is needed.
- The question sits in a light title band, with the collapse chevron at its
  right edge. Answers follow below it, sub-floors indent behind a thin guide
  rail, and several answers are split by a dashed rule. No frames, avatars or
  role tags.
- Leading spaces are described by `indentSize`; a tab counts as one level.
- Put the `>` immediately after the bars (`|>`, not `| >`), and keep the whole
  block as one paragraph — a blank line ends it.
- Inline Markdown inside a post is parsed as usual.
- The bar symbol must not be Markdown block syntax. `|` is safe; `#`, `>` and
  `-` at the start of a line are claimed by Markdown before this plugin runs.

Markdown drops a paragraph's indentation before the AST exists, so the plugin
reads it back from the raw source lines the paragraph spans; the bars, role and
inline body still come from the parsed AST.

## Options

```yaml
- source: "./plugins/forum-thread"
  options:
    bar: ["|", "｜", "│"]   # base depth marker
    question: [">", "＞"]    # marks a line as a question
    indentSize: 2            # spaces per nesting level
    collapsible: true        # wrap each floor in <details>
```

Both the full-width `｜` and the box-drawing `│` are accepted as bars by default,
and the full-width `＞` as a question mark.

## How it works

A `markdownPlugins` remark plugin walks the top level of the mdast, spots a
paragraph whose every line starts with a bar run and carries some structure (a
question, or more than one depth level), and rewrites it. Each line's depth is
`floor(indent / indentSize) + (bars - 1)`, read from the raw source line for the
indentation and from the AST for the bars. Lines are grouped into floors — a
question opens one, following same-depth answers join it, a deeper line nests
inside the current floor — and each floor becomes mdast carrying `data.hName` /
`data.hProperties`, so `remark-rehype` emits the floor, title, post and
sub-floors elements while the inline Markdown already parsed for each line flows
through untouched. The sub-floor toggle is a hidden checkbox driven purely by
CSS (`:has()`), so it needs no JavaScript. `styles.css` is inlined through
`externalResources` and scopes itself to `.markdown-rendered`.

## Wiring

Declared in `quartz.config.yaml` at order 54, after `centered-media`. It only
needs to run after the Markdown plugins it feeds from, so any order after
`obsidian-flavored-markdown` works.
