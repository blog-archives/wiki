---
title: 多 Agent 设计对比：Crush / Codex / Claude Code / Eino
updated: "2026-09-21"
---

## Overview

三个 coding agent 加一个 Go 框架（Eino），对「多 agent」围绕同一组问题：预定义了哪些 agent、如何触发、能否动态生成、agent 之间如何交互。共同底线是**角色预先定义、不会由模型凭对话内容凭空发明**；差异主要在「角色的来源有多开放」：Crush 写死 → Codex 用户可配置 → Claude Code 插件可运行时注册；Eino 则把「角色」完全交给开发者用代码组合。

## 1. 预定义了哪些 Agent / 角色

| 项目 | 预定义角色 | 能否自定义 |
|------|-----------|-----------|
| Crush | coder（主编码，全工具）、plan（只读 + 委派，出计划不改文件）、task（只读子代理，做检索） | 否，代码写死三个 |
| Codex | default（兜底）、explorer（代码库问答）、worker（编码执行）；awaiter 已下线 | 是，`agents.toml` 或 `agents/` 目录，同名优先于内置 |
| Claude Code | general-purpose、Explore、Plan（另有 `fork`） | 是，插件以 `.md` 定义并按工作流附带一组 subagent |
| Eino | 不预设角色；由开发者把任意 `Agent` 包装成 `AgentTool`，或配置进 `DeepAgent.SubAgents` | 是，完全由业务代码组合 |

## 2. 触发与启动条件

- **Crush**：coder 启动即默认主 agent；plan 由用户切换（Shift+Tab）；task 由主 agent 调 `agent` 工具时按需派生。
- **Codex**：先看全局开关（多智能体功能是否开启），再做两级限流——生成名额（能否再 spawn）与执行名额（同时运行的子 agent 回合数）分离管控。
- **Claude Code**：通过 Agent 工具的 `subagentType` 派发，且该值必须命中已注册定义，否则拒绝派生。
- **Eino**：由 LLM 在 ReAct 循环里决定是否调用某个 `AgentTool`，或由 `DeepAgent` 的协调 agent 判断任务是否复杂、是否调用 `task` 工具。

## 3. 能否根据需求动态生成 Agent

| 项目 | 结论 |
|------|------|
| Crush | 角色固定，不支持动态生成；唯一例外是 `agentic_fetch` 现造临时检索子 agent，但角色也写死 |
| Codex | 角色静态、任务动态：角色集合封闭，可配置扩展但不运行时生成 |
| Claude Code | 同一类型 + 自定义 prompt（否）；插件 `$.agent.register` 可运行时注册新类型（是，但由插件代码触发）；`agent-creator` 属离线开发；工作流可按配置动态决定数量 |
| Eino | 「动态选型派发」：从预先注册的候选子 agent 中动态选择并派发；不支持凭空 new 出结构未知的全新 Agent |

一致边界：**没有「模型在对话中凭空发明新角色并立即使用」的机制**。新增角色的入口都是代码 / 配置 / 插件，而非对话内容。

## 4. Agent 之间如何交互 / 委派

- **统一模式是工具调用委派，而非 agent 间直接对话。**
- **Crush**：子 agent 在独立子 session 中运行，只接收委派时的 prompt、只回传文本结论，不共享主 agent 历史；委派单向，主 agent（coder/plan）互斥切换、彼此不调用。
- **Codex**：spawn 工具生成子 agent，运行时由注册表追踪实例（角色 / 昵称 / 路径）。
- **Claude Code**：Agent 工具 + `subagentType` 派发；hook 在子代理内触发时会附带 `agent_type`。
- **Eino**：`adk.NewAgentTool` 把子 agent 包装成普通工具塞进父 agent 的 `Tools`，由 LLM 自主调用；`DeepAgent` 的 `task` 工具是它的批量封装（按 `subagent_type` 路由）。

## 5. 共同的设计模式

