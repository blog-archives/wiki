---
title: 基于中断恢复的用户交互
updated: "2026-09-21"
order: 5
---

> 本文整理自 [agent-practice](https://github.com/code-practice-archives/agent-practice) 仓库 03、04 实验的 README 与源码。

## Overview

**用户交互是建在「中断/恢复」之上的一层业务语义。** 机制（怎么暂停、怎么恢复）见[内部中断实现](internal-interrupt.md)与[外部中断实现](external-interrupt.md)，嵌套调用链上的传播与寻址见[多 Agent 中断实现](multi-agent-interrupt.md)；这一层要回答的是：**什么情况下该中断去问用户、问什么、以及回答如何回到发起方。** 多 Agent 场景下最要紧的一条是：**「谁与用户交互」不随 Agent 数量改变**——中断统一冒泡到最外层 Agent，应用只跟最外层 Agent 打交道。

## 一、两种触发：追问与授权

**追问由模型决定，授权由应用规则决定。** 前者是 `ask_user` 被模型调用后，工具内部判断「信息是否足够」再中断（工具写法见[内部中断实现](internal-interrupt.md)）；后者是 `save_note` 一被调用，中间件无论收到什么参数都先请求授权。

关键差异在于**模型能否绕过**：授权工具的参数里没有 `approved` 字段，模型无法靠填参数跳过检查；授权只对应本次中断 ID，不是整个会话永久放行。

追问工具返回结构化结果而不是裸字符串，让模型明确「这条 `tool` 消息装的是用户刚补充的原文」：

```json
{"question":"要保存什么内容？","user_answer":"今天读了十页书。"}
```

授权用一个中间件包装业务工具，只在用户同意时调用 `next`：

```go
func (m *approvalMiddleware) WrapInvokableToolCall(
	_ context.Context,
	next adk.InvokableToolCallEndpoint,
	tc *adk.ToolContext,
) (adk.InvokableToolCallEndpoint, error) {
	if tc.Name != "save_note" {
		return next, nil
	}
	return func(ctx context.Context, arguments string, opts ...tool.Option) (string, error) {
		target, supplied, decision := tool.GetResumeContext[string](ctx)
		if !target || !supplied {
			prompt := fmt.Sprintf("[请求授权] 工具：%s\n调用 ID：%s\n参数：%s\n"+
				"将在系统临时目录新建 eino-note-*.txt。输入 yes 同意，其他回答拒绝：",
				tc.Name, tc.CallID, arguments)
			return "", tool.Interrupt(ctx, prompt)
		}
		if strings.TrimSpace(decision) != "yes" {
			return "用户拒绝保存，未创建文件。请停止，不要重试。", nil
		}
		// 中断恢复会重新进入包装器，只有当前调用获得授权后才能进入业务工具。
		return next(ctx, arguments, opts...)
	}, nil
}
```

**中间件只拦 `save_note`，其余工具直接放行**；拒绝时返回拒绝结果、不调用 `next`。注册用当前版本推荐的接口式中间件（旧字段 `ChatModelAgentConfig.Middlewares` 已废弃）：

```go
Handlers: []adk.ChatModelAgentMiddleware{&approvalMiddleware{}},
```

本例工具都是 `InferTool` 创建的同步工具，所以只覆盖 `WrapInvokableToolCall`；以后引入流式或 enhanced 工具，需要覆盖对应的包装方法，不能假设这个方法能拦下所有工具类型。

**交互入口与业务是分开的：** 工具不读 stdin，终端输入属于应用层。应用只读取一次对应中断的回答，再消费恢复后的新事件；恢复后还可能再次中断，所以是个循环。换成网页表单、HTTP 或 WebSocket 时，中断协议不变，只替换收集回答的那一层。

## 二、父子 Agent 下，交互统一到最外层

**子 Agent 没有自己的用户输入通道，主 Agent 也不直接读输入。** 中断沿调用链逐层冒泡到最外层 Agent，应用只跟最外层 Agent 对话，恢复也只用子中断的 ID——代码里不需要判断「该恢复父 Agent 还是子 Agent」（传播机制见[多 Agent 中断实现](multi-agent-interrupt.md)）。

```text
中断向上：深层工具 → 所属 Agent → AgentTool → 上层 Agent → … → 最外层 Agent → 应用
回答交回：用户 → 应用 → 最外层 Agent → 按保存的调用路径恢复 → 原中断位置
```

**标注来源靠地址，不靠名字。** 中断的层级路径（`InterruptCtx.Address`）里带着所属 Agent 和工具调用 ID，所以同名工具也能区分、弹窗也能说清「是哪个 Agent 在问」：

```text
agent:coordinator;tool:note_assistant:delegate-1;agent:note_assistant;tool:ask_user:ask-1
```

Claude Code 把「用户交互统一收敛到主会话」做成了产品设计——subagent 的权限询问冒泡到主 session、标明来源、Esc 只拒绝该次调用，另配异步通知与 `AskUserQuestion`（见[中断与恢复子专题](ai-agent/interrupt-resume/index.md)）。

## 三、工程边界

- **「授权」只是本次操作的用户确认**，不是操作系统权限，也不是完整的身份鉴权系统。
- **恢复不重放内存等待者。** 挂起前排队的用户输入与悬而未决的审批请求不会自动重放（Codex 明确 best-effort 丢弃）。
- **自动传播依赖内置 `AgentTool`**；自行包装 Agent、吞掉中断信号，或用独立上下文另起一个执行循环时，需自行桥接中断与状态。
- **中间件只拦同步工具**，且父 Agent 的中间件不会自动替代子 Agent 内部的授权策略。
- **多个同时中断的位置要分别展示**，并按各自 ID 收集回答；不能把「一个中断」理解成「立刻取消其他 Agent」。

## See Also

- [内部中断实现](internal-interrupt.md) — 工具主动请求输入
- [外部中断实现](external-interrupt.md) — 应用 / 用户从外部暂停
- [多 Agent 中断实现](multi-agent-interrupt.md) — 嵌套调用链上的传播与寻址
- [中断与恢复子专题](ai-agent/interrupt-resume/index.md) — Claude Code / Codex 的设计
- [多 Agent 设计对比：Crush / Codex / Claude Code / Eino](../multi-agent-design.md)
- [Claude Code 的 Agent 系统与 Subagents](../../claude-code/agent-system-and-subagents.md)
