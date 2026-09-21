---
title: 中断与恢复
updated: "2026-09-21"
order: 5
---

**中断恢复，是让任务的进度独立于当前执行它的进程。** 一次 Agent 执行（turn）被中途打断后，需要回答三个问题：运行时如何控制它停下、停下后留下什么、重新启动时如何接着推进。

**看两个产品怎么设计中断，会发现它们各自解决了一半问题。** Claude Code 的重点是「中断之后怎么找到用户」——subagent 的权限询问统一冒泡到主会话并标明来源，Esc 只拒绝该次工具调用，不打断主循环；Codex 的重点是「中断怎么表示成会话状态」——把中断铺到 turn 与 thread 两层，用 `Op::Interrupt`（结束 turn）、`SuspendTurnAndShutdown` / `RecoverTurn`（交接同一 turn）和 rollout 重建（恢复整个会话）支撑恢复。

下面先看专业产品的设计，再结合 Codex 学习存储与恢复机制，然后是内部 / 外部 / 多 agent 三种实现，最后是在中断之上做用户交互。

| 文章 | 内容 |
| --- | --- |
| [从 Codex 学习中断恢复的实现](codex-interrupt-recovery.md) | 先看整体恢复流程，再看存储、停止、恢复、并发与副作用边界 |
| [内部中断实现](internal-interrupt.md) | 工具主动请求输入：Eino `tool.Interrupt` 与手写 `Session` 状态机 |
| [外部中断实现](external-interrupt.md) | 应用 / 用户从外部暂停正在跑的循环：Eino `TurnLoop` |
| [多 Agent 中断实现](multi-agent-interrupt.md) | 中断沿调用链传播与恢复寻址：Eino `AgentTool` 与手写 `Frame` 栈 |
| [基于中断恢复的用户交互](user-interaction.md) | 追问与授权两种触发，交互统一到最外层 Agent |
