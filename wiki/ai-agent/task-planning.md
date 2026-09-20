# 任务拆分与规划

> Sources: DeepWiki Q&A（charmbracelet/crush）, Unknown; DeepWiki Q&A（anthropics/claude-code）, Unknown; DeepWiki Q&A（openai/codex）, Unknown
> Raw: [Crush 拆分依据](../../raw/ai-agent/2026-09-20-crush-task-decomposition.md); [Claude Code 拆分依据](../../raw/ai-agent/2026-09-20-claude-code-task-decomposition.md); [Codex 拆分依据](../../raw/ai-agent/2026-09-20-codex-task-decomposition.md); [Crush 子任务契约](../../raw/ai-agent/2026-09-20-crush-subtask-contracts.md); [Claude Code 子任务契约](../../raw/ai-agent/2026-09-20-claude-code-subtask-contracts.md); [Codex 子任务契约](../../raw/ai-agent/2026-09-20-codex-subtask-contracts.md); [计划质量校验](../../raw/ai-agent/2026-09-20-plan-quality-validation.md); [澄清/假设/停止](../../raw/ai-agent/2026-09-20-clarify-assume-stop.md); [意图识别讨论](../../raw/ai-agent/2026-09-20-intent-recognition.md); [意图识别落地](../../raw/ai-agent/2026-09-20-intent-recognition-implementation.md)
> Updated: 2026-09-20

**导语**：本页按问题组织，覆盖「任务拆分与规划」的六个问题——何时拆、怎么拆、拆成什么、子任务靠什么契约交接、计划有没有质量校验、模糊时如何澄清或停止。核心判断是：**拆分靠 prompt 启发式，契约与校验基本都交给 LLM，唯一的结构化例外是 Codex 的跨会话协议。**

## 一、要不要拆 / 何时拆

判断「要不要拆」比「怎么拆」更重要。

三者都没有复杂度评分代码，全靠质性信号——步骤数、涉及组件/文件数、是否有依赖或歧义、是否多子请求；且都强调简单任务不拆，拆分开销本身是成本。

| 项目        | 触发拆分的信号                                                            | 明确不拆的情况                                      |
| ----------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| Crush       | 多步骤、多组件（models/logic/routes/config/tests/docs）、多文件、多子请求 | 简单或单步任务跳过 `todos`                          |
| Claude Code | 多文件新功能、需架构决策、复杂集成、需求模糊                              | 单行 bug、琐碎改动、需求明确的简单任务、紧急 hotfix |
| Codex       | 非平凡、多阶段/依赖、有歧义、多请求、需中间检查点                         | 简单任务（约最简 25%~40%）不拆、不做单步计划        |

## 二、怎么拆 / 拆分依据

拆分边界是「上下文隔离」和「并行安全」，不是任务难度。不用先判断缺什么，而是看任务特征对应拆法：

| 如果你发现任务……                         | 就按……拆          | 为什么                                                |
| ---------------------------------------- | ----------------- | ----------------------------------------------------- |
| 子任务有先后依赖，后一步要用前一步的结果 | **阶段**          | 只能串行，在关键节点设 gate（澄清、用户批准）         |
| 有多个互相独立的子问题/视角要同时覆盖    | **关注点 / 角色** | 可并行，扩大覆盖面、避免重复                          |
| 要多个 agent 同时改代码                  | **写入范围**      | 只有各 agent 写入范围不重叠才能安全并行，否则退回串行 |
| 一次改动牵涉多个文件/层                  | **组件**          | 列成清单，防止漏改                                    |

**示例（Codex 的正反例）**：

```text
高质量：添加带文件参数的 CLI 入口 → 用 CommonMark 库解析 Markdown → 套用语义化 HTML 模板
        → 处理代码块、图片、链接 → 为非法文件加错误处理
低质量：创建 CLI 工具 → 加 Markdown 解析器 → 转成 HTML
```

## 三、拆成什么

「自己做还是委派」的判据是 critical path——阻塞下一步的自己做，能并行的旁支才委派，与直觉（谁难谁委派）相反。拆出来的产物有两类：

| 产物                            | 用途                         | 项目示例                                                                           |
| ------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| **步骤 / 待办**（plan / todos） | 自己顺序执行、状态跟踪、防漏 | Crush `todos`；Codex `plan`；Claude Code `TodoWrite`                               |
| **子 agent**（subagent）        | 并行加速、上下文隔离         | Crush task / `agentic_fetch` 子 agent；Claude Code 三类子代理；Codex `spawn_agent` |

代码编辑类并行时，各子 agent 的写入范围必须互不重叠，否则退回串行。

## 四、子任务的输入输出与完成条件约定

契约强度取决于「子任务是不是独立会话」，结构是为了协调，不是为了任务质量。

Crush 的子 Agent 是同步阻塞的进程内调用，Claude Code 是 prompt 编排步骤，只有 Codex 是独立 thread、要跨轮次路由与恢复，才需要机器可读的结构。前两者没有严格约定，输入输出、依赖、完成条件都靠大模型自己判断。

| 维度         | Crush                | Claude Code           | Codex                                   |
| ------------ | -------------------- | --------------------- | --------------------------------------- |
| 输入输出约定 | 自由文本，仅非空校验 | 自然语言 / 松散 YAML  | `InterAgentCommunication` + JSON Schema |
| 依赖判定     | 隐式调用顺序         | 文本顺序隐式依赖      | `AgentPath` 层级 + `parent_turn_id`     |
| 完成条件     | 文本非空即完成       | LLM 验证 + 置信度 ≥80 | `AgentStatus` 终态事件                  |

