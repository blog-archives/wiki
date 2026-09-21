---
title: Knowledge Base Index
---

## ai-agent

AI Agent 应用开发与工程实践（原理、工具调用、上下文、RAG、评测、安全、Go 工程等）。

| Article | Summary | Updated |
|---------|---------|---------|
| [AI Agent（目录入口）](ai-agent/index.md) | 目录导航：面试题清单、多 Agent 设计对比、任务拆分与规划、系统提示词设计，及「中断与恢复」子专题 | 2026-09-21 |
| [AI Agent 面试题清单（120 题）](ai-agent/interview-question-checklist.md) | Go/后端转 AI Agent 的 16 模块 120 题面试准备清单，含 40 道优先题分布 | 2026-09-20 |
| [多 Agent 设计对比：Crush / Codex / Claude Code / Eino](ai-agent/multi-agent-design.md) | 四项目对多 agent 的预定义角色、触发、动态生成、交互方式对比，含 Eino 两种写法（AgentTool / DeepAgent）的 demo、运行逻辑与选型 | 2026-09-21 |
| [任务拆分与规划](ai-agent/task-planning.md) | 何时/如何拆、拆成步骤还是子 agent；子任务契约（Codex 有 JSON 协议，Crush/CC 靠 LLM）；计划质量校验；澄清·假设·停止；意图识别与路由；出错后的重试/替换/重规划；中途改目标的 steer/排队/中断 | 2026-09-20 |
| [系统提示词设计](ai-agent/system-prompt-design.md) | 以 Codex CLI 提示词为样本：身份/工作方式/工具三层结构，指令优先级、计划状态机、验证分层、输出格式规范四类可借鉴写法 | 2026-09-20 |

### 子专题：中断与恢复（interrupt-resume）

中断与恢复专题：产品怎么做、内部 / 外部 / 多 agent 怎么实现、以及在其上做用户交互。

| Article | Summary | Updated |
|---------|---------|---------|
| [中断与恢复（子专题入口）](ai-agent/interrupt-resume/index.md) | 子专题导航：专业产品的中断设计 → 内部 / 外部 / 多 Agent 实现 → 基于中断恢复的用户交互 | 2026-09-21 |
| [专业产品的中断设计](ai-agent/interrupt-resume/product-design.md) | Claude Code / Codex 的中断设计：subagent 权限询问冒泡到主会话 + `agentId` 归属、`agent_needs_input`、`AskUserQuestion`；Codex 的 `Op::Interrupt`（结束 turn）、`SuspendTurnAndShutdown`/`RecoverTurn`（保住 turn）、rollout 重建与挂起持久化 | 2026-09-21 |
| [内部中断实现](ai-agent/interrupt-resume/internal-interrupt.md) | 工具主动请求输入：中断是控制信号（副作用放中断点之后）、Eino `tool.Interrupt`/`GetResumeContext`/`ResumeWithParams` 与 checkpoint、不用框架手写 `Session` 状态机 | 2026-09-21 |
| [外部中断实现](ai-agent/interrupt-resume/external-interrupt.md) | 应用 / 用户从外部暂停正在跑的循环：Eino `TurnLoop`（`Stop`/`WithGracefulTimeout`、`GenInput`/`GenResume`、`TurnLoopExitState`、抢占）与安全点边界 | 2026-09-21 |
| [多 Agent 中断实现](ai-agent/interrupt-resume/multi-agent-interrupt.md) | 嵌套调用链上的中断传播与恢复寻址：Eino `NewAgentTool` 逐层上传 + `InterruptCtx.Address`；手写版用 `Frame` 栈（`subAgentTool` 委派、`accept` 压栈、`Resume` 重进栈顶、`address()` 仅展示） | 2026-09-21 |
| [基于中断恢复的用户交互](ai-agent/interrupt-resume/user-interaction.md) | 在中断/恢复之上做用户交互：追问（模型决定）与授权（应用规则）两种触发、交互统一到最外层 Agent、交互入口与业务解耦 | 2026-09-21 |

## claude-code

Claude Code 源码解析（DeepWiki 译文），按子系统整理其内部架构。

| Article | Summary | Updated |
|---------|---------|---------|
| [Claude Code 核心系统](claude-code/index.md) | DeepWiki《Core Systems》译文：整体架构与请求流程，及 Agent/工具/权限/上下文/Hook/MCP/插件/Skill/沙箱/UI 十大子系统 | 2026-09-21 |
| [Claude Code 的 Agent 系统与 Subagents](claude-code/agent-system-and-subagents.md) | DeepWiki《Agent System & Subagents》译文：层级化任务拆分、Task 工具与参数、agent 定义文件、后台执行与生命周期 Hook、Feature Development 多 agent 工作流、worktree 隔离、上下文与记忆管理 | 2026-09-21 |
