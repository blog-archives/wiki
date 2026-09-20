# 任务拆分与规划

> Sources: DeepWiki Q&A（charmbracelet/crush）, Unknown; DeepWiki Q&A（anthropics/claude-code）, Unknown; DeepWiki Q&A（openai/codex）, Unknown
> Raw: [Crush 拆分依据](../../raw/ai-agent/2026-09-20-crush-task-decomposition.md); [Claude Code 拆分依据](../../raw/ai-agent/2026-09-20-claude-code-task-decomposition.md); [Codex 拆分依据](../../raw/ai-agent/2026-09-20-codex-task-decomposition.md); [Crush 子任务契约](../../raw/ai-agent/2026-09-20-crush-subtask-contracts.md); [Claude Code 子任务契约](../../raw/ai-agent/2026-09-20-claude-code-subtask-contracts.md); [Codex 子任务契约](../../raw/ai-agent/2026-09-20-codex-subtask-contracts.md); [计划质量校验](../../raw/ai-agent/2026-09-20-plan-quality-validation.md)
> Updated: 2026-09-20

**模块导语**：本模块覆盖「任务拆分与规划」的三件事——要不要拆、怎么拆；拆出来的子任务靠什么契约交接；计划本身有没有质量校验。共同结论是：拆分靠 prompt 启发式，契约与校验基本都交给 LLM。

## 一、要不要拆 / 何时拆

**判断依据是质性信号，没有复杂度评分算法。** 三者共用的信号：步骤数、涉及组件/文件数、是否有依赖或歧义、是否多子请求。反直觉的共识是——**简单任务不要拆**，拆分开销本身是成本。

| 项目        | 触发拆分的信号                                                            | 明确不拆的情况                                      |
| ----------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| Crush       | 多步骤、多组件（models/logic/routes/config/tests/docs）、多文件、多子请求 | 简单或单步任务跳过 `todos`                          |
| Claude Code | 多文件新功能、需架构决策、复杂集成、需求模糊                              | 单行 bug、琐碎改动、需求明确的简单任务、紧急 hotfix |
| Codex       | 非平凡、多阶段/依赖、有歧义、多请求、需中间检查点                         | 简单任务（约最简 25%~40%）不拆、不做单步计划        |

**典型示例**（Codex，把「何时拆」写得最明确）：

```text
什么时候用计划：
- 任务非平凡，需要跨长时间跨度的多步操作。
- 存在逻辑阶段或依赖，顺序很重要。
- 工作有歧义，列出高层目标有帮助。
- 你想要中间检查点来做反馈和验证。
- 用户在一个 prompt 里要求做不止一件事。
```

## 二、怎么拆 / 拆分依据

不用先判断「缺什么」，而是**看任务本身有什么特征，特征直接对应拆法**。对着下表自查即可：

| 如果你发现任务……                         | 就按……拆          | 为什么                                                |
| ---------------------------------------- | ----------------- | ----------------------------------------------------- |
| 子任务有先后依赖，后一步要用前一步的结果 | **阶段**          | 只能串行，在关键节点设 gate（澄清、用户批准）         |
| 有多个互相独立的子问题/视角要同时覆盖    | **关注点 / 角色** | 可并行，扩大覆盖面、避免重复                          |
| 要多个 agent 同时改代码                  | **写入范围**      | 只有各 agent 写入范围不重叠才能安全并行，否则退回串行 |
| 一次改动牵涉多个文件/层                  | **组件**          | 列成清单，防止漏改                                    |

**每个维度的典型示例：**

**① 阶段**——拆出的每步要是一个有意义的逻辑阶段，而非笼统动作（Codex 正反例）：

```text
高质量计划：
1. 添加带文件参数的 CLI 入口
2. 用 CommonMark 库解析 Markdown
3. 套用语义化 HTML 模板
4. 处理代码块、图片、链接
5. 为非法文件加错误处理

低质量计划：
1. 创建 CLI 工具
2. 加 Markdown 解析器
3. 转成 HTML
```

**② 关注点 / 角色**——并行的子代理各盯一个不重叠的侧面（Claude Code）：

```text
1. 并行启动 2-3 个 code-explorer 代理。每个代理应：
   - 针对代码库的不同侧面（例如相似功能、高层理解、架构理解、用户体验等）
```

**③ 写入范围**——要并行改代码，先保证各子任务写入集不重叠（Codex）：

```text
- 对代码编辑类子任务，拆分时让每个委派任务的写入集互不重叠。
```

**④ 组件**——按要改动的层列清单，防止漏改（Crush）：

```text
- 找出所有需要改动的组件（models、logic、routes、config、tests、docs）
```

## 三、拆成什么

拆出来的产物有两类，用途不同：

