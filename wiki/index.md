---
title: Knowledge Base Index
updated: "2026-09-22"
---

| 目录 | 内容 |
| --- | --- |
| [ai-agent](ai-agent/index.md) | AI Agent 应用开发与工程实践：面试题清单、多 Agent 设计对比、任务拆分与规划、系统提示词设计（指令作用域、计划状态与验证策略）、Agent Skills、模型调用错误处理与 Eino 重试故障转移，及「工具调用」「中断与恢复」「上下文工程」子专题 |

## 错误处理与重试

| 文章 | 内容 | Updated |
| --- | --- | --- |
| [模型调用错误处理：策略设计与 Eino 实现](ai-agent/model-call-retry-and-fallback.md) | 第 44 题：参考 Codex / Claude Code 设计，用 Eino 实现分类重试与模型切换 | 2026-09-22 |

## 工具调用

围绕 Codex 材料，按一次调用的时间顺序整理：工具怎样注册与按需发现、调用怎样分发、结果过大怎样减量、反复调用怎样判断进展。

| 文章 | 内容 | Updated |
| --- | --- | --- |
| [工具调用（子专题）](ai-agent/tool-call/index.md) | 阅读顺序与一次工具调用的完整生命周期 | 2026-09-22 |
| [工具发现与调用：从工具注册到执行分发](ai-agent/tool-call/tool-discovery-and-dispatch.md) | 工具注册、延迟暴露、tool_search / BM25 检索与 dispatch 管线 | 2026-09-22 |
| [工具调用大结果处理](ai-agent/tool-call/large-tool-result-handling.md) | 第 34 题：截断、落盘与按需读取，控制进入上下文的内容 | 2026-09-22 |
| [重复工具调用的检测](ai-agent/tool-call/repeated-tool-call-detection.md) | 第 43 题：调用指纹、进展判断与停止条件 | 2026-09-22 |

## Agent Skills

| 文章 | 内容 | Updated |
| --- | --- | --- |
| [Agent Skills：发现、按需加载与渐进披露](ai-agent/agent-skills.md) | 第 69 题：发现 / 加载两阶段、按需读正文、元数据预算与压缩 | 2026-09-22 |

## 上下文工程

围绕 Codex 源码材料，解释请求组装、分层存储、预算与压缩、信息完整性、任务状态和跨会话记忆。

| 文章 | 内容 | Updated |
| --- | --- | --- |
| [上下文工程（专题入口）](ai-agent/context-engineering/index.md) | 阅读顺序、信息生命周期与源码证据边界 | 2026-09-22 |
| [上下文组装：完整流程与 Prompt 构成](ai-agent/context-engineering/context-assembly.md) | 完整执行流程、Prompt 字段与语义、来源存储及 API 映射 | 2026-09-22 |
| [上下文存储：历史、当前窗口与任务状态怎样分工](ai-agent/context-engineering/context-storage.md) | rollout 文件与记录类型、追加写入、内存窗口、Goal 与 Plan、恢复及分层原因 | 2026-09-22 |
| [上下文预算与压缩：何时减量，保留什么](ai-agent/context-engineering/budget-and-compaction.md) | 预算检查的核心思路、压缩触发时机，以及截断、摘要与窗口重建的分工 | 2026-09-22 |
| [上下文完整性：工具关联、有效约束与质量验证](ai-agent/context-engineering/context-integrity.md) | 摘要提示词与历史重建、压缩前后示例，以及调用关系和有效要求的验证 | 2026-09-22 |
| [任务状态：让目标与进度跨越上下文窗口](ai-agent/context-engineering/task-state.md) | 目标与进度的保存、更新、恢复，以及执行结果的确认 | 2026-09-22 |
| [长期记忆：从历史记录到可复用经验](ai-agent/context-engineering/long-term-memory.md) | 从跨会话经验出发：该记住什么、未来任务怎样读到，以及更新、过期与完整生命周期 | 2026-09-22 |

## 相关基础文章

| 文章 | 内容 | Updated |
| --- | --- | --- |
| [任务拆分与规划](ai-agent/task-planning.md) | 规划与委派设计；补充持久 Goal 与步骤计划的区别 | 2026-09-22 |
| [从 Codex 学习中断恢复的实现](ai-agent/interrupt-resume/codex-interrupt-recovery.md) | 执行停止与历史重建；衔接独立任务状态恢复 | 2026-09-22 |
| [AI Agent 面试题清单（120 题）](ai-agent/interview-question-checklist.md) | 上下文与记忆题组关联专题阅读入口 | 2026-09-22 |
