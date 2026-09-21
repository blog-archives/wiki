---
title: 外部中断实现
updated: "2026-09-22"
order: 3
---

> 本文参考 [Eino 官方第十一章：TurnLoop](https://www.cloudwego.io/zh/docs/eino/quick_start/chapter_11_turnloop/)，结合 [07：外部暂停与恢复](https://github.com/code-practice-archives/agent-practice/tree/main/07-eino-external-interrupt)说明使用方式。

**Agent 正在执行时，用户也可能想让它停下来。** 例如一个任务需要依次完成三个步骤，第一步还在运行，用户按下暂停；稍后又希望接着做。07 项目用 Eino 的 `TurnLoop` 实现这个过程：Ctrl+C 请求暂停，回车恢复，`q` 退出。

先理解 TurnLoop 如何接收任务，再看停止和恢复，整个过程就比较容易串起来。

## 一、TurnLoop：一个可以从外部控制的执行循环

**TurnLoop 启动后会持续接收任务，每次取出输入，交给 Agent 执行。** 一轮执行可以包含多次模型请求和工具调用；这一轮完成后，Loop 进入空闲状态，等待新的输入。

```text
Push 输入 → 队列 → Agent 执行一轮 → 空闲，等待下一次输入
```

应用保留 `loop` 对象，就可以向它提交新任务，也可以请求它停止。[07 项目的启动代码](https://github.com/code-practice-archives/agent-practice/blob/main/07-eino-external-interrupt/console.go)可以简化为：

```go
loop := adk.NewTurnLoop(cfg)
loop.Push("请依次完成步骤 1、2、3")
loop.Run(ctx) // 启动后台执行，调用后立即返回。
```

**`Run` 返回时，任务仍可能正在运行。** 因而应用还能处理用户的暂停操作，向同一个 `loop` 发出控制请求。工具不必自己读取终端，也不需要在内部主动调用 `tool.Interrupt`。

## 二、从外部停止：Stop 发请求，Wait 等结果

**停止正在执行的任务，核心就是 `Stop` 和 `Wait`。** 07 项目在收到 Ctrl+C 后执行以下逻辑；此处将请求暂停与等待结果拼接展示：

```go
loop.Stop(adk.WithGracefulTimeout(30 * time.Second))
result := loop.Wait()
```

`Stop` 表示“请停止”，`Wait` 表示“等到确实退出”。**只有 `Wait` 返回并确认状态保存成功后，应用才显示“已暂停”。** 如果模型或存储发生错误，应报告错误；如果任务已经自然完成，也就无需恢复。具体判断集中在项目的 [pausedSuccessfully](https://github.com/code-practice-archives/agent-practice/blob/main/07-eino-external-interrupt/console.go)。

### Stop 决定在什么时候停

**停止可以等整轮做完，也可以等当前一步做完，或者尽快取消当前执行。** 这些方式由 [Stop 选项](https://github.com/cloudwego/eino/blob/v0.9.13/adk/turn_loop.go)控制：

| 调用 | 停止时机 |
| --- | --- |
| `loop.Stop()` | 等当前整轮任务完成后退出 |
| `loop.Stop(adk.WithGraceful())` | 等当前模型调用或一组工具调用完成后退出 |
| `loop.Stop(adk.WithImmediate())` | 立即请求取消，不等待上述完成边界 |
| `loop.Stop(adk.WithGracefulTimeout(...))` | 先等完成边界，超时后升级为立即取消 |

**模型或工具调用完成的边界，就是这里的“安全点”。** 07 选择最后一种方式：如果暂停时步骤 1 正在运行，先让它完成并保留结果，再停止后续执行；如果等待超过 30 秒，就改为立即取消。

项目的 [slowStep](https://github.com/code-practice-archives/agent-practice/blob/main/07-eino-external-interrupt/agent.go) 会监听 `ctx.Done()`，因此可以响应取消。对于不响应取消的代码，框架不能强制结束它；30 秒是升级取消的时间，不是保证退出的时间。

### 官方文档里的“抢占”是什么

**抢占是用户给出新任务，要求先停下当前轮次，再处理新输入。** 它使用带 `WithPreempt` 选项的 `Push`，循环继续运行；`Stop` 则让整个 Loop 退出。[官方第十一章](https://www.cloudwego.io/zh/docs/eino/quick_start/chapter_11_turnloop/)展示了这两种操作。07 项目采用的是停止后恢复原任务，下面继续沿这条路径展开。

## 三、暂停后继续：用 checkpoint 找回原任务

**Loop 退出后，原任务的进度靠 checkpoint 保存。** 为了之后能够恢复，需要在配置中指定存储和这次任务的标识：

```go
// TurnLoopConfig 内：
Store:        store,
CheckpointID: checkpointID,
```

配置好后，框架负责保存执行状态。用户选择继续时，应用创建一个新 Loop，复用相同配置；它就能找到之前的 checkpoint。以下将 [console.go](https://github.com/code-practice-archives/agent-practice/blob/main/07-eino-external-interrupt/console.go) 的关键操作拼成连续流程，省略终端输入、信号监听和错误处理：

```go
// 开始任务。
cfg := loopConfig(agent, store, checkpointID)
loop := adk.NewTurnLoop(cfg)
loop.Push(question)
loop.Run(ctx)

// 用户按 Ctrl+C：请求暂停，并等待退出。
loop.Stop(adk.WithGracefulTimeout(30 * time.Second))
result := loop.Wait()

// 应用检查 result：确认是暂停，且 checkpoint 保存成功。
// 用户按回车选择继续后：
loop = adk.NewTurnLoop(cfg)
loop.Run(ctx)
```

**恢复时不再 `Push(question)`，因为任务和执行进度已经保存在 checkpoint 中。** 同一个 Loop 只能启动一次，所以要创建新对象；新 Loop 会自动加载旧状态，由框架调用底层 Runner 的恢复接口。

以安全点暂停为例，整个过程是：

```text
执行步骤 1 → 用户请求暂停 → 步骤 1 完成，保存进度并退出
用户选择继续 → 新 Loop 读取进度 → 继续后续步骤
```

**恢复能够利用已完成的工具结果，但尚未完成的调用可能重新执行。** 本例使用[内存存储](https://github.com/code-practice-archives/agent-practice/blob/main/07-eino-external-interrupt/checkpoint.go)，关闭进程后不能再恢复；如果工具会写文件或调用外部服务，还需要防止重试产生重复副作用。

## 四、配置回调：告诉框架“这次处理什么”

**TurnLoop 管理执行，应用通过回调决定任务输入如何使用。** 07 的 [loop.go](https://github.com/code-practice-archives/agent-practice/blob/main/07-eino-external-interrupt/loop.go) 配置了三个回调：

```go
// TurnLoopConfig 内：
GenInput:  taskInput,
GenResume: resumeTask,
PrepareAgent: func(context.Context,
    *adk.TurnLoop[string, *schema.Message], []string) (adk.Agent, error) {
    return agent, nil
},
```

| 回调 | 07 项目中做什么 |
| --- | --- |
| `GenInput` | 从队列取一个任务，构造成用户消息，其余任务留待后续处理 |
| `PrepareAgent` | 返回负责执行的 Agent |
| `GenResume` | 继续原来中断的任务，把其他输入留待后续处理 |

**`GenResume` 只安排输入，不需要自己重建执行进度。** 项目的核心实现是：

```go
return &adk.GenResumeResult[string, *schema.Message]{
    Consumed:  interrupted, // 继续之前正在处理的任务。
    Remaining: append(append([]string{}, unhandled...), newItems...),
}, nil
```

这里 `unhandled` 是之前还没开始的任务，`newItems` 是新 Loop 启动前收到的输入。07 没有需要补交的审批答案，只需继续原任务。事件消费使用框架默认处理，因此也不必自己实现 `OnAgentEvents`。

> **Status: Outdated（2026-09-21）**：旧版将“有 checkpoint”直接等同于“调用 GenResume”。只有保存了执行到一半的 Runner 状态时才走 GenResume；任务尚未开始、只保存了队列输入时，仍走 GenInput。

**应用负责提交任务、请求暂停和选择继续；TurnLoop 负责让执行停下，保存进度，并在新 Loop 启动时恢复。** 07 还通过 `UntilIdleFor` 在任务完成后自动退出，这属于终端程序的收尾安排，不影响上述暂停恢复流程。

## 延伸阅读

- [内部中断实现](internal-interrupt.md) — 工具主动请求输入后的保存与恢复。
- [多 Agent 中断实现](multi-agent-interrupt.md) — 嵌套调用中的中断传播与恢复寻址。
- [从 Codex 学习中断恢复的实现](codex-interrupt-recovery.md) — 会话层面的停止、存储与恢复。

## 参考文档

- [Eino 官方第十一章：TurnLoop — 抢占、中止与多轮生命周期](https://www.cloudwego.io/zh/docs/eino/quick_start/chapter_11_turnloop/)
- [07 项目源码与运行说明](https://github.com/code-practice-archives/agent-practice/tree/main/07-eino-external-interrupt)
- [Eino v0.9.13：TurnLoop 源码](https://github.com/cloudwego/eino/blob/v0.9.13/adk/turn_loop.go)
