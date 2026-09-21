---
title: 专业产品的中断设计
updated: "2026-09-21"
---

> 本文整理自 DeepWiki 关于 openai/codex 与 anthropics/claude-code 的问答，存档见 [raw/2026-09-21-165330.md](../../raw/2026-09-21-165330.md) 与 [raw/2026-09-21-142646.md](../../raw/2026-09-21-142646.md)。

## Overview

**看两个产品怎么设计中断，会发现它们各自解决了一半问题。** Claude Code 的重点是「中断之后怎么找到用户」——把 subagent 的中断统一冒泡到主会话并标明来源；Codex 的重点是「中断怎么表示成会话状态」——把中断铺到 turn 与 thread 两层，用 checkpoint 和 rollout 支撑恢复。这一篇看设计层面，具体怎么写见[内部中断实现](internal-interrupt.md)、[外部中断实现](external-interrupt.md)与[多 Agent 中断实现](multi-agent-interrupt.md)。

## 一、Claude Code：中断统一冒泡到主会话

**subagent 没有自己独立的用户输入通道。** 后台 subagent 触发权限询问时，提示冒泡到主 session，并标明是哪个 agent 在问；Esc 只拒绝该次工具调用，不打断主循环。归属之所以标得出来，靠的是 spawn 时记录的 `AgentSpawnInput.parentAgentId`、`AgentInfo` 的 `parentId` / `spawnedBy` / `name`，以及 `AgentSpawnResult.agentId`。

### 权限决策链路

引擎级的流水线是 `tool.call` → `tool.check` → `PermissionRequest` hook → `PermissionBehavior`：`tool.check` 在判定 `ask` 之前先跑完 `PreToolUse` hooks，最终归约为 `allow` / `deny` / `ask` 三态，`ask` 才走到 UI 弹窗。**这条链路不区分调用方是主 agent 还是 subagent**，所以 subagent 的 `ask` 自然落到主 session 的弹窗上。

### 除同步弹窗外的两条路

- **异步通知**：后台 agent 通过 `Notification` hook 上报 `agent_needs_input`，用户在 `claude agents` 面板主动切过去回应，不阻塞主循环。
- **结构化提问**：`AskUserQuestion` 对话框用于选择题，同样由 UI 层统一呈现，可配置 idle 超时。

## 二、Codex：中断是会话状态的一部分

**Codex 把中断铺到了 turn 和 thread 两层。** 按粒度从小到大有三种：

| 粒度 | 机制 | 触发场景 | 恢复后 |
| --- | --- | --- | --- |
| 中断当前 turn | `Op::Interrupt` | 用户主动停止 | 写 `TurnAborted`，turn 终止；下次输入开新 turn |
| 挂起 / 接管同一 turn | `Op::SuspendTurnAndShutdown` + `Op::RecoverTurn` | worker 间转移 | 不写终止事件，用原 `turn_id` 继续 |
| 重建整会话 / 子代理 | rollout 文件 + `resume_*_from_rollout` | 进程重启、子代理被关闭 | 重新 spawn `Session`，历史完整但进程内状态丢失 |

**`Op::Interrupt` 是「结束这个 turn」，不是「保住这个 turn」。** 中断不等于丢弃进度：`Turn` 完成时模型最后的 `response_id` 会存进 `Session`，并通过 `EventMsg::TurnComplete` 返回 UI，供下次续接或从更早位置 fork。

**中间那层的目的不是「停下来给用户」，而是「把 turn 交出去」。** `suspend_turn_and_shutdown` 把正在运行的 root turn 冻结（只对根线程开放），步骤是：先 flush 再取消（取消失败也保住原 worker）、取消 task 但不写 `TurnAborted`、清掉内存等待者、再 flush 并关闭 rollout writer（避免双写冲突）、返回 `SuspendTurnOutcome::Suspended { turn_id }`。恢复入口 `recover_turn_if_idle` 仅在线程 idle 时尝试，用保存的 `turn_id` 匹配 `reference_context_item` 取回原 `root_turn_id`，再以 `TurnStartKind::Recovery` 重新驱动。

**最粗的一层是 rollout 重建。** Codex 把会话事件持久化成 rollout（JSONL）文件，恢复时解析成 `InitialHistory` 再 spawn 新的 `Session`；多代理时每个子代理是独立线程，按 `thread_id` 恢复并重建 `agent_path` / `agent_role` / `agent_nickname` 元数据（见[多 Agent 中断实现](multi-agent-interrupt.md)）。App Server 层的 resume 幂等，线程仍在运行且配置未变就复用。`InitialHistory::Forked` 则从历史断点分叉出新线程。

### 挂起时到底持久化了什么

**真正落盘的只有 rollout 历史；`turn_id` 只是调用方手里的句柄，内存等待者明确不保存。**

| 内容 | 是否持久化 | 位置 / 机制 |
| --- | --- | --- |
| 完整对话历史（`ResponseItem` 等） | 是 | rollout 文件，`live_thread.flush()` 落盘 |
| `turn_id` | 间接（随 rollout 的 turn context 一起） | `task.turn_context.sub_id` |
| `root_turn_id`（会话树归属） | 是 | `reference_context_item`，恢复时按 `turn_id` 过滤取出 |
| rollout writer 状态 | 是（关闭动作即交接信号） | flush + shutdown，避免双写 |
| 排队的用户输入 / 审批等待者 | 否，best effort 丢弃 | 仅内存态 |
| `TurnAborted` / `TurnComplete` | 否 | 与 `Op::Interrupt` 的核心区别 |

## 三、两点对照

- **中断的归属**：Claude Code 用 `agentId` 让弹窗说清「谁在问」；Codex 用 `turn_id` / `thread_id` + `agent_path` 定位到具体执行。
- **中断的粒度**：Claude Code 的 `ask` 是工具调用级的；Codex 同时有 turn 级（`Op::Interrupt`）和会话级（rollout）两种。
- **共同点**：恢复的都是**原来的执行位置**，而不是重新规划；面向用户的交互也都收敛到唯一入口（主会话 / UI）。

## See Also

- [内部中断实现](internal-interrupt.md) — 工具主动请求输入（Eino 与手写版）
- [外部中断实现](external-interrupt.md) — 应用 / 用户从外部暂停（Eino TurnLoop）
- [多 Agent 中断实现](multi-agent-interrupt.md) — 中断沿调用链传播与恢复寻址
- [基于中断恢复的用户交互](user-interaction.md) — 追问与授权怎么实现
