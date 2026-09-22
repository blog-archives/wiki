---
title: 工具调用
updated: "2026-09-22"
tags:
  - tool-call
order: 5
aliases:
  - ai-agent/tool-call-guardrails
---

**工具调用要回答的是：模型怎样拿到工具、一次调用怎样被执行、执行结果又怎样回到上下文。** 工具定义要占用上下文，因此不是所有工具都预先展示；模型需要时先发现，再发起调用，调用由注册表统一分发，结果体积与重复行为再分别处理。

下面按一次调用的时间顺序展开：先把工具注册成集合，工具多时按需发现并分发；再看执行结果过大时如何减量，以及怎样判断反复调用是否还有进展。

| 文章 | 内容 |
| --- | --- |
| [工具发现与调用：从工具注册到执行分发](tool-discovery-and-dispatch.md) | 工具注册、延迟暴露、tool_search / BM25 检索与 dispatch 管线 |
| [工具调用大结果处理](large-tool-result-handling.md) | 截断、落盘与按需读取，控制进入上下文的内容 |
| [重复工具调用的检测](repeated-tool-call-detection.md) | 调用指纹、进展判断与停止条件，避免无进展循环 |