| 产物                            | 用途                         | 项目示例                                                                              |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| **步骤 / 待办**（plan / todos） | 自己顺序执行、状态跟踪、防漏 | Crush `todos`（pending/in_progress/completed）；Codex `plan`；Claude Code `TodoWrite` |
| **子 agent**（subagent）        | 并行加速、上下文隔离         | Crush task / `agentic_fetch` 子 agent；Claude Code 三类子代理；Codex `spawn_agent`    |

**选哪种的判断**：

- 阻塞下一步的关键路径任务 → 拆成步骤，自己顺序做。
- 可并行、上下文可隔离的旁支任务 → 拆成子 agent 委派。
- 代码编辑类并行 → 各子 agent 的写入范围必须**互不重叠**，否则退回串行。

**典型示例**（Codex 给出「自留 vs 委派」的判据——阻塞关键路径的自己本地做）：

```text
- 当下一步依赖某个结果时，不要委派这种紧急阻塞工作。如果紧接着的动作被该任务阻塞，
  主流程通常应自己本地完成，以保持关键路径推进。
- 当子任务足够简单、且能与本地工作并行时，才使用子代理。
```

### 拆分的核心思考

1. **判断「要不要拆」比「怎么拆」更重要。**

三者都没有复杂度评分代码，全凭启发式信号；且都强调简单任务不拆——过度拆分反而拖慢。

1. **拆分边界是「上下文隔离」和「并行安全」，不是任务难度。**

Codex 的 write set 不重叠、Crush 子 agent 独立 session、Claude Code 子代理回传文件清单，都在做隔离。而「自己做还是委派」的判据是 **critical path**：阻塞下一步的自己做，能并行的旁支才委派——与直觉（谁难谁委派）相反。

1. **决策权在模型运行时。**

拆分规则是写在 system prompt / slash command 里的指令模板，不是可编程调度的算法；与[多 Agent 设计对比](multi-agent-design.md)的结论一致：角色/模板预先定义，任务运行时动态生成。

## 四、子任务的输入输出与完成条件约定

**结论**：Crush 和 Claude Code 没有严格约定，输入输出、依赖、完成条件都靠大模型自己判断；**Codex 有明确的结构化约定**。

| 维度         | Crush                | Claude Code           | Codex                                   |
| ------------ | -------------------- | --------------------- | --------------------------------------- |
| 输入输出约定 | 自由文本，仅非空校验 | 自然语言 / 松散 YAML  | `InterAgentCommunication` + JSON Schema |
| 依赖判定     | 隐式调用顺序         | 文本顺序隐式依赖      | `AgentPath` 层级 + `parent_turn_id`     |
| 完成条件     | 文本非空即完成       | LLM 验证 + 置信度阈值 | `AgentStatus` 终态事件                  |

### Codex：有结构化约定

**输入输出** —— 跨代理消息统一封装在 `InterAgentCommunication`（发送方/接收方 `AgentPath`、消息内容、`trigger_turn`），内部渲染为固定文本格式，例如进度消息：

```text
Message Type: MESSAGE
Task name: /root
Sender: /root/child
Payload:
child progress
```

完成消息把类型换成 `Message Type: FINAL_ANSWER`，Payload 为 `child completion`。

**完成条件** —— `CollabAgentState` / `CollabAgentStatus`：

```json
{ "status": "completed", "message": "done" }
```

```json
[
    "pendingInit",
    "running",
    "interrupted",
    "completed",
    "errored",
    "shutdown",
    "notFound"
]
```

`Completed` / `Errored` 携带 `message`，其余为 `null`；由 `EventMsg::TurnComplete` / `TurnAborted` 驱动，只有终态（`is_final`）才向父级转发。

**依赖关系** —— `SubAgentSource::ThreadSpawn`：

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

**工具与活动枚举**：

```json
[
    "spawnAgent",
    "sendInput",
    "resumeAgent",
    "wait",
    "closeAgent",
    "sendMessage",
    "followupTask",
    "interruptAgent",
    "listAgents"
]
```

```json
["started", "interacted", "interrupted", "completed"]
```

### Crush / Claude Code：无严格约定（一笔带过）

- **Crush**：子 Agent 输入只有自由文本 `Prompt`（仅校验非空），输出纯文本（仅校验非空）；`todos` 的 `session.Todo` 没有输入输出字段。依赖是隐式调用顺序，返回非空文本即算完成。
- **Claude Code**：`code-review` 用自然语言规定输出为 issue 列表；完成与否由第二个验证子 agent 判断，置信度 0-100、≥80 才采纳。`multi-agent-swarm` 的 `dependencies` 字段只被写入、未见强制执行。

### 关键思考

1. **约束强度取决于「子任务是不是独立会话」，而不是任务本身。**