1. **角色 = 预先定义的能力包**（提示词 / 工具权限 / 模型），**任务 = 运行时动态生成的内容**。角色定边界，任务定本次做什么。
2. **角色的新增入口都在代码侧**（硬编码 / 配置 / 插件注册），不在对话侧；模型只能在已有类型池里选型并自定义任务。
3. **委派一律通过工具调用**（agent-as-tool / spawn），并做上下文隔离（子 agent 拿精简上下文、只回传结论）。
4. **资源管控**：用工具白名单或角色定义做能力隔离，用并发/执行限流防止 agent 无限膨胀。

## 6. 差异与演进

角色来源的开放度是主要分野：**写死（Crush）→ 用户可配置（Codex）→ 插件可运行时注册（Claude Code）→ 完全由代码组合（Eino）**。而交互方式高度一致：都是「主 agent 通过工具委派子 agent，子 agent 回传结果」。

## 附：Eino（Go）创建子 Agent

官方推荐 `ChatModelAgent` + `AgentTool`，或 `DeepAgent`；`SetSubAgents` / 工作流 agent / `supervisor` 已标注 NOT RECOMMENDED。

**重点：两种写法对模型效果等价，用 `deep` 只是让代码更简洁。** 模型始终只负责「选 / 调」工具、不负责「造」agent——子 agent 都在初始化阶段建好，模型调用工具只是触发它运行。

**写法一（手动包 tool）**：每个子 agent 用 `adk.NewAgentTool` 包成独立 tool，模型看到 N 个工具、按名直选；控制粒度最高，但要自己维护 `[]tool.BaseTool`。

```go
// 每个子 agent 包成独立 tool（tool 名 = agent.Name），收集成 tools
tools := make([]tool.BaseTool, 0, len(roles))
for _, r := range roles {
    sub, _ := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
        Name: r.name, Description: r.desc, Instruction: r.instruction, Model: cm,
        ToolsConfig: adk.ToolsConfig{ToolsNodeConfig: compose.ToolsNodeConfig{Tools: r.tools}},
    })
    agentTool, _ := adk.NewAgentTool(ctx, sub)
    tools = append(tools, agentTool)
}

supervisor, _ := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
    Name: "supervisor", Model: cm, Instruction: "...",
    ToolsConfig: adk.ToolsConfig{
        ToolsNodeConfig:    compose.ToolsNodeConfig{Tools: tools},
        EmitInternalEvents: true,
    },
})
```

**写法二（交给 deep）**：只建 `adk.Agent`，`deep.New` 自动把它们包成工具并注册进一个 `task` 工具，模型用 `subagent_type` 选型；deep 附带拆解引导、`general-purpose` 兜底、`write_todos`。代码最简，代价是路由与附带能力由框架固定。

```go
// 按角色建出子 agent（初始化阶段），收集成 subAgents
subAgents := make([]adk.Agent, 0, len(roles))
for _, r := range roles {
    sub, _ := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
        Name: r.name, Description: r.desc, Instruction: r.instruction, Model: cm,
        ToolsConfig: adk.ToolsConfig{ToolsNodeConfig: compose.ToolsNodeConfig{Tools: r.tools}},
    })
    subAgents = append(subAgents, sub)
}

// 交给 deep：内部包成 task 工具，模型通过 task(subagent_type=...) 调度
deepAgent, _ := deep.New(ctx, &deep.Config{
    Name: "supervisor", ChatModel: cm, Instruction: "...",
    SubAgents: subAgents,
    WithoutWriteTodos: true, WithoutGeneralSubAgent: true,
    ToolsConfig: adk.ToolsConfig{EmitInternalEvents: true},
})
```

两者都是「从预注册候选里动态选型」，都不支持凭空 new 全新 agent。

**参考：** 使用 Eino 实现见 [01-eino-subagent](https://github.com/code-practice-archives/agent-practice/tree/main/01-eino-subagent)，自己实现见 [02-native-subagent](https://github.com/code-practice-archives/agent-practice/tree/main/02-native-subagent)。

## See Also

- [AI Agent 面试题清单（120 题）](interview-question-checklist.md) — 其中「多 Agent 与框架选型」模块讨论多 agent 拆分与协作方式。
