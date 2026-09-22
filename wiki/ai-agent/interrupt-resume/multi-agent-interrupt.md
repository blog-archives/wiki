---
title: 多 Agent 中断实现
updated: "2026-09-22"
tags:
  - interrupt-resume
  - multi-agent
  - cloudwego-eino
  - sub-agent
order: 4
---

> 本文基于 [04：Eino 子 Agent 中断](https://github.com/code-practice-archives/agent-practice/tree/main/04-eino-subagent-human-in-the-loop)与 [06：手写子 Agent 中断](https://github.com/code-practice-archives/agent-practice/tree/main/06-native-subagent-human-in-the-loop)的源码，只讨论父子调用带来的新增机制。

**多一层 Agent，就要同时保留“子任务停在哪里”和“父任务在等什么”。** 两个项目都把笔记任务交给子 Agent：父 `coordinator` 发起委派，子 `note_assistant` 负责追问与保存。工具如何中断、应用如何收集回答，沿用[内部中断实现](internal-interrupt.md)；这里新增的是父子执行之间的衔接。

```text
父 Agent：调用 note_assistant ────────── 等待子任务结果
                     子 Agent：调用 ask_user → 等待用户回答
```

**子 Agent 中断时，父级的委派仍是未完成的工具调用。** 恢复后要先完成子任务，再把结果交回父级，而不是让父模型重新决定委派一次。本文讨论的是这种嵌套调用，不涉及多个独立 Agent 的并行调度。

## 一、Eino：用 AgentTool 保留父子中断链

### 1. 把子 Agent 注册为父级工具

**04 项目的关键变化是用 `adk.NewAgentTool` 包装子 Agent。** 子级保留原来的 `ask_user`、`save_note` 和授权中间件；父级只需将它注册为一个工具。[agent.go](https://github.com/code-practice-archives/agent-practice/blob/main/04-eino-subagent-human-in-the-loop/agent.go) 的核心配置是：

```go
// 父 Agent 的 ChatModelAgentConfig 内：
ToolsConfig: adk.ToolsConfig{
    ToolsNodeConfig: compose.ToolsNodeConfig{
        Tools: []tool.BaseTool{adk.NewAgentTool(ctx, noteAgent)},
    },
    EmitInternalEvents: true,
},
```

**AgentTool 不只负责调用子 Agent，还负责把子级的中断和执行状态连接到父级。** 子工具中断后，AgentTool 保留子级 checkpoint，并将中断继续向上传递；父级因此停在这次委派上，最终由外层 Runner 把中断交给应用。

恢复时，AgentTool 检查到此前保存的中断状态，就恢复子执行，而不是重新启动子任务。这个分支由 [Eino 的 AgentTool 实现](https://github.com/cloudwego/eino/blob/v0.9.13/adk/agent_tool.go)负责。配置中的 `EmitInternalEvents` 用于向外展示子 Agent 的过程事件；中断传播本身由 AgentTool 桥接。

### 2. 应用仍从父 Runner 恢复，回答指向子中断

**应用无需分别操作父、子 Runner，仍只使用最外层的恢复入口。** [console.go](https://github.com/code-practice-archives/agent-practice/blob/main/04-eino-subagent-human-in-the-loop/console.go) 从事件中选出 `IsRootCause` 的中断位置，收集回答后执行：

```go
// point 是子工具发起的根因中断，runner 是父 Agent 的 Runner。
iter, err = runner.ResumeWithParams(ctx, checkpointID, &adk.ResumeParams{
    Targets: map[string]any{point.ID: answer},
})
```

**checkpoint 找回整条执行链，`point.ID` 指定回答应交给哪个中断位置。** 事件中的 `Address` 还能说明它来自哪次父子调用，例如：

```text
agent:coordinator
  → tool:note_assistant:delegate-1
    → agent:note_assistant
      → tool:ask_user:ask-1
```

工具名相同也不能代表同一次调用，路径中还包含父级委派和子级 tool call ID。应用直接使用事件给出的中断 ID，不必解析路径或根据 Agent 名称猜测恢复目标。

**恢复父 Runner，会先接回尚未完成的 AgentTool，再继续子任务。** 子 Agent 完成后，其结果成为父级委派的工具结果，父模型才继续推理。[项目测试](https://github.com/code-practice-archives/agent-practice/blob/main/04-eino-subagent-human-in-the-loop/main_test.go)检查了这一点：子级等待与恢复期间，父模型没有重复发起委派。

## 二、手写：用 Frame 栈保留父子进度

### 1. 单份执行状态，扩展为一组执行帧

**06 将单 Agent 的消息、工具队列和执行进度移入 `Frame`，再由 `Session` 保存整条调用栈。** 以下为 [runner.go](https://github.com/code-practice-archives/agent-practice/blob/main/06-native-subagent-human-in-the-loop/runner.go) 的核心结构：

```go
type Frame struct {
    Agent      *Agent
    Messages   []openai.ChatCompletionMessage
    Pending    []openai.ToolCall
    ModelCalls int
    Done       bool
}

type Session struct {
    Frames   []*Frame // 父级在下，当前执行的子级在栈顶。
    Waiting  *Interrupt
    Sequence int      // 为会话内的每次中断生成新 ID。
}
```

**循环始终只推进栈顶，父级状态留在下面等待。** 每次委派都会创建独立的子 Frame；子级消息历史最初只有自己的指令和本次任务，不自动复制父级历史。

### 2. 委派时压栈，父级调用暂不完成

[agent.go](https://github.com/code-practice-archives/agent-practice/blob/main/06-native-subagent-human-in-the-loop/agent.go) 的 `subAgentTool` 在被调用时创建子 Frame；[runner.go](https://github.com/code-practice-archives/agent-practice/blob/main/06-native-subagent-human-in-the-loop/runner.go) 的 `accept` 再将它压栈。下面拼接两处核心代码，省略参数解析和栈深检查：

```go
// 子 Agent 工具：返回待执行的子任务。
return toolOutcome{SubAgent: newFrame(agent, args.Task)}, nil

// 调度器收到 SubAgent：压栈，后续改为推进子级。
if outcome.SubAgent != nil {
    s.Frames = append(s.Frames, outcome.SubAgent)
    return nil
}
```

**此时不能给父级填入“委派成功”的工具结果。** 子任务尚未结束，父 Frame 的 `Pending[0]` 必须继续保留这次委派。这样子级追问或申请授权时，父级不会提前继续，也不会丢失之后接收结果的位置。

### 3. 子级中断时保留整个栈，恢复时只进入栈顶

**子工具返回中断后，调度器记录等待状态，外层 `Run` 直接把它交给应用。** 以下拼接 `accept` 与 `Run` 的相关片段；中断之前已经建立的父子 Frame 都不移除：

```go
// accept：给这次中断分配 ID，并记录它所在的调用路径。
s.Sequence++
outcome.Interrupt.ID = fmt.Sprintf("interrupt-%d", s.Sequence)
outcome.Interrupt.Address = s.address()
s.Waiting = outcome.Interrupt

// Run：检测到等待状态，返回应用。
if s.Waiting != nil {
    return s.Waiting, nil
}
```

**独立的中断 ID 用于区分不同子任务的提问。** 两次委派中的子模型可能都生成 `ask-1` 这样的工具调用 ID，不能直接用它接收回答。会话中的 `Sequence` 为每次中断分配新 ID，也能拒绝已经过期的回答。

恢复时先校验 ID，再从栈顶找到原工具。下面将 `Resume` 与 `invokeTool` 的核心逻辑拼接，省略上下文取消检查：

```go
if s.Waiting == nil || s.Waiting.ID != id {
    return nil, fmt.Errorf("no pending interrupt with ID %q", id)
}
frame := s.top()
outcome, err := invokeTool(frame.Agent, frame.Pending[0], &answer)
if err != nil {
    return nil, err
}
if err := s.accept(outcome); err != nil {
    return nil, err
}
return r.Run(ctx, s)
```

**原来的子 Frame 还在栈顶，因此无需重新委派或重建子任务。** `accept` 对有效工具结果补消息并清除 `Waiting`，对再次中断则更新等待状态；这部分与单 Agent 相同。这里的 `Address` 只用于展示，程序实际靠原 `Session`、当前中断 ID 和栈顶调用定位恢复位置。

### 4. 子任务完成后弹栈，把结果交回父级

**子 Agent 的最终回答，要成为父级那次委派的 tool 结果。** `Run` 发现栈顶已完成且还有父级时，执行以下代码：

```go
frame := s.top()
if frame.Done && len(s.Frames) > 1 {
    s.Frames = s.Frames[:len(s.Frames)-1] // 移除已完成的子 Frame。
    parent := s.top()
    parent.finishTool(frame.Messages[len(frame.Messages)-1].Content)
}
```

`finishTool` 使用父级仍保留的 `Pending[0].ID` 追加结果并出队。**父级拿到的是子任务最终结果，子级内部的追问、授权和工具消息不逐条复制给父级。** 随后循环继续处理父级剩余工作；有更多嵌套层时，按同样方式逐层返回。

## 三、始终保留“谁在等谁”

**多 Agent 中断新增的关键，是未完成调用之间的依赖关系。** 以一次子级追问为例：

| 阶段 | 父级委派 | 子级调用 |
| --- | --- | --- |
| 开始子任务 | 保留委派，等待结果 | 执行自己的模型与工具循环 |
| 子级中断 | 继续等待 | 保留当前工具，等待用户输入 |
| 用户回答 | 仍未完成 | 恢复原工具，继续子任务 |
| 子任务完成 | 收到工具结果，继续执行 | 返回最终回答 |

**框架桥接或手写栈，都要保住这条关系，才能做到恢复子任务而不重复委派。** 06 的栈只支持串行执行、一次等待一个位置；并行子任务需要分别保存分支状态和回答目标，不能继续依赖单一栈顶。其 Frame 还引用了含函数的 Agent 配置，不能直接序列化为磁盘 checkpoint。

## 延伸阅读

- [内部中断实现](internal-interrupt.md) — 工具中断、交互与恢复的基础流程。
- [外部中断实现](external-interrupt.md) — 从应用侧暂停正在运行的 Agent。

## 参考源码

- [04：Eino 子 Agent 中断](https://github.com/code-practice-archives/agent-practice/tree/main/04-eino-subagent-human-in-the-loop)
- [06：手写子 Agent 中断](https://github.com/code-practice-archives/agent-practice/tree/main/06-native-subagent-human-in-the-loop)
- [Eino v0.9.13：AgentTool 中断桥接](https://github.com/cloudwego/eino/blob/v0.9.13/adk/agent_tool.go)
