---
title: Knowledge Base Index
---

## ai-agent

AI Agent 应用开发与工程实践（原理、工具调用、上下文、RAG、评测、安全、Go 工程等）。

| Article | Summary | Updated |
|---------|---------|---------|
| [AI Agent 面试题清单（120 题）](ai-agent/interview-question-checklist.md) | Go/后端转 AI Agent 的 16 模块 120 题面试准备清单，含 40 道优先题分布 | 2026-09-20 |
| [多 Agent 设计对比：Crush / Codex / Claude Code / Eino](ai-agent/multi-agent-design.md) | 四项目对多 agent 的预定义角色、触发、动态生成、交互方式对比，含 Eino 两种写法（AgentTool / DeepAgent）的 demo、运行逻辑与选型 | 2026-09-20 |
| [任务拆分与规划](ai-agent/task-planning.md) | 何时/如何拆、拆成步骤还是子 agent；子任务契约（Codex 有 JSON 协议，Crush/CC 靠 LLM）；计划质量校验；澄清·假设·停止；意图识别与路由；出错后的重试/替换/重规划；中途改目标的 steer/排队/中断 | 2026-09-20 |
| [系统提示词设计](ai-agent/system-prompt-design.md) | 以 Codex CLI 提示词为样本：身份/工作方式/工具三层结构，指令优先级、计划状态机、验证分层、输出格式规范四类可借鉴写法 | 2026-09-20 |

## claude-code

Claude Code 源码解析（DeepWiki 译文），按子系统整理其内部架构。

| Article | Summary | Updated |
|---------|---------|---------|
| [Claude Code 核心系统](claude-code/claude-code-core-systems.md) | DeepWiki《Core Systems》译文：整体架构与请求流程，及 Agent/工具/权限/上下文/Hook/MCP/插件/Skill/沙箱/UI 十大子系统 | 2026-09-21 |
