---
title: 多 Agent
updated: "2026-09-23"
tags:
  - multi-agent
  - sub-agent
  - openai-codex
  - anthropics-claude-code
  - charmbracelet-crush
  - cloudwego-eino
order: 2
aliases:
  - ai-agent/multi-agent-design
---

**多 Agent 要回答的是：什么时候把一个任务交给若干子 agent，以及子 agent 从哪里来、由谁调度。** 这里的角色是预先定义的能力包——提示词、工具权限、模型，任务才是运行时生成的内容；角色定边界，任务定本次做什么。

**共同底线是角色预先定义、不会由模型凭对话内容凭空发明。** 新增角色的入口都在代码侧，无论是硬编码、配置还是插件注册；模型只能在已有类型池里选型，再自定义这次的任务。委派一律通过工具调用（agent-as-tool / spawn），子 agent 拿精简上下文、只回传结论；能力隔离靠工具白名单或角色定义，防止无限膨胀则靠并发与执行限流。

**触发方式分两类。** 一类是静态编排：命令或工作流把「开几个 agent、各查什么」写死在流程里，一调用就必然执行。另一类是模型动态派生：引擎把可选 agent 连同各自的 `description` 呈现给模型，由模型在运行时判断要不要委派、派给谁。真实产品往往两层并存。

## 产品怎样使用多 agent

Crush、Codex、Claude Code 是三个已经跑起来的 agent 产品，多 agent 是它们内部的组织方式。下表比较它们各自预定义了什么角色、怎么触发、能否动态生成、怎样委派。

| 项目 | 预定义角色 | 触发 | 动态生成 | 委派交互 |
|---|---|---|---|---|
| Crush | coder（全工具主编码）、plan（只读 + 委派，出计划不改文件）、task（只读检索子代理） | coder 启动即主 agent；plan 由用户切换；task 由主 agent 调 `agent` 工具按需派生 | 角色固定，唯一例外是 `agentic_fetch` 现造临时检索子 agent，角色也写死 | 子 agent 在独立子 session 中运行，只接收委派时的 prompt、只回传文本，不共享主 agent 历史；coder / plan 互斥切换、彼此不调用 |
| Codex | default（兜底）、explorer（代码库问答）、worker（编码执行）；awaiter 已下线 | 先看全局开关，再做两级限流——生成名额（能否再 spawn）与执行名额（同时运行的子 agent 回合数）分离管控 | 角色静态、任务动态：角色集合可配置扩展，但不运行时生成 | spawn 工具生成子 agent，运行时由注册表追踪实例（角色 / 昵称 / 路径） |
| Claude Code | general-purpose、Explore、Plan（另有 `fork`），插件再按工作流附带一组 | Agent 工具的 `subagentType` 派发，该值必须命中已注册定义，否则拒绝派生 | 插件可运行时注册新类型；工作流数量可按配置动态决定 | Agent 工具 + `subagentType`；hook 在子代理内触发时附带 `agent_type` |

**三个产品的主要差异在「角色的来源有多开放」**：Crush 写死 → Codex 用户可配置 → Claude Code 插件可运行时注册。交互方式则高度一致，都是「主 agent 通过工具委派子 agent，子 agent 回传结果」。

## 框架怎样支持开发者搭建多 agent

Eino 和上面三个不在同一层面——**它是用 Go 开发 agent 的框架，本身不是 agent 产品**。因此对 Eino 谈「预定义了哪些 agent、谁触发」并不贴切；它提供的是一组原语，让开发者在自己的 agent 里拼出多 agent 结构：把任意 `Agent` 用 `adk.NewAgentTool` 包成普通工具挂到父 agent 上，或者用 `DeepAgent` 的 `SubAgents` + `task` 工具按名路由。角色的数量和内容由开发者决定，运行时由模型在这些候选里动态选型派发。

[用 Eino 动态创建与调度子 Agent](eino.md) 展开这套机制；[Claude Code 多 Agent：设计与使用](claude-code.md) 是产品侧的样例，看插件静态编排与引擎动态派生两条路线。

## 阅读顺序

| 文章 | 内容 |
| --- | --- |
| [Claude Code 多 Agent：设计与使用](claude-code.md) | 并行审查与交叉验证、静态编排 vs 模型动态决定、`AgentSpec` 与预提供 agent |
| [用 Eino 动态创建与调度子 Agent](eino.md) | `AgentTool` 与 `DeepAgent` 的 `task` 工具、动态选派的实现与边界 |
