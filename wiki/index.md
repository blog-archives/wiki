# Knowledge Base Index

## ai-agent

AI Agent 应用开发与工程实践（原理、工具调用、上下文、RAG、评测、安全、Go 工程等）。

| Article | Summary | Updated |
|---------|---------|---------|
| [AI Agent 面试题清单（120 题）](ai-agent/interview-question-checklist.md) | Go/后端转 AI Agent 的 16 模块 120 题面试准备清单，含 40 道优先题分布 | 2026-09-20 |
| [多 Agent 设计对比：Crush / Codex / Claude Code / Eino](ai-agent/multi-agent-design.md) | 四项目对多 agent 的预定义角色、触发、动态生成、交互方式对比，含 Eino 两种写法（AgentTool / DeepAgent）的 demo、运行逻辑与选型 | 2026-09-20 |
| [任务拆分与规划](ai-agent/task-planning.md) | 何时/如何拆、拆成步骤还是子 agent；子任务契约（Codex 有 JSON 协议，Crush/CC 靠 LLM）；计划质量校验；澄清·假设·停止；意图识别与路由；出错后的重试/替换/重规划；中途改目标的 steer/排队/中断 | 2026-09-20 |
| [系统提示词设计](ai-agent/system-prompt-design.md) | 以 Codex CLI 提示词为样本：身份/工作方式/工具三层结构，指令优先级、计划状态机、验证分层、输出格式规范四类可借鉴写法 | 2026-09-20 |

## ai-agent-book

bojieli/ai-agent-book 开源书《深入理解 AI Agent：设计原理与工程实践》的原始中文文档，按章存档，供直接阅读学习。

| Article | Summary | Updated |
|---------|---------|---------|
| [深入理解 AI Agent：设计原理与工程实践（README）](ai-agent-book/README.md) | [Archived] 项目说明：全书简介、电子书下载、10 章速览、编译方式 | 2026-09-20 |
| [引言](ai-agent-book/introduction.md) | [Archived] 成书背景与全书安排 | 2026-09-20 |
| [第 1 章 AI Agent 入门](ai-agent-book/chapter1.md) | [Archived] Agent = LLM + 上下文 + 工具；Harness 工程；全书设计模式 | 2026-09-20 |
| [第 2 章 上下文工程](ai-agent-book/chapter2.md) | [Archived] 上下文决定能力上限：API 结构、KV Cache、提示工程、Skills、状态栏、压缩 | 2026-09-20 |
| [第 3 章 用户记忆和知识库](ai-agent-book/chapter3.md) | [Archived] 用户记忆系统、RAG 基础、知识的组织与检索 | 2026-09-20 |
| [第 4 章 工具](ai-agent-book/chapter4.md) | [Archived] 工具分类与通用设计原则、MCP 与 Skill Hub、主动工具发现、感知/执行/协作工具 | 2026-09-20 |
| [第 5 章 Coding Agent 与通用 Agent](ai-agent-book/chapter5.md) | [Archived] Coding Agent 全景；代码作为通用 Agent 的元能力 | 2026-09-20 |
| [第 6 章 交互：观察与动作空间的扩展](ai-agent-book/chapter6.md) | [Archived] 异步与事件驱动、语音、Computer Use、机器人操作 | 2026-09-20 |
| [第 7 章 Agent 的评估](ai-agent-book/chapter7.md) | [Archived] 评估指标、环境、数据集、自动化评估、模型选型、统计显著性、可观测性、仿真环境 | 2026-09-20 |
| [第 8 章 模型后训练](ai-agent-book/chapter8.md) | [Archived] 预训练/SFT/RL 四阶段、奖励设计、信用分配、蒸馏与实践要点 | 2026-09-20 |
| [第 9 章 Agent 的持续进化](ai-agent-book/chapter9.md) | [Archived] 学习信号、四种更新载体、长期进化闭环 | 2026-09-20 |
| [第 10 章 多 Agent 协作](ai-agent-book/chapter10.md) | [Archived] 分类框架、何时优于单 Agent、共享/不共享上下文、失败模式、Agent 社会 | 2026-09-20 |
| [后记](ai-agent-book/afterword.md) | [Archived] 回到 Agent = LLM + 上下文 + 工具 | 2026-09-20 |
| [学习建议](ai-agent-book/LEARNING.md) | [Archived] 核心理念、学习路径、难度分级、实践建议 | 2026-09-20 |
