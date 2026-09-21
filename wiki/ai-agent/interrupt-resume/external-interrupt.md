---
title: 外部中断实现
updated: "2026-09-21"
order: 3
---

> 本文整理自 [agent-practice](https://github.com/code-practice-archives/agent-practice) 仓库 07 实验的源码与 [Eino TurnLoop 官方文档](https://www.cloudwego.io/zh/docs/eino/quick_start/chapter_11_turnloop/)。

## Overview

**外部中断是「执行本身没问题，应用或用户要求暂停正在跑的循环」。** 和工具主动请求输入的[内部中断实现](internal-interrupt.md)相反，它由外部发起，因此关键变成三件事：**应用怎么触达正在执行的循环、框架在哪个安全点停下、以及之后怎么恢复。** 本文看 Eino 的 `TurnLoop`（07）；Codex 把这套东西做成 session 生命周期的设计，见[中断与恢复子专题](ai-agent/interrupt-resume/index.md)。

## 一、Eino：TurnLoop

07 用 Eino 的 `TurnLoop` 实现：用户按 Ctrl+C，应用调 `loop.Stop(...)`，框架负责在安全点停下、保存 checkpoint，之后用新 Loop 恢复。**工具里没有 `tool.Interrupt`**，它只是跑得慢，给用户留出按 Ctrl+C 的窗口。

| | 内部中断 | 外部中断 |
| --- | --- | --- |
| 谁发起 | 工具自己发现缺输入 | 应用 / 用户要求暂停 |
| 触发方式 | 工具调用 `tool.Interrupt` | 应用调用 `loop.Stop(...)` |
| 恢复 | `ResumeWithParams` 带回答 | 新 Loop 加载 checkpoint，框架自动 `GenResume` |

### 应用持有 loop，不需要工具内部的 ctx

```go
cfg := loopConfig(agent, store, checkpointID)
loop := adk.NewTurnLoop(cfg)
loop.Push(question)
loop.Run(ctx) // 框架启动后台执行

// 用户按 Ctrl+C：
loop.Stop(adk.WithGracefulTimeout(30 * time.Second))
result := loop.Wait() // 等待退出和 checkpoint 保存完成
```

**`Stop` 只提交请求，不表示已经暂停。** `WithGracefulTimeout` 等待先遇到的模型 / 工具执行边界，30 秒内未到达则升级为立即中断。网页场景可以维护 `taskID → loop` 映射，点击暂停时在服务端查到对应 Loop 再 `Stop`——身份校验属于服务端业务，不能用客户端任意传入的 ID 代替。

`Stop` 有三种模式：`Stop()` 在轮次边界退出（等当前轮次完成）、`Stop(WithImmediate())` 立即取消当前轮次、`Stop(WithGraceful())` 在下一个安全点退出；07 用的是带超时的 `WithGracefulTimeout`。官方文档里另一个外部控制是**抢占**——`Push(item, adk.WithPreempt(adk.AfterToolCalls))` 会在当前工具调用完成后取消本轮、开始新轮。

### 恢复由框架选择

```go
// 用户按回车：使用相同 Agent、Store 和 checkpoint ID。
loop = adk.NewTurnLoop(cfg)
loop.Run(ctx)
```

**不重新 Push 原任务，也不手动选 `Query` / `Resume`。** 框架读取 checkpoint 后自动调用 `GenResume` 而不是 `GenInput`。这两个回调只描述「输入如何归属」：

```go
func taskInput(_ context.Context, _ *adk.TurnLoop[string, *schema.Message], items []string) (*adk.GenInputResult[string, *schema.Message], error) {
	return &adk.GenInputResult[string, *schema.Message]{
		Input:    &adk.AgentInput{Messages: []*schema.Message{schema.UserMessage(items[0])}},
		Consumed: items[:1], Remaining: items[1:],
	}, nil
}

// 业务只决定输入如何归属：原任务继续，未处理及新任务留给之后的轮次。
func resumeTask(_ context.Context, _ *adk.TurnLoop[string, *schema.Message], interrupted, unhandled, newItems []string) (*adk.GenResumeResult[string, *schema.Message], error) {
	return &adk.GenResumeResult[string, *schema.Message]{
		Consumed:  interrupted,
		Remaining: append(append([]string{}, unhandled...), newItems...),
	}, nil
}
```

**同一 Loop 的 `Run` 只启动一次，所以恢复必须用新的 Loop 对象。** 状态只保存在内存，退出进程后无法恢复。

### 结果靠 TurnLoopExitState 判断

`loop.Wait()` 返回框架给的 `TurnLoopExitState`：

| 字段 | 用途 |
| --- | --- |
| `CheckpointErr` | 保存失败时报错，不允许显示恢复成功 |
| `ExitReason` | 区分自然完成、用户取消和模型 / 工具失败 |
| `CheckpointAttempted` | 确认确实尝试保存了可恢复状态 |
| `InterruptedItems` / `UnhandledItems` | 框架记录未完成的输入；任务尚未启动就被停止时也能保留 |

应用只在 `pausedSuccessfully` 里解释一次退出原因，区分「用户暂停」「自然完成」「真正的执行错误」；保存完成与失败都由框架明确报告，不需要自己逐条消费取消事件。

## 二、要点与边界

- **外部中断要有安全点。** 框架等待模型 / 工具边界（`WithGracefulTimeout`），超时升级后未完成的调用可能重执行。
- **安全点暂停会保留已完成的结果。** 普通工具仍需配合 `ctx.Done()`，实际副作用需自行保证幂等——框架不保证外部操作 exactly-once，也不能强杀不响应取消的 Go 函数。
- **恢复是「重新进入」，不是「续行」。** Eino 会用新 Loop 加载 checkpoint 重新驱动原来的执行。
- **内存等待者不持久化。** 恢复不该被理解成「重放之前排队的一切」。

## See Also

- [内部中断实现](internal-interrupt.md) — 工具主动请求输入
- [多 Agent 中断实现](multi-agent-interrupt.md) — 中断沿调用链传播与恢复寻址
- [中断与恢复子专题](ai-agent/interrupt-resume/index.md) — Claude Code / Codex 的设计
- [任务拆分与规划](../task-planning.md) — 中途改目标、steer、排队与中断
