---
title: 工具发现与调用：从工具注册到执行分发
updated: "2026-09-22"
tags:
  - tool-call
  - tool-registry
  - tool-search
  - bm25
  - openai-codex
order: 1
---

> 本文根据 DeepWiki 的 [Codex 工具发现与调用问答](../../raw/2026-09-22-225255.md)整理，沿着「工具定义怎样进入请求 → 工具太多时怎样按需发现 → 模型发出调用后怎样分发」这条链路，看 Codex 的工具注册、检索与调度机制。

## 工具集合在调用模型前怎样构建

**模型能调用的工具，先要在会话里注册成一份工具集合。** 每轮开始前，`build_tool_router()` 汇总 MCP、动态工具、扩展工具等来源，生成 `ToolRegistry` 与 `ToolRouter`；随后 `finalize_tool_router()` 在注册表基础上做最终整理：过滤不在策略内的 `hosted_specs`、应用命名空间覆盖，并根据工具模式决定是否启用 Code Mode / Tool Search。

动态工具经 `append_dynamic_tool_runtimes`、扩展工具经 `append_extension_tool_executors` 注册进注册表。注册表保存可调用的运行时，路由器保存这些工具对外可见的规格；[上下文组装](../context-engineering/context-assembly.md)里的 `Prompt.tools` 正来自 `ToolRouter.model_visible_specs()`，模型实际只会看到其中一部分。

**哪些工具对模型可见，是这一层做的取舍。** 工具定义要占用上下文，工具越多、定义越长，留给任务本身的空间越少。于是注册与暴露分开：工具都可以注册，但不一定都预先展示给模型。

## 工具太多时：延迟暴露与 tool_search

**一个直接的省上下文做法，是把一部分工具标记为延迟暴露（deferred），不预先放进模型可见定义。** 代价是模型默认看不到它们，需要一条发现路径。

`finalize_tool_router()` 里有一个条件：只要注册表里存在「被延迟暴露、且带有检索信息」的工具，就注册 `tool_search` 工具；同时会移除与它同名或占用同一命名空间的直接工具，避免模型看到两个入口。

```rust
let tool_search_name = ToolName::plain(TOOL_SEARCH_TOOL_NAME);
if search_tool_enabled(turn_context, model_info)
    && registry.entries().any(|tool| {
        tool.runtime.tool_name() != tool_search_name
            && tool.exposure.is_deferred()
            && tool.runtime.search_info().is_some()
    })
{
    // 移除直接展示的同名 / 同命名空间工具，注册 tool_search 执行器
    append_tool_search_executor(turn_context, &mut registry, tool_search_handler_cache);
}
```

**延迟暴露是代码侧的决定，是否搜索留给模型。** 代码只负责把某些工具藏起来，制造出「必须搜索才能拿到」的场景；是否发起搜索、搜什么，由模型自己判断。

## 模型怎样发现被隐藏的工具

**`tool_search` 是一个普通的模型可调用工具，只是它的结果不是业务数据，而是工具规格。** 它的 spec 由 `create_tool_search_tool` 生成，参数只有两个：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `query` | string，必填 | 检索 deferred 工具的查询 |
| `limit` | number，可选 | 返回数量上限，默认取 `TOOL_SEARCH_DEFAULT_LIMIT`，测试断言为 8 |

**模型决定是否调用的依据，是工具描述本身。** 生成的描述说明它用 BM25 检索被延迟的工具元数据，并把匹配到的工具暴露给下一次模型调用：

> Searches over deferred tool metadata with BM25 and exposes matching tools for the next model call.

描述里还会提示有些工具没有预先提供、需要用它搜索，并列出当前可搜索的来源（如已连接的 MCP 服务器）。材料没有在代码里找到强制搜索的路由逻辑，这一步是提示词驱动。

**模型返回的是 `ResponseItem::ToolSearchCall`，不是普通函数调用。** 当 `execution == "client"` 时，`ToolRouter::build_tool_call` 把它解析成内部 `ToolCall`：参数反序列化为 `SearchToolCallParams`（即 `query` / `limit`），`tool_name` 固定为 `tool_search`。

## BM25 检索与索引内容

**检索本身是一次关键词全文匹配，不是向量语义搜索。** `handle_call` 校验 `query` 非空、`limit` 大于零后，调用 `search_engine.search(query, limit)`。搜索引擎在构建时建立索引：把每个带检索信息的工具生成一段 `search_text`，作为一篇文档交给 `bm25` crate。

```rust
let documents: Vec<Document<usize>> = search_infos
    .iter()
    .map(|search_info| search_info.entry.search_text.clone())
    .enumerate()
    .map(|(idx, search_text)| Document::new(idx, search_text))
    .collect();
let search_engine =
    SearchEngineBuilder::<usize>::with_documents(Language::English, documents).build();
```

**BM25（Best Matching 25）是 TF-IDF 家族的一种排序算法**，按词频和文档长度给「查询与文档」的相关性打分，返回得分最高的前 N 篇。这里文档 id 就是工具在 `search_infos` 中的下标，检索结果据此找回对应工具。

**能检索到什么，取决于 `search_text` 怎么拼。** `default_tool_search_text` 会把工具名、把下划线换成空格的名字、描述，以及参数 schema 中每个属性的名称与描述拼成一段文本。因此匹配更接近关键词或片段命中：工具描述和参数名里出现的词，才可能被查询召回。

