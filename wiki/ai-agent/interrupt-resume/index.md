---
title: 中断与恢复
updated: "2026-09-22"
order: 6
---

**中断恢复，是让任务的进度独立于当前执行它的进程。** 一次 Agent 执行（turn）被中途打断后，需要回答三个问题：运行时如何控制它停下、停下后留下什么、重新启动时如何接着推进。

**看两个产品怎么设计中断，会发现它们各自解决了一半问题。** Claude Code 的重点是「中断之后怎么找到用户」——subagent 的权限询问统一冒泡到主会话并标明来源，Esc 只拒绝该次工具调用，不打断主循环；Codex 的重点是「中断怎么表示成会话状态」——把中断铺到 turn 与 thread 两层，用 `Op::Interrupt`（结束 turn）、`SuspendTurnAndShutdown` / `RecoverTurn`（交接同一 turn）和 rollout 重建（恢复整个会话）支撑恢复。

下面先看专业产品的设计，再结合 Codex 学习存储与恢复机制，然后是内部 / 外部 / 多 Agent 三种实现；用户交互随中断与恢复流程一起说明。

| 文章 | 内容 |
| --- | --- |
| [从 Codex 学习中断恢复的实现](codex-interrupt-recovery.md) | 先看整体恢复流程，再看存储、停止、恢复、并发与副作用边界 |
| [内部中断实现](internal-interrupt.md) | 以笔记助手为例：追问与授权交互、Eino 接入流程，手写 Session 与恢复协议 |
| [外部中断实现](external-interrupt.md) | 从 TurnLoop 基本用法理解 Stop、Wait，以及 checkpoint 暂停恢复 |
| [多 Agent 中断实现](multi-agent-interrupt.md) | 子级中断时保留父级委派：AgentTool 桥接、Frame 栈与结果回填 |
