---
title: 工具调用大结果的处理：截断与落盘（Codex / Crush / Claude Code）
updated: "2026-09-22"
order: 5
---

> 本文整理自 [DeepWiki 关于 Codex / Crush / Claude Code 工具调用大结果处理的问答原文](../../raw/2026-09-22-091325.md)。

**工具结果可以任意大，模型上下文不能。** 当一次工具调用返回十万行日志或一个几十 KB 的网页时，agent 必须决定哪些字节进入上下文、剩下的放到哪里。答案分两派——**就地截断** 只留一段并打上标记、原始数据丢弃，**落盘 + 引用** 保留完整副本、只把预览和路径交给模型。架构上三者都没有一个强制所有工具输出经过的截断中间件，而是共享少量原语、由各工具自行调用。

| 产品 | 主导策略 | 触发位置 | 截掉的数据能否取回 |
| --- | --- | --- | --- |
| Codex | 就地截断（多层） | 模型输入、事件/rollout 存储、Code Mode | 基本不能；唯一例外是 exec 结果在内存里留了原始字节 |
| Crush | 按工具定制：网页落盘、`fetch` 硬截断、`view` 报错 | 各工具自己的 handler | 落盘的可读回；硬截断/报错的不能 |
| Claude Code | 落盘 + 截断预览 + 文件引用 | 按工具类型（Bash/Task/MCP） | 可以，模型按文件路径读回完整内容 |

## Codex：多层就地截断

核心原语是 `TruncationPolicy`（`Bytes(n)` / `Tokens(n)`）与 `truncate_text`，但截断不收在调度层，而是分散到几条路径各自决定。**MCP 结果在写入事件/rollout 存储前压成文本预览**，并清空 `structured_content` 和 `meta`（app-server 会从这个事件重建工具调用，不能让几 MB 结果落进存储）：

```rust
let truncated = truncate_text(
    &serialized,
    TruncationPolicy::Bytes(MCP_TOOL_CALL_EVENT_RESULT_MAX_BYTES),
);
Ok(CallToolResult {
    content: vec![serde_json::json!({ "type": "text", "text": truncated })],
    structured_content: None,
    is_error: call_tool_result.is_error,
    meta: None,
})
```

**Shell 输出在格式化成模型文本时截断**（`format_exec_output_for_model`，十万行测试输出截到约一万字符）。**Code Mode 的预算由 `ToolCall::response_byte_budget` 按来源区分**：直接调用受宿主文本输出额度限制，Code Mode 收到 typed results 只受工具自身限制——这是最接近「统一入口」的设计，但它只提供预算数值。**TUI dynamic tools 则按优先级迭代丢弃**：先删旧 items、再 pop 多余 threads、再删冗余字段，仍超限才把 `max_chars` 减半强制截断。

## Crush：按工具定制的落盘与限额

每个工具在自己的 handler 里判断大小。网络抓取类 **落盘 + 让 agent 自己读**：网页超过 `LargeContentThreshold`（约 50KB）时写入临时文件，只把路径和一句指引交给模型：

```go
hasLargeContent := len(content) > LargeContentThreshold
if hasLargeContent {
    tempFile, _ := os.CreateTemp(workingDir, "page-*.md")
    // ... 写入 content ...
    fmt.Fprintf(&result, "Content saved to: %s\n\n", tempFilePath)
    result.WriteString("Use the view and grep tools to analyze this file.")
}
```

`agentic_fetch` 同一思路。**普通 `fetch` 走硬截断**（`MaxFetchSize` 100KB，`io.LimitReader` 限制读取）；**`view` 宁可报错也不截断**（截取片段超出 `MaxViewSize` 直接返回 `"Content section is too large"`）。UI 层对 diff 的折叠截断只影响展示，不碰底层数据。

## Claude Code：落盘优先，文件引用取回

据 `CHANGELOG.md` 记录的演进：超过 50K 字符的工具结果持久化到磁盘（此前阈值 100K），存盘结果有 **1 GB 上限**；后来大型 bash 与工具输出都从截断改为存盘，让模型按文件引用读取完整内容。阈值按工具类型配置——`bashOutputMaxChars` / `taskOutputMaxChars`（最多 128K），后台任务溢出截断到 30K 并附路径，MCP 二进制按 MIME 解码存盘。这些是产品行为记录，核心实现不在已索引的源码里。

## 统一入口还是各自处理

**三者都没有强制所有工具输出经过的截断中间件。** Codex 共享得最多——所有输出实现同一个 `ToolOutput` trait，但 **trait 本身不强制截断**，只规定接口形状，是否截由每个实现决定。Crush 共享得最少，各工具常量与判断分别定义，唯一跨工具点是处理模态（而非大小）的 `workaroundProviderMediaLimitations`。Claude Code 引擎侧有一条统一的 `tool.call → next → core → PostToolUse` 事件管道（洋葱模型，hook 可环绕拦截），但大结果处理仍按工具类型定制。

## 被截断的数据还能取回吗

**就地截断基本不可逆。** Codex 的 MCP 事件截断清空结构化字段、Code Mode 嵌套调用只记录原始字节数与上限，都不保留内容；唯一保留原始字节的 `ExecCommandToolOutput.raw_output` 只活在单次调用的返回对象里，没有重新获取的 API；`chunk_id` 轮询读到的是进程 **新产生** 的输出，不是被裁掉的历史。**落盘 + 引用则把取回变成常规操作**：Crush 让 agent 用 `view`/`grep` 读临时文件，Claude Code 让模型按文件路径读回完整输出——牺牲一次上下文的即时性，换取完整数据的可检索性。

## 小结

**设计轴是「丢内容还是丢上下文」**：就地截断省事但信息永久丢失，落盘 + 引用保留完整数据但多一次读写与一次模型主动读取；Codex 偏前者，Crush 与 Claude Code 转向后者。而「什么算大、超出后怎么处理」高度依赖工具语义，因此 **统一拦截不如把策略下沉给各工具**。

## See Also

- [AI Agent 面试题清单（120 题）](interview-question-checklist.md) — 模块 05「工具调用与工具设计」的 034 题正好问工具结果的数据量很大时如何兼顾可用性与 Token 成本。
- [任务拆分与规划](task-planning.md) — 子任务的输入输出契约里，工具结果字段与格式的取舍。
