---
title: 中断与恢复
updated: "2026-09-21"
---

**本目录是「中断与恢复」子专题**：先看专业产品怎么做，再看内部 / 外部 / 多 agent 三种实现，最后是在中断之上做用户交互。

| 文章 | 内容 |
| --- | --- |
| [专业产品的中断设计](product-design.md) | Claude Code 把中断冒泡到主会话；Codex 把中断做成 turn / thread 两层状态 |
| [内部中断实现](internal-interrupt.md) | 工具主动请求输入：Eino `tool.Interrupt` 与手写 `Session` 状态机 |
| [外部中断实现](external-interrupt.md) | 应用 / 用户从外部暂停正在跑的循环：Eino `TurnLoop` |
| [多 Agent 中断实现](multi-agent-interrupt.md) | 中断沿调用链传播与恢复寻址：Eino `AgentTool` 与手写 `Frame` 栈 |
| [基于中断恢复的用户交互](user-interaction.md) | 追问与授权两种触发，交互统一到最外层 Agent |
