---
title: AI Agent
updated: "2026-09-22"
order: 1
---

**本目录整理 AI Agent 应用开发与工程实践**：原理、工具调用、上下文、任务规划、系统提示词与多 agent 设计，另含「中断与恢复」「上下文工程」子专题。

| 文章 | 内容 |
| --- | --- |
| [AI Agent 面试题清单（120 题）](interview-question-checklist.md) | 16 模块 120 题的面试准备清单 |
| [多 Agent 设计对比：Crush / Codex / Claude Code / Eino](multi-agent-design.md) | 预定义角色、触发、动态生成与交互方式对比 |
| [任务拆分与规划](task-planning.md) | 何时 / 如何拆、子任务契约、计划校验、出错与中途改目标 |
| [系统提示词设计](system-prompt-design/index.md) | 按模型要作的判断展开 Codex 提示词：环境与指令作用域、自主性与执行边界、计划、验证、交付与工具协议 |
| [工具调用防护：大结果处理与重复检测](tool-call-guardrails.md) | 截断、落盘与按需读取；调用指纹、进展判断和停止条件 |
| [模型调用错误处理：策略设计与 Eino 实现](model-call-retry-and-fallback.md) | Codex / Claude Code 错误恢复设计，以及 Eino 重试与故障转移配置 |
| [中断与恢复（子专题）](interrupt-resume/index.md) | 产品设计与内部 / 外部 / 多 Agent 中断实现（含用户交互） |
| [上下文工程（子专题）](context-engineering/index.md) | 请求组装、分层存储、预算与压缩、工具和约束完整性、任务状态与长期记忆 |
