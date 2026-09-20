# 多 Agent 设计对比：Crush / Codex / Claude Code

> Sources: DeepWiki Q&A（charmbracelet/crush；openai/codex；anthropics/claude-code）, Unknown
> Raw: [Crush](../../raw/ai-agent/2026-09-20-crush-agent-architecture.md); [Codex](../../raw/ai-agent/2026-09-20-codex-multi-agent-roles.md); [Claude Code](../../raw/ai-agent/2026-09-20-claude-code-agents.md)
> Updated: 2026-09-20

## Overview

三个 coding agent 对「多 agent」的设计，围绕同一组问题：预定义了哪些 agent、如何触发、能否动态生成、agent 之间如何交互。三者的共同底线是**角色预先定义、不会由模型凭对话内容凭空发明**；差异主要在「角色的来源有多开放」：Crush 写死 → Codex 用户可配置 → Claude Code 插件可在运行时注册。

## 1. 预定义了哪些 Agent / 角色

| 项目 | 预定义角色 | 能否自定义 |
|------|-----------|-----------|
| Crush | coder（主编码，全工具）、plan（只读 + 委派，出计划不改文件）、task（只读子代理，做检索） | 否，代码写死三个 |
| Codex | default（兜底）、explorer（代码库问答）、worker（编码执行）；awaiter 已下线 | 是，`agents.toml` 或 `agents/` 目录，同名优先于内置 |
| Claude Code | general-purpose、Explore、Plan（另有 `fork`） | 是，插件以 `.md` 定义并按工作流附带一组 subagent |

## 2. 触发与启动条件

- **Crush**：coder 启动即默认主 agent；plan 由用户切换（Shift+Tab）；task 由主 agent 调 `agent` 工具时按需派生。
- **Codex**：先看全局开关（多智能体功能是否开启），再做两级限流——生成名额（能否再 spawn）与执行名额（同时运行的子 agent 回合数）分离管控。
- **Claude Code**：通过 Agent 工具的 `subagentType` 派发，且该值必须命中已注册定义，否则拒绝派生。

## 3. 能否根据需求动态生成 Agent

| 项目 | 结论 |
|------|------|
| Crush | 角色固定，不支持动态生成；唯一例外是 `agentic_fetch` 现造临时检索子 agent，但角色也写死 |
| Codex | 角色静态、任务动态：角色集合封闭，可配置扩展但不运行时生成 |
| Claude Code | 同一类型 + 自定义 prompt（否）；插件 `$.agent.register` 可运行时注册新类型（是，但由插件代码触发）；`agent-creator` 属离线开发；工作流可按配置动态决定数量 |

三者一致的边界：**没有「模型在对话中凭空发明新角色并立即使用」的机制**。新增角色的入口都是代码 / 配置 / 插件，而非对话内容。

## 4. Agent 之间如何交互 / 委派

- **统一模式是工具调用委派，而非 agent 间直接对话。**
- **Crush**：子 agent 在独立子 session 中运行，只接收委派时的 prompt、只回传文本结论，不共享主 agent 历史；委派单向，主 agent（coder/plan）互斥切换、彼此不调用。
- **Codex**：spawn 工具生成子 agent，运行时由注册表追踪实例（角色 / 昵称 / 路径）。
- **Claude Code**：Agent 工具 + `subagentType` 派发；hook 在子代理内触发时会附带 `agent_type`。

## 5. 共同的设计模式

1. **角色 = 预先定义的能力包**（提示词 / 工具权限 / 模型），**任务 = 运行时动态生成的内容**。角色定边界，任务定本次做什么。
2. **角色的新增入口都在代码侧**（硬编码 / 配置 / 插件注册），不在对话侧；模型只能在已有类型池里选型并自定义任务。
3. **委派一律通过工具调用**（agent-as-tool / spawn），并做上下文隔离（子 agent 拿精简上下文、只回传结论）。
4. **资源管控**：用工具白名单或角色定义做能力隔离，用并发/执行限流防止 agent 无限膨胀。

## 6. 差异与演进

角色来源的开放度是三者最明显的分野：**写死（Crush）→ 用户可配置（Codex）→ 插件可运行时注册（Claude Code）**。而交互方式高度一致：都是「主 agent 通过工具委派子 agent，子 agent 回传结果」。

## See Also

- [AI Agent 面试题清单（120 题）](interview-question-checklist.md) — 其中「多 Agent 与框架选型」模块讨论多 agent 拆分与协作方式。
