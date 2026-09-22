---
title: Knowledge Base Index
---

| 目录 | 内容 |
| --- | --- |
| [ai-agent](ai-agent/index.md) | AI Agent 应用开发与工程实践：面试题清单、多 Agent 设计对比、任务拆分与规划、系统提示词设计（指令作用域、计划状态与验证策略）、工具调用防护（大结果处理与重复检测）、模型调用错误处理与 Eino 重试故障转移，及「中断与恢复」子专题（含内部、外部与父子 Agent 中断恢复） |
| [claude-code](claude-code/index.md) | Claude Code 源码解析（DeepWiki 译文），按子系统整理其内部架构 |

## 错误处理与重试

| 文章 | 内容 | Updated |
| --- | --- | --- |
| [模型调用错误处理：策略设计与 Eino 实现](ai-agent/model-call-retry-and-fallback.md) | 第 44 题：参考 Codex / Claude Code 设计，用 Eino 实现分类重试与模型切换 | 2026-09-22 |

## 工具调用防护

| 文章 | 内容 | Updated |
| --- | --- | --- |
| [工具调用防护：大结果处理与重复检测](ai-agent/tool-call-guardrails.md) | 第 34、43 题：输出预算、按需读取与无进展调用的防护思路 | 2026-09-22 |