**参与索引的是被延迟暴露的工具，且会缓存复用。** `ToolSearchHandlerCache::get_or_build` 遍历注册表中标记为 `Deferred` 的条目，动态工具取 `search_info()`，内建 / MCP 工具取 `immutable_spec()`；来源相同时复用同一个 handler，避免重复建索引。

## 检索结果怎样回到模型

**检索返回的是「可加载的工具规格」，供下一次模型调用使用。** 命中的工具经 `search_output_tools` 转成 `LoadableToolSpec`，并用 `coalesce_loadable_tool_specs` 把同一命名空间下的多个工具合并成一个 `Namespace`。例如两个来自 `mcp__calendar` 的工具会被合并进同一个 namespace 返回，模型看到的是一个带多个函数的命名空间，而不是两条孤立结果。

端到端测试里，模型先发出带 `query` / `limit` 的 `tool_search` 调用，系统返回 `codex_app` 命名空间下的 `automation_update`，模型随后据此发出真正的 `function_call`。这条时间线也说明：发现完成之后，调用才会进入执行管线。

## 模型发出调用之后：从 ToolCall 到分发

**工具无论来自预先展示还是刚刚搜索，调用都走同一条路：先转成内部 `ToolCall`，再交给注册表统一调度。** 模型返回 `function_call` 后，`ToolRouter::build_tool_call()` 把线上调用转成 `ToolCall`（`tool_name` / `call_id` / `payload`），再由 `dispatch_tool_call_with_code_mode_result_inner` 补齐会话、步骤、取消令牌等信息，组装成 `ToolInvocation`，最终交给 `ToolRegistry::dispatch_any_with_state`。

**`dispatch_any_with_state` 的顺序，基本就是一次工具执行的完整检查点：**

| 顺序 | 动作 | 失败或分支 |
| --- | --- | --- |
| 1 | 按 `tool_name` 找运行时 `self.tool(&tool_name)` | 找不到 → `unsupported call`，回给模型 |
| 2 | 校验 payload 类型 `matches_kind` | 不匹配 → `incompatible payload`，视为 Fatal |
| 3 | 执行 `run_pre_tool_use_hooks` | 可被 `Blocked` 阻断，或用 `updated_input` 改写参数 |
| 4 | 非 MCP 工具调用 `notify_tool_start` | 只做开始通知 |
| 5 | `handle_any_tool` 调用 `tool.handle(invocation)` | 得到 `AnyToolResult` |
| 6 | 运行 `run_post_tool_use_hooks` | 记录 analytics、otel 等遥测 |

把关键判断拼在一起，大致是这样的顺序（省略错误处理与遥测分支）：

```rust
let tool = match self.tool(&tool_name) {
    Some(tool) => tool,
    None => return Err(/* unsupported call，回给模型 */),
};
if !tool.matches_kind(&invocation.payload) {
    return Err(/* incompatible payload */);
}
// run_pre_tool_use_hooks：Blocked 则终止，Continue { updated_input } 则改写参数
if tool.mcp_server_name().is_none() {
    notify_tool_start(&invocation, /*mcp_tool*/ None).await;
}
let output = tool.handle(invocation.clone()).await?;
// run_post_tool_use_hooks + analytics / otel
```

**这个顺序把「工具是否存在、参数是否对得上、是否被拦截」都放在真正执行之前。** 前两步失败会记录失败的 trace 并返回；pre-hook 的 `Blocked` 还会先通知调用结束，避免外部认为工具已经开始执行。

## 沙箱脚本的嵌套调用与轨迹

**调用者不一定是模型本身。** 在 Code Mode 下，沙箱脚本可以调用工具，调度循环通过 `DispatchMessage::InvokeTool` 处理这类请求：先等待对应 cell 就绪，再 `tokio::spawn` 异步执行。同一条分发管线因此同时被模型调用和脚本内调用复用。

**每次分发都可以留下轨迹。** `rollout-trace` 的 `record_started` 写入 `ToolCallStarted` 事件，其中 `requester` 区分调用来自模型还是 code cell，工具类型由 `dispatched_tool_kind` 归类（如 `exec_command`、`apply_patch`、`web_search`、`spawn_agent` 等），并记录调用 id 与输入预览。

## 边界与证据范围

**搜索是关键词检索。** BM25 不依赖向量嵌入或语义相似度，召回质量取决于 `search_text` 是否覆盖工具名、描述和参数字段；换个说法查询可能匹配不到。

**是否搜索由模型判断。** 代码侧只控制哪些工具被标记为 `Deferred`，使它们对模型不可见、必须搜索才能发现；没有强制路由逻辑。

**Apps / Connectors 另有描述模板。** 存在 `search_tool/tool_description.md` 用于渲染面向 Apps 的 `tool_search` 描述，它与 `create_tool_search_tool` 生成的主流程描述如何拼接，材料未展开。

**材料没有 commit 或会话原始 URL。** 本文的代码结论以所附片段为准；只出现在问答转述中、没有片段支撑的环节不再展开。

相关：[上下文组装](../context-engineering/context-assembly.md)解释工具定义怎样进入请求；[工具调用大结果处理](large-tool-result-handling.md)处理执行后的结果体积，[重复工具调用的检测](repeated-tool-call-detection.md)判断是否还有进展；[系统提示词：验证、交付与工具](../system-prompt-design/verification-delivery-and-tools.md)讲工具规范怎样表达。本文对应面试题第 029、031 题，以及第 066 题中「一次工具发现与调用经过哪些环节」的部分。
