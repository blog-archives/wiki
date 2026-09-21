---
title: 多 Agent 中断实现
updated: "2026-09-21"
order: 4
---

> 本文整理自 [agent-practice](https://github.com/code-practice-archives/agent-practice) 仓库 04、06 实验的 README 与源码。

## Overview

**单 Agent 的中断/恢复讲完，多一层 Agent 之后问题变成两个：中断往哪儿冒、恢复找谁。** 前者由「谁发起中断」决定，后者由「寻址信息有多完整」决定。本文看两种实现：**Eino 用 `NewAgentTool` 把子 Agent 包成工具，中断沿调用链逐层上传到最外层，应用只跟最外层打交道；手写版用一个显式 `Frame` 栈，中断就是栈顶的等待。** 两者恢复的都是「调用路径」，而不是「让上层模型重新规划」。Codex 把每个子代理当独立线程、按 `thread_id` 恢复的设计，见[专业产品的中断设计](product-design.md)。

## 一、Eino：AgentTool 桥接，中断逐层上传

**结构上只多了一层：** 父 `coordinator` 用 `adk.NewAgentTool(ctx, noteAgent)` 把子 `note_assistant` 包成一个普通工具；工具和授权中间件仍只挂在子 Agent 上。

```go
func newCoordinator(ctx context.Context, chatModel model.ToolCallingChatModel, noteAgent adk.Agent) (*adk.ChatModelAgent, error) {
	return adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
		Name:        "coordinator",
		Model:       chatModel,
		Instruction: "你是协调者。所有笔记任务都必须调用 note_assistant……",
		MaxIterations: 5,
		ToolsConfig: adk.ToolsConfig{
			ToolsNodeConfig: compose.ToolsNodeConfig{
				Tools: []tool.BaseTool{adk.NewAgentTool(ctx, noteAgent)},
			},
			EmitInternalEvents: true,
		},
	})
}
```

**核心规则：在 `NewAgentTool` 连接的嵌套调用链中，中断会逐层向上传到最外层 Agent；与外界交互的是应用层，不是主 Agent 的模型。**

```text
中断向上：深层工具 → 所属 Agent → AgentTool → 上层 Agent → … → 最外层 Agent → 应用
回答交回：用户 → 应用 → 最外层 Agent → 按保存的调用路径恢复 → 原中断位置
```

### 为什么代码里没有「恢复父还是子」的判断

**因为这正是 `NewAgentTool` 的职责。** 应用始终只调用最外层 Agent；父级恢复后，Eino 会重新进入尚未完成的 AgentTool，AgentTool 根据已有中断状态自己决定分支：

```text
进入 AgentTool
  ├─ 没有此前的中断状态 → 启动子 Agent
  └─ 有此前的中断状态   → 恢复保存的子 Agent 执行
```

所以**「从父 Agent 恢复」不等于「让父模型重新规划、再次委派」**：恢复调用路径与恢复模型推理是两件事。测试正是拿这一点做断言——中断期间父模型只调用一次，恢复不会重新发起委派。

### 恢复到谁：靠地址而不是名字

| 信息 | 用途 |
| --- | --- |
| checkpoint ID | 找到这一轮执行保存的完整状态 |
| `InterruptCtx.ID` | 本次具体中断的标识；作为 `Targets` 的键 |
| `InterruptCtx.Address` | 中断所在的层级路径，包含 Agent 和工具调用 ID |
| `InterruptCtx.Parent` | 沿中断传播链向上追溯父级 |
| `InterruptCtx.IsRootCause` | 标记真正发起中断的位置，应用向这些位置提供回答 |

一个真实的追问地址长这样：

```text
agent:coordinator;tool:note_assistant:delegate-1;agent:note_assistant;tool:ask_user:ask-1
```

它依次表示父 Agent、父 Agent 发起的某次子 Agent 工具调用、子 Agent、子 Agent 发起的某次追问工具调用。**所以同名工具也不只靠名字区分**——地址里还包含所属 Agent、父级调用和本次工具调用 ID。恢复代码与单 Agent 完全相同，仍只调用父 Agent、只用子中断的 ID：

```go
iter, err = runner.ResumeWithParams(ctx, checkpointID, &adk.ResumeParams{
	Targets: map[string]any{point.ID: answer},
})
```

## 二、手写：用 Frame 栈维护父子执行

**不依赖框架时，父子执行就是自己维护一个显式调用栈。** 06 把三层状态分开：`Agent` 是配置，`Frame` 是一次执行的进度，`Session` 是整条父子调用链。

```go
type Agent struct {
	Name        string
	Instruction string
	Tools       []Tool
}

type Frame struct {
	Agent      *Agent
	Messages   []openai.ChatCompletionMessage
	Pending    []openai.ToolCall
	ModelCalls int
	Done       bool
}

type Session struct {
	Frames   []*Frame
	Waiting  *Interrupt
	Sequence int
}
```

`Session.top()` 始终取栈顶。子任务压栈后，调度器自然只推进子任务，父级进度保留在下层——**父级 `Pending` 在子任务完成之前一直不出队。**

### 委派：注册时只绑定配置，调用时才创建子执行

`subAgentTool(agent)` 返回一个普通 `Tool`，其 `Invoke` 闭包保存传入的 `*Agent`。注册时只建立绑定，不启动模型；模型真正调用时，才创建这次委派的独立 `Frame`：

```go
func subAgentTool(agent *Agent) Tool {
	return newTool(agent.Name, "将 task 委派给独立上下文的子 Agent，返回子任务最终结果",
		`{"type":"object","properties":{"task":{"type":"string"}},"required":["task"]}`,
		func(arguments string, _ *string) (toolOutcome, error) {
			var args struct {
				Task string `json:"task"`
			}
			if err := json.Unmarshal([]byte(arguments), &args); err != nil {
				return toolOutcome{}, fmt.Errorf("decode delegation: %w", err)
			}
			if strings.TrimSpace(args.Task) == "" {
				return toolOutcome{}, fmt.Errorf("delegated task must not be empty")
			}
			return toolOutcome{SubAgent: newFrame(agent, args.Task)}, nil
		})
}
```

**这里不能直接返回「委派成功」。** 返回的是 `SubAgent: newFrame(...)`——一个尚未执行的子执行；只有等子任务真正结束，父级队首的这次委派才会被填上工具结果。若这里直接给结果，父模型就会过早继续。

### accept：把工具返回值翻译成状态变化

工具只报告结果，由 `accept` 决定如何推进：

| 工具返回值 | accept 做什么 | 为什么 |
| --- | --- | --- |
| `SubAgent != nil` | 检查栈深并压入子 Frame | 委派尚未完成，父级 `Pending` 保留 |
| `Interrupt != nil` | 生成新 ID、计算地址、设置 `Waiting` | 当前工具还没结果，`Pending` 同样保留 |
| 普通 `Content` | `finishTool`，清除 `Waiting` | 当前调用已完成，可以推进后续工作 |

```go
func (s *Session) accept(outcome toolOutcome) error {
	if outcome.SubAgent != nil {
		if len(s.Frames) >= 8 {
			return fmt.Errorf("agent nesting exceeded 8 frames")
		}
		s.Frames = append(s.Frames, outcome.SubAgent)
		return nil
	}
	if outcome.Interrupt == nil {
		s.top().finishTool(outcome.Content)
		s.Waiting = nil
		return nil
	}
	s.Sequence++
	outcome.Interrupt.ID = fmt.Sprintf("interrupt-%d", s.Sequence)
	outcome.Interrupt.Address = s.address()
	s.Waiting = outcome.Interrupt
	return nil
}
```

`accept` 不认识具体业务工具名：注册的是 sub-agent 适配器就压栈，注册的是普通函数就写回结果。

### Run：只推进栈顶，子任务完成才弹栈

```go
// Run 只推进栈顶。父级 Pending 在子 Agent 完成之前始终保留。
func (r *Runner) Run(ctx context.Context, s *Session) (*Interrupt, error) {
	if s.Waiting != nil {
		return s.Waiting, nil
	}
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		frame := s.top()
		if frame.Done {
			if len(s.Frames) == 1 {
				return nil, nil
			}
			s.Frames = s.Frames[:len(s.Frames)-1]
			s.top().finishTool(frame.Messages[len(frame.Messages)-1].Content)
			continue
		}
		if err := r.step(ctx, s); err != nil {
			return nil, err
		}
		if s.Waiting != nil {
			return s.Waiting, nil
		}
	}
}
```

**中断就是「`Run` 返回了 `Waiting`」。** 整个调用链已经在 `Frames` 里，所以「向上传播」不需要子模型生成一句追问、再让父模型转述——同一个 `Run` 直接返回中断即可。

**子任务完成时弹栈并回填：** 栈顶 `Done` 且有父 Frame 时，`s.top().finishTool(frame.Messages[last].Content)` 把子模型的最终回答写成父级队首委派的工具结果（`ToolCallID` 用父级保留的调用 ID）。父模型只收到子任务的最终结果，看不到子级全部消息。

### Resume：用原状态重进栈顶调用

```go
func (r *Runner) Resume(ctx context.Context, s *Session, id, answer string) (*Interrupt, error) {
	if s.Waiting == nil || s.Waiting.ID != id {
		return nil, fmt.Errorf("no pending interrupt with ID %q", id)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := s.invokeTool(&answer); err != nil {
		return nil, err
	}
	return r.Run(ctx, s)
}
```

**它不会重建子 Frame，也不会再次执行父级的委派工具**，所以不会重新委派。`answer` 用 `*string` 有明确目的：首次执行传 `nil` 表示还没问过；恢复传 `&answer`，即使指向空字符串也表示用户已提交过一次回答——追问收到空白会再次中断并生成新 ID，保存收到空回答则按拒绝处理。

`address()` 遍历每层 Frame 的队首调用拼出路径，仅用于展示，**程序不解析 Address 来恢复**：

```go
func (s *Session) address() string {
	parts := make([]string, 0, len(s.Frames)*2)
	for _, frame := range s.Frames {
		call := frame.Pending[0]
		parts = append(parts, "agent:"+url.PathEscape(frame.Agent.Name),
			"tool:"+url.PathEscape(call.Function.Name)+":"+url.PathEscape(call.ID))
	}
	return strings.Join(parts, ";")
}
```

得到的就是上面那条 `agent:coordinator;tool:note_assistant:delegate-1;agent:note_assistant;tool:ask_user:ask-1`。**恢复真正靠的是「原 `Session` + `Waiting.ID` + 栈顶 `Pending[0]`」**；因为串行栈每次只有一个等待位置，不需要维护 ID 到多个分支的映射。

## 三、两种实现的差别

| 维度 | Eino（AgentTool） | 手写（Frame 栈） |
| --- | --- | --- |
| 中断归属 | 子 Agent 的工具 / 中间件，沿调用链上传 | 栈顶 Frame 的 `Pending` 队首 |
| 恢复入口 | 应用只调最外层 Agent 一次 | 同一个 `Session` + `Waiting.ID`，推进栈顶 |
| 寻址 | `InterruptCtx.Address` 层级路径 | `Waiting.ID` + 栈顶 `Pending`（Address 仅展示） |
| 恢复后 | 重新进入未完成的 AgentTool | 重新执行栈顶队首调用，不重建子 Frame |

**共同点：恢复的是「调用路径」，不是「重新规划」。** 两者都不会因为恢复而让上层模型重跑一遍决策。手写版还有两条自己的边界：**串行栈不支持并行分支或多个位置同时等待**（并行需要额外的分支状态与回答路由，不能共享一个 `top()`），且 `Frame` 引用的 `Agent` 含函数、不能直接序列化成磁盘 checkpoint。

Codex 走的是第三条路——**每个子代理是独立线程**，恢复时按 `thread_id` 重建历史与 `agent_path` / `agent_role` 元数据，嵌套的父子代理树可以一起恢复（见[专业产品的中断设计](product-design.md)）。

## See Also

- [内部中断实现](internal-interrupt.md) — 工具主动请求输入（Eino 与手写版）
- [外部中断实现](external-interrupt.md) — 应用 / 用户从外部暂停（Eino TurnLoop）
- [基于中断恢复的用户交互](user-interaction.md) — 中断之后怎么和用户对话
- [专业产品的中断设计](product-design.md) — Claude Code / Codex 的设计
- [多 Agent 设计对比：Crush / Codex / Claude Code / Eino](../multi-agent-design.md)
