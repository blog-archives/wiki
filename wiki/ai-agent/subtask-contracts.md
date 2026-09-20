# 子任务的输入输出与完成条件约定

> Sources: DeepWiki Q&A（charmbracelet/crush）, Unknown; DeepWiki Q&A（anthropics/claude-code）, Unknown; DeepWiki Q&A（openai/codex）, Unknown
> Raw: [Crush 子任务契约](../../raw/ai-agent/2026-09-20-crush-subtask-contracts.md); [Claude Code 子任务契约](../../raw/ai-agent/2026-09-20-claude-code-subtask-contracts.md); [Codex 子任务契约](../../raw/ai-agent/2026-09-20-codex-subtask-contracts.md)
> Updated: 2026-09-20

## 一句话结论

**Crush 和 Claude Code 没有严格约定，输入输出、依赖、完成条件都靠大模型自己判断；Codex 有明确的结构化约定（JSON 协议）。** 但结构只解决「协调」，不解决「语义正确」——这是本文的核心判断。


| 维度     | Crush      | Claude Code    | Codex                                   |
| ------ | ---------- | -------------- | --------------------------------------- |
| 输入输出约定 | 自由文本，仅非空校验 | 自然语言 / 松散 YAML | `InterAgentCommunication` + JSON Schema |
| 依赖判定   | 隐式调用顺序     | 文本顺序隐式依赖       | `AgentPath` 层级 + `parent_turn_id`       |
| 完成条件   | 文本非空即完成    | LLM 验证 + 置信度阈值 | `AgentStatus` 终态事件                      |




## 关键思考（重点）

1. **约束强度取决于「子任务是不是独立会话」，而不是任务本身。**

Crush 的子 Agent 是一次同步阻塞的进程内调用，父 Agent 拿到文本就继续，天然不需要契约；Claude Code 的子代理是 prompt 模板里的编排步骤，靠文本顺序串起来。

Codex 的子代理是独立的 thread / session，要跨轮次路由、恢复、通知，才必须有 `AgentPath`、`AgentStatus`、`parent_turn_id` 这些机器可读的结构。可见结构是为了协调，不是为了任务质量。

1. **Codex 的「结构化」是分层的，模型侧仍然读文本。**

内部 agent-to-agent 消息最终渲染成 `Message Type` / `Task name` / `Sender` / `Payload` 的纯文本，JSON Schema 只在对外 app-server 协议层。类型系统约束的是引擎与客户端，而不是 LLM 的语义理解——子任务内容对不对，依然没有代码校验。

1. **三家都没解决「语义完成」，只解决了「流程完成」。**

Codex 的 `Completed` 来自 `TurnComplete` 事件，本质是这一轮跑完了；Claude Code 用第二个 LLM 打分（≥80）来近似质量；Crush 只判断输出非空。完成条件从非空进化到状态枚举、再到 LLM 复核，但都不是任务是否真正达成的证明。

1. **要自建多 Agent，按协调需求选最小契约。**

同步 fire-and-forget 的委派，文本 prompt 加非空校验就够；一旦需要异步、可恢复、多级转交，至少要有四样——身份/路径、状态枚举、依赖边、消息信封，正是 Codex 那套。超出这个范围再上 DAG 或 schema，通常是过度设计。

1. **依赖目前都是「通知」而非「调度」。**

Codex 能沿 `AgentPath` 把完成信封发给父级，但没有看到基于依赖边阻塞启动的调度器；Crush 是同步阻塞，Claude Code 是文本顺序。真正的依赖图调度（谁依赖谁、满足才启动）在这三个方案里都还没有。

## 方案细节



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
["pendingInit", "running", "interrupted", "completed", "errored", "shutdown", "notFound"]
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
["spawnAgent", "sendInput", "resumeAgent", "wait", "closeAgent", "sendMessage", "followupTask", "interruptAgent", "listAgents"]
```

```json
["started", "interacted", "interrupted", "completed"]
```



### Crush / Claude Code：无严格约定（一笔带过）

- **Crush**：子 Agent 输入只有自由文本 `Prompt`（仅校验非空），输出纯文本（仅校验非空）；`todos` 的 `session.Todo` 没有输入输出字段。依赖是隐式调用顺序，返回非空文本即算完成。
- **Claude Code**：`code-review` 用自然语言规定输出为 issue 列表；完成与否由第二个验证子 agent 判断，置信度 0-100、≥80 才采纳。`multi-agent-swarm` 的 `dependencies` 字段只被写入、未见强制执行。



## See Also

- [子任务拆分的依据](subtask-decomposition-criteria.md) — 什么时候拆、按什么维度拆。
- [多 Agent 设计对比：Crush / Codex / Claude Code / Eino](multi-agent-design.md) — 各项目 agent 角色的预定义、触发与委派。

