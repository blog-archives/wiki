---
title: 内部中断实现
updated: "2026-09-21"
---

> 本文整理自 [agent-practice](https://github.com/code-practice-archives/agent-practice) 仓库 03、05 实验的源码。

## Overview

**内部中断是「工具自己发现缺输入」而发起的中断。** 工具需要补充信息或用户决策时并不阻塞等待，而是显式返回一个中断，由框架把当前执行状态存成 checkpoint、把控制权交还应用；应用拿到输入后，再用中断 ID **重新进入**原调用点。本文看 Eino 与不用框架时的两种写法。**外部中断**（应用或用户要求暂停正在跑的循环）见[外部中断实现](external-interrupt.md)，agent 调用 agent 时的中断传播见[多 Agent 中断实现](multi-agent-interrupt.md)。

## 一、中断是控制信号，不是「暂停在某一行」

**`tool.Interrupt` 返回的是框架识别的控制信号，不是 sleep，也不是停在某个函数里。** 当前执行就此结束，状态保存在 checkpoint 中；恢复时会**重新进入**工具调用链（包括中间件），原工具参数由框架恢复。

这条性质带来一个硬性约束：**副作用必须放在中断点之后。** 因为恢复后调用点会再次执行，任何放在 `tool.Interrupt` 之前的写操作都会被重复执行。同理，耗时预处理如果需要保存自己的进度，得进一步用 `StatefulInterrupt`。

## 二、Eino：工具级中断

Eino 把这套能力做成几个 API 加一个存储接口：

| 角色 | API | 职责 |
| --- | --- | --- |
| 工具 / 中间件 | `tool.Interrupt(ctx, prompt)` | 声明当前需要外部输入，结束本次执行 |
| 工具 / 中间件 | `tool.GetResumeContext[T](ctx)` | 判断当前调用是否为恢复目标、是否拿到期望类型的数据 |
| 应用层 | `runner.ResumeWithParams(ctx, checkpointID, ...)` | 用中断 ID 把输入送回原调用点 |
| 应用层 | `CheckPointStore` 实现 | 保存 / 读取 / 删除执行快照 |

一个会中断的工具，结构总是「先问恢复上下文，拿不到就中断」：

```go
func askUser(ctx context.Context, input *askInput) (*askReply, error) {
	if strings.TrimSpace(input.Question) == "" {
		return nil, fmt.Errorf("question must not be empty")
	}
	if target, supplied, answer := tool.GetResumeContext[string](ctx); target && supplied {
		if strings.TrimSpace(answer) != "" {
			return &askReply{Question: input.Question, UserAnswer: answer}, nil
		}
	}
	return nil, tool.Interrupt(ctx, "[补充信息] "+input.Question)
}
```

**`GetResumeContext` 的两个返回值回答了「我现在该不该继续」：** `target` 表示当前调用是否为恢复目标，`supplied` 表示是否取到了期望类型的数据。首次执行时两者都不成立，于是中断；恢复并拿到有效输入后才返回结果。

应用侧是「消费事件 → 收集输入 → 恢复 → 再消费」，因为恢复后还可能再次中断：

```go
for {
	interrupts, err := consumeEvents(iter)
	if err != nil || len(interrupts) == 0 {
		return err
	}
	answers, err := readAnswers(input, interrupts)
	if err != nil {
		return err
	}
	iter, err = runner.ResumeWithParams(ctx, checkpointID, &adk.ResumeParams{Targets: answers})
	if err != nil {
		return err
	}
}
```

`consumeEvents` 只收集根因中断（`point.IsRootCause`）——中断可能带传播链，只有真正发起中断的位置才需要输入。checkpoint 存储要实现框架接口，内存版用 `sync.Map` 是因为框架会从内部 goroutine 访问，返回时复制字节是为了不共享底层数组：

```go
type memoryStore struct {
	checkpoints sync.Map
}

func (s *memoryStore) Get(_ context.Context, id string) ([]byte, bool, error) {
	checkpoint, ok := s.checkpoints.Load(id)
	if !ok {
		return nil, false, nil
	}
	return append([]byte{}, checkpoint.([]byte)...), true, nil
}
```

## 三、不用框架：手写同一套状态机

**把框架换成手写，机制不变，只是状态由自己维护。** 工具返回一个 `Interrupt` 值 → 循环保存状态并返回 → 应用收集输入 → 恢复原工具调用 → 补齐工具结果 → 继续模型循环。没有暂停 API，也没有等待外部输入的后台 goroutine。

| 字段 | 保存什么 | 为什么需要 |
| --- | --- | --- |
| `Messages` | system / user / assistant / tool 消息历史 | 恢复后模型仍能看到完整上下文 |
| `Pending` | 尚未完成的工具调用（名称、原始参数、call ID） | 知道接下来执行哪个工具 |
| `Waiting` | 当前中断的 ID、类型、提示 | 校验输入的目标 |
| `ModelCalls` | 已请求模型的次数 | 防止反复恢复绕过迭代上限 |
| `Done` | 任务是否完成 | 防止对已完成任务重复执行 |

```go
func (r *Runner) Run(ctx context.Context, session *Session) (*Interrupt, error) {
	if session.Waiting != nil || session.Done {
		return session.Waiting, nil
	}
	for !session.Done {
		if len(session.Pending) == 0 {
			if err := r.callModel(ctx, session); err != nil {
				return nil, err
			}
			continue
		}
		outcome, err := invokeTool(session.Pending[0], nil)
		if err != nil {
			return nil, err
		}
		if outcome.Interrupt != nil {
			session.Waiting = outcome.Interrupt
			return session.Waiting, nil
		}
		session.finishTool(outcome.Content)
	}
	return nil, nil
}
```

**两个不变量：** 已有 `Waiting` 或已 `Done` 时直接返回，不重复干活；`Pending` 非空时**绝不请求模型**，因为模型之前发起的工具调用必须先把结果补齐，否则 tool calling 消息序列不完整。恢复时先校验 ID 匹配，再用指针把输入传回工具（`nil` 表示尚未回答），最后 `finishTool` 追加一条 `role=tool` 消息并用 `ToolCallID` 匹配原调用。

## 四、要点

- **恢复是「重新进入」，不是「续行」。** Eino 会重新跑工具调用链和中间件，手写版会重新执行队首工具；两边都要求副作用放在中断点之后。
- **状态要有明确的所有者。** Eino 交给 `CheckPointStore`，手写版交给 `Session`；谁持有状态，谁负责恢复。
- **内部中断由工具主动触发**，所以「什么时候该问」写在工具或中间件里；这也是它和外部中断最大的区别。

## See Also

- [外部中断实现](external-interrupt.md) — 应用 / 用户从外部暂停正在跑的循环
- [多 Agent 中断实现](multi-agent-interrupt.md) — 中断如何沿调用链向上冒泡、恢复如何寻址
- [基于中断恢复的用户交互](user-interaction.md) — 用内部中断实现追问与授权
- [专业产品的中断设计](product-design.md) — Claude Code / Codex 的设计