**Codex 的结构化协议**：内部 agent-to-agent 消息渲染为固定文本格式，对外 app-server 协议层才用 JSON Schema。

```text
Message Type: MESSAGE
Task name: /root
Sender: /root/child
Payload:
child progress
```

```json
{ "status": "completed", "message": "done" }
```

```json
{
    "thread_spawn": {
        "depth": 1,
        "parent_thread_id": "thread_abc123",
        "agent_path": "/root/child",
        "agent_nickname": null,
        "agent_role": null
    }
}
```

状态枚举：`pendingInit` / `running` / `interrupted` / `completed` / `errored` / `shutdown` / `notFound`；工具枚举：`spawnAgent` / `sendInput` / `resumeAgent` / `wait` / `closeAgent` / `sendMessage` / `followupTask` / `interruptAgent` / `listAgents`。

Crush 子 Agent 输入只有自由文本 `Prompt`（仅校验非空），输出纯文本；`todos` 的 `session.Todo` 没有输入输出字段。Claude Code 的 `code-review` 用自然语言规定输出为 issue 列表，`multi-agent-swarm` 的 `dependencies` 字段只被写入、未见强制执行。

## 五、计划质量校验：漏项 / 重复 / 不可执行

三家都没有程序化的计划校验器，漏项、重复、不可执行全靠提示词软约束加 LLM 自检；其中真正值得借鉴的是 Claude Code 的「生成 → 独立验证 → 过滤」。

- **Claude Code**：`code-architect` 只生成蓝图（含 `Build Sequence`），不校验；`/code-review` 的「生成 → 独立验证 → 过滤」是唯一真正的二次校验，但服务于 PR 代码审查。
- **Codex**：`update_plan` 只有 prompt 层行为指导（高质量/低质量示例）与状态转换规则（同时只能一个 `in_progress`、不能从 `pending` 直接跳到 `completed`），靠模型遵守；app-server 的 `turn/plan/updated` 只透传展示。
- **Crush**：Plan 模式只检测 `CRUSH_PLAN_READY` 标记、不解析内容，用户只能通过 `OnRequestChanges` 手动反馈；运行时的 `hasRepeatedToolCalls` 只防工具调用死循环，不是计划文本的静态分析。

运行时能拦住「重复动作」，拦不住「重复或漏掉的计划步骤」；「生成 → 独立验证 → 过滤」值得从代码审查迁移到计划场景。

## 六、目标模糊 / 信息缺失 / 约束冲突：澄清、假设还是停止

默认值由产品定位决定——执行型 agent 默认先动手，重流程的 `feature-dev` 默认先澄清——但三者共识一致：权限与澄清分离、能自己查到的不要问、停下来要报清尝试内容与最小外部动作。

- **Crush**：`<decision_making>` 要求自主决策，需求不完整但不明显危险时做最合理假设、简要说明后继续；只有真正含糊的业务需求、大权衡、数据丢失、穷尽后阻塞四种情况才停。
- **Codex**：Default 协作模式要求 `strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions`；外部写入、破坏性操作、范围重大扩张才需确认。
- **Claude Code**：`feature-dev` 的 Phase 3 澄清标为 `CRITICAL`、`DO NOT SKIP`，必须等回答才进架构设计；Phase 5 明确 `DO NOT START WITHOUT USER APPROVAL`。

同一家 Claude Code 在通用子代理规范里也承认「模式冲突按最新/最明确规则假设」，说明澄清优先是流程选择，而非铁律。

## 七、意图识别：要不要单独做、怎么做

意图识别不是必选项，判据是「识别出这个意图之后，程序会具体改变什么」：会切换工作流、子 agent、提示词或工具范围就值得做；若只是得到一个 `intent` 标签、后面仍用同一模型和工具，就先不加。前面三家 coding agent 都没有独立分类层，正属后者。

适合做的是**一个入口承接多种流程明显不同的业务**（如题库助手的讲解 / 找题 / 制定训练计划）；**入口已确定任务类型时不必做**（点进「生成学习计划」后只需提取参数）；**要区分只读与写入模式时值得做**，但识别出「修改意图」不等于拿到写入权限，实际写入仍要过权限与确认。需要路由时，放在收到消息之后、进入业务之前。

落地就是「一段分类提示词 + 一次模型调用 + 结构化结果校验 + 程序路由」，不必做成多轮 Agent。预先定义固定类别（如 `explain` / `search_problems` / `study_plan` / `unknown` / `unsupported`）并约定边界，让模型在类别中选择而非自由回答；提示词只输出 `intent` 与 `clarification_question`。多轮场景分类的是「上下文中的最新请求」而非孤立一句——「还是改成半小时吧」要结合当前任务才判得出。用 Structured Outputs / JSON Schema 限定枚举，但格式正确不等于判断正确，仍需处理失败与截断，再由程序分支。

测试重点在分类边界：参数不足（进流程再追问）、意图不明（返回 `unknown` 澄清）、一句多任务（需 `multi_task` 入口）；发现错误就调整类别边界、补混淆示例并重跑。

## See Also

- [多 Agent 设计对比：Crush / Codex / Claude Code / Eino](multi-agent-design.md) — 各项目 agent 角色的预定义、触发与委派。
- [AI Agent 面试题清单（120 题）](interview-question-checklist.md) — 第 03 模块「任务拆分与规划」对应本页。