Crush 的子 Agent 是一次同步阻塞的进程内调用，父 Agent 拿到文本就继续，天然不需要契约；Claude Code 的子代理是 prompt 模板里的编排步骤，靠文本顺序串起来。Codex 的子代理是独立的 thread / session，要跨轮次路由、恢复、通知，才必须有 `AgentPath`、`AgentStatus`、`parent_turn_id` 这些机器可读的结构。可见结构是为了协调，不是为了任务质量。

1. **Codex 的「结构化」是分层的，模型侧仍然读文本。**

内部 agent-to-agent 消息最终渲染成 `Message Type` / `Task name` / `Sender` / `Payload` 的纯文本，JSON Schema 只在对外 app-server 协议层。类型系统约束的是引擎与客户端，而不是 LLM 的语义理解——子任务内容对不对，依然没有代码校验。

1. **三家都没解决「语义完成」，只解决了「流程完成」。**

Codex 的 `Completed` 来自 `TurnComplete` 事件，本质是这一轮跑完了；Claude Code 用第二个 LLM 打分（≥80）来近似质量；Crush 只判断输出非空。完成条件从非空进化到状态枚举、再到 LLM 复核，但都不是任务是否真正达成的证明。

1. **要自建多 Agent，按协调需求选最小契约。**

同步 fire-and-forget 的委派，文本 prompt 加非空校验就够；一旦需要异步、可恢复、多级转交，至少要有四样——身份/路径、状态枚举、依赖边、消息信封，正是 Codex 那套。超出这个范围再上 DAG 或 schema，通常是过度设计。

1. **依赖目前都是「通知」而非「调度」。**

Codex 能沿 `AgentPath` 把完成信封发给父级，但没有看到基于依赖边阻塞启动的调度器；Crush 是同步阻塞，Claude Code 是文本顺序。真正的依赖图调度（谁依赖谁、满足才启动）在这三个方案里都还没有。

## 五、计划质量校验：漏项 / 重复 / 不可执行

**一句话结论**：三家都没有程序化的计划质量校验器；漏项、重复、不可执行的检测全靠提示词软约束加 LLM 自检，代码只做流程与死循环层面的防护。

### 关键判断

1. **没有独立的计划验证器，只有「生成」和「自检」。**

Claude Code 的 `code-architect` 只负责生成蓝图（含 `Build Sequence`），不校验；Codex 的 `update_plan` 只有提示词层的行为指导和状态转换规则；Crush 靠 `<task_completion>` / `<workflow>` 让模型自己核对。这些都是对模型行为的软性约束，不是代码里的解析器或校验函数。

1. **唯一的二次校验模式出现在代码审查，而不是计划。**

Claude Code `/code-review` 的「生成 → 独立验证 → 过滤」是三家最接近「二次校验」的机制：4 个并行 agent 出问题列表，每个问题再由独立子代理确认是否真实存在，未通过的被过滤。但它服务于 PR 代码审查，不是通用计划漏项/重复/可执行性检测。

1. **运行时能拦住「重复动作」，拦不住「重复或漏掉的计划步骤」。**

Crush 的 `hasRepeatedToolCalls` 作为 `StopCondition` 防止同一工具调用重复超过阈值，作用于已执行的 `fantasy.StepResult`，是防死循环的安全阀，不是对预生成计划文本的静态分析。

### 各项目情况

**Claude Code** —— `code-architect` 生成蓝图而非校验计划；`/code-review` 的独立验证子代理针对代码问题；`CHANGELOG.md` 中子代理 `tools` 无法解析时 `Task` 工具返回明确错误，属于工具配置校验，与计划步骤语义无关。

**Codex** —— `update_plan` 被定位为跟踪步骤和进度并渲染给用户的工具，提示词给了高质量与低质量计划示例；状态规则要求同一时间只有一个 `in_progress`、不能从 `pending` 直接跳到 `completed`、不能批量完成。这些是流程约束，靠模型遵守。app-server 的 `turn/plan/updated` 通知只携带 `{ step, status }` 透传给客户端展示，同样不做校验。

**Crush** —— 提示词要求模型在执行前后自检；Plan 模式通过 `common.PlanReadyMarkerPresent` 只判断计划是否生成完毕（`CRUSH_PLAN_READY` 标记），不解析内容，用户只能通过 `OnRequestChanges` 手动反馈；运行时的 `hasRepeatedToolCalls` 针对工具调用循环，与计划模式（`PlanHandoffInline`）没有直接调用关系。

## See Also

- [多 Agent 设计对比：Crush / Codex / Claude Code / Eino](multi-agent-design.md) — 各项目 agent 角色的预定义、触发与委派。
- [AI Agent 面试题清单（120 题）](interview-question-checklist.md) — 第 03 模块「任务拆分与规划」对应本页。
