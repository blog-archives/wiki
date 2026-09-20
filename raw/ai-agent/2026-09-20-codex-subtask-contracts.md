# DeepWiki Q&A with Code Context for Repository: openai/codex

> Source: DeepWiki Q&A with Code Context for Repository: openai/codex
> Collected: 2026-09-20
> Published: Unknown

## Q1

拆分子任务时，输入输出内容怎么约定，依赖和完成条件怎么判定

## 答案

## 摘要

在 Codex 的多代理（multi-agent）系统中，拆分子任务时的输入/输出约定由 `InterAgentCommunication` 消息体承载，依赖关系通过 `AgentPath`（父子路径）和 `parent_turn_id` 追踪，完成条件由 `AgentStatus`（如 `Completed`/`Errored`）判定，并在终止时通过事件转发给父代理。

---

## 输入输出内容约定

子代理之间传递的消息统一封装在 `InterAgentCommunication` 结构中，包含发送方/接收方 `AgentPath`、消息内容，以及是否触发新一轮（`trigger_turn`）： codex:1644-1656

实际消息格式遵循固定文本约定，例如 `Message Type: MESSAGE` 或 `Message Type: FINAL_ANSWER`，附带 `Task name`、`Sender`、`Payload` 字段： codex:1657-1668

在提示词层面（模型行为约定），编排代理通过 `spawn_agent` 创建子代理，`followup_task` 下发新任务并触发一轮执行，`send_message` 在不触发新轮次的情况下传递信息： codex:1-15

`models-manager/models.json` 中的角色说明进一步明确了这些工具的语义边界（`spawn_agent`/`followup_task`/`send_message`）： codex:95-98

## 依赖判定

子代理与父代理的依赖关系通过 `AgentPath` 的层级结构（如 `parent/child`）和 `turn_context.turn_metadata_state.parent_turn_id()` 记录。当子代理完成时，代码会解析父路径并判断是否需要通知更上层的发起者（`initiating_agent_path`）： codex:2187-2226

## 完成条件判定

完成条件由 `EventMsg::TurnComplete` / `EventMsg::TurnAborted` 事件驱动，并转换为 `AgentStatus`（`Completed`、`Errored` 等）；只有终态（`is_final`）才会触发向父级转发： codex:2138-2176

判定结果确定后，系统构造标准的完成信封消息并通过 `send_inter_agent_communication` 发送给父线程，同时如果启用了 rollout 追踪还会记录该消息： codex:2249-2286

## 底层协议术语

这些机制建立在 Codex 的核心协议之上：`Task` 由一系列 `Turn` 组成，一个 `Turn` 无输出则终止 `Task`；`Op`/`EventMsg` 是 SQ/EQ（提交队列/事件队列）上的载荷： codex:23-41

## Notes

- 上述机制主要来自 `MultiAgentV2` 相关代码路径（`multi_agents_v2` 工具），旧版 `multi_agents.rs`（v1）逻辑类似但接口略有不同，本回答未展开对比。
- `codex-rs/core/templates/agents/orchestrator.md` 中的规则（如"多个子代理并行处理多步计划"）属于提示词工程层面的行为指导，不是代码强制约束： codex:37-42 。
- `prompting-guide.md` / `upgrading-to-gpt-5p6-sol.md` 等文档是模型提示词工程参考资料，描述的是 OpenAI API 层面的通用 multi-agent beta 功能约定，与 Codex 仓库自身的多代理实现是相邻但不完全等同的系统，引用时需注意区分。
- 若需要更完整的任务拆分/依赖调度实现细节（例如 `wait_agent` 超时、`close_agent` 生命周期管理），建议启动一次 Devin session 以获取 `codex-rs/core/src/tools/handlers/multi_agents_v2/` 目录下各文件的完整实现。

Wiki pages you might want to explore:
- [Codex Interface and Session Lifecycle (openai/codex)](/wiki/openai/codex#3.1)

### Citations

**File:** codex-rs/core/tests/suite/compact_remote.rs (L1644-1656)
```rust
    codex
        .submit(Op::InterAgentCommunication {
            communication: InterAgentCommunication::new(
                AgentPath::root().join("child").expect("valid child path"),
                AgentPath::root(),
                Vec::new(),
                "Message Type: MESSAGE\nTask name: /root\nSender: /root/child\nPayload:\nchild progress"
                    .to_string(),
                /*trigger_turn*/ false,
            ),
            start_options: Default::default(),
        })
        .await?;
```

**File:** codex-rs/core/tests/suite/compact_remote.rs (L1657-1668)
```rust
    codex
        .submit(Op::InterAgentCommunication {
            communication: InterAgentCommunication::new(
                AgentPath::root().join("child").expect("valid child path"),
                AgentPath::root(),
                Vec::new(),
                "Message Type: FINAL_ANSWER\nTask name: /root\nSender: /root/child\nPayload:\nchild completion".to_string(),
                /*trigger_turn*/ false,
            ),
            start_options: Default::default(),
        })
        .await?;
```

**File:** codex-rs/core/templates/collab/experimental_prompt.md (L1-15)
```markdown
## Multi agents
You have the possibility to spawn and use other agents to complete a task. For example, this can be use for:
* Very large tasks with multiple well-defined scopes
* When you want a review from another agent. This can review your own work or the work of another agent.
* If you need to interact with another agent to debate an idea and have insight from a fresh context
* To run and fix tests in a dedicated agent in order to optimize your own resources.

This feature must be used wisely. For simple or straightforward tasks, you don't need to spawn a new agent.

**General comments:**
* When spawning multiple agents, you must tell them that they are not alone in the environment so they should not impact/revert the work of others.
* Running tests or some config commands can output a large amount of logs. In order to optimize your own context, you can spawn an agent and ask it to do it for you. In such cases, you must tell this agent that it can't spawn another agent himself (to prevent infinite recursion)
* When you're done with a sub-agent, don't forget to close it using `close_agent`.
* Be careful on the `timeout_ms` parameter you choose for `wait_agent`. It should be wisely scaled.
* Sub-agents have access to the same set of tools as you do so you must tell them if they are allowed to spawn sub-agents themselves or not.
```

**File:** codex-rs/models-manager/models.json (L95-98)
```json
        "multi_agent": {
          "role": {
            "root": "You are `/root`, the primary agent in a team of agents collaborating to fulfill the user's goals.\n\nAt the start of your turn, you are the active agent.\nYou can spawn sub-agents to handle subtasks, and those sub-agents can spawn their own sub-agents.\nAll agents in the team, including the agents that you can assign tasks to, are equally intelligent and capable, and have access to the same set of tools.\n\nYou can use `spawn_agent` to create a new agent, `followup_task` to give an existing agent a new task and trigger a turn, and `send_message` to pass a message to a running agent without triggering a turn.\n`send_message` calls may be read by a human, so ensure they are legible. Always put proper spaces between words and/or numbers.\nChild agents can also spawn their ... (truncated)
            "subagent": "You are an agent in a team of agents collaborating to complete a task.\n\nYou can spawn sub-agents to handle subtasks, and those sub-agents can spawn their own sub-agents. All agents in the team, including the agents that you can assign tasks to, are equally intelligent and capable, and have access to the same set of tools.\n\nYou can use `spawn_agent` to create a new agent, `followup_task` to give an existing agent a new task and trigger a turn, and `send_message` to pass a message to a running agent.\n`send_message` calls may be read by a human, so ensure they are legible. Always put proper spaces between words and/or numbers.\nChild agents can also spawn their own sub-agents.\n\nWhen you provide a response in the final channel, that content is immediately delive ... (truncated)
```

**File:** codex-rs/core/src/session/mod.rs (L2138-2176)
```rust
    /// Forwards terminal turn events from spawned MultiAgentV2 children to their direct parent.
    async fn maybe_notify_parent_of_terminal_turn(
        &self,
        turn_context: &TurnContext,
        msg: &EventMsg,
    ) {
        if turn_context.multi_agent_version != MultiAgentVersion::V2 {
            return;
        }

        if !matches!(msg, EventMsg::TurnComplete(_) | EventMsg::TurnAborted(_)) {
            return;
        }

        let SessionSource::SubAgent(SubAgentSource::ThreadSpawn {
            parent_thread_id,
            agent_path: Some(child_agent_path),
            ..
        }) = &turn_context.session_source
        else {
            return;
        };

        let status = match turn_context.terminal_error.lock().await.take() {
            Some(error) => {
                let status = AgentStatus::Errored(error.message);
                self.agent_status.send_replace(status.clone());
                status
            }
            None => {
                let Some(status) = agent_status_from_event(msg) else {
                    return;
                };
                status
            }
        };
        if !is_final(&status) {
            return;
        }
```

**File:** codex-rs/core/src/session/mod.rs (L2187-2226)
```rust
    /// Sends the standard completion envelope from a spawned MultiAgentV2 child to its parent.
    async fn forward_child_completion_to_parent(
        &self,
        turn_context: &TurnContext,
        parent_thread_id: ThreadId,
        child_agent_path: &codex_protocol::AgentPath,
        status: AgentStatus,
    ) {
        let Some(parent_agent_path) = child_agent_path
            .as_str()
            .rsplit_once('/')
            .and_then(|(parent, _)| codex_protocol::AgentPath::try_from(parent).ok())
        else {
            return;
        };

        if matches!(status, AgentStatus::Completed(_))
            && let Some(parent_turn_id) = turn_context.turn_metadata_state.parent_turn_id()
        {
            let initiating_thread_id = match turn_context
                .turn_metadata_state
                .initiating_agent_path()
            {
                Some(initiating_agent_path) if initiating_agent_path != &parent_agent_path => self
                    .services
                    .agent_control
                    .resolve_agent_reference(
                        self.thread_id,
                        &turn_context.session_source,
                        initiating_agent_path.as_str(),
                    )
                    .await
                    .inspect_err(|err| {
                        debug!(
                            "failed to resolve completed activity initiator {initiating_agent_path}: {err}"
                        );
                    })
                    .ok(),
                _ => Some(parent_thread_id),
            };
```

**File:** codex-rs/core/src/session/mod.rs (L2249-2286)
```rust
        let Some(message) = format_inter_agent_completion_message(
            parent_agent_path.clone(),
            child_agent_path.clone(),
            &status,
        ) else {
            return;
        };
        // `communication` owns the message. Keep a second copy only when the
        // recorder will actually need it after parent delivery succeeds.
        let trace_message = self
            .services
            .rollout_thread_trace
            .is_enabled()
            .then(|| message.clone());
        let communication = InterAgentCommunication::new(
            child_agent_path.clone(),
            parent_agent_path,
            Vec::new(),
            message,
            /*trigger_turn*/ false,
        );
        let context =
            AgentCommunicationContext::new(AgentCommunicationKind::Result, self.thread_id);
        if let Err(err) = self
            .services
            .agent_control
            .send_inter_agent_communication(
                parent_thread_id,
                communication,
                context,
                TurnStartOptions::default(),
            )
            .await
        {
            debug!("failed to notify parent thread {parent_thread_id}: {err}");
            return;
        }
        if let Some(message) = trace_message {
```

**File:** codex-rs/docs/protocol_v1.md (L23-41)
```markdown
3. `Task`
   - A `Task` is `Codex` executing work in response to user input.
   - `Session` has at most one `Task` running at a time.
   - Receiving user turn input starts a `Task`
   - Consists of a series of `Turn`s
   - The `Task` executes to until:
     - The `Model` completes the task and there is no output to feed into an additional `Turn`
     - Additional user-turn input aborts the current task and starts a new one
     - UI interrupts with `Op::Interrupt`
     - Fatal errors are encountered, eg. `Model` connection exceeding retry limits
     - Blocked by user approval (executing a command or patch)
4. `Turn`
   - One cycle of iteration in a `Task`, consists of:
     - A request to the `Model` - (initially) prompt + (optional) `last_response_id`, or (in loop) previous turn output
     - The `Model` streams responses back in an SSE, which are collected until "completed" message and the SSE terminates
     - `Codex` then executes command(s), applies patch(es), and outputs message(s) returned by the `Model`
     - Pauses to request approval when necessary
   - The output of one `Turn` is the input to the next `Turn`
   - A `Turn` yielding no output terminates the `Task`
```

**File:** codex-rs/core/templates/agents/orchestrator.md (L37-42)
```markdown
## General guidelines
- Prefer multiple sub-agents to parallelize your work. Time is a constraint so parallelism resolve the task faster.
- If sub-agents are running, **wait for them before yielding**, unless the user asks an explicit question.
  - If the user asks a question, answer it first, then continue coordinating sub-agents.
- When you ask sub-agent to do the work for you, your only role becomes to coordinate them. Do not perform the actual work while they are working.
- When you have plan with multiple step, process them in parallel by spawning one agent per step when this is possible.
```

## Q2

可以提供具体的结构化内容吗

## 答案

## 具体结构化内容

以下是拆分子任务时实际使用的具体数据结构（Rust 类型定义），而非概念性描述。

---

### 1. 消息封装：`InterAgentCommunication`

所有跨代理通信统一走这个结构，字段包括发送方/接收方路径、附件、消息文本、是否触发新轮次： codex:58-85

其中 `communication_from_tool_message` 展示了具体如何构造消息内容：如果是 `DirectPlaintextMessage` 来源，则用 `InterAgentMessage::new(message_type, recipient, author, message).render()` 渲染成结构化文本；`message_type` 由 `trigger_turn` 决定为 `NewTask` 或 `Message`。

### 2. 实际渲染的文本格式

`InterAgentMessage::render()` 产出的文本约定了 `Message Type` / `Task name` / `Sender` / `Payload` 四个字段，测试用例中可以看到两种典型格式：

- 进度消息（`MESSAGE`）： codex:1644-1656

- 完成消息（`FINAL_ANSWER`）： codex:1657-1668

### 3. 状态枚举：`AgentStatus` / `CollabAgentStatus`

核心侧的 `AgentStatus`（Rust 内部）会被映射到 app-server 协议侧的 `CollabAgentStatus`（供外部客户端消费），二者一一对应： codex:1262-1316

映射关系显示：`PendingInit`、`Running`、`Interrupted`、`Completed(message)`、`Errored(message)`、`Shutdown`、`NotFound` 七种终态/非终态状态，其中 `Completed` 和 `Errored` 带有可选的 `message` 字段，即完成条件判定携带的具体内容。

### 4. 工具枚举：`CollabAgentTool`

拆分/协调子任务时可用的工具集合是一个固定枚举，对应 `spawn_agent`、`send_input`、`resume_agent`、`wait`、`close_agent`、`send_message`、`followup_task`、`interrupt_agent`、`list_agents`： codex:83-96

### 5. 依赖关系结构：`SubAgentSource::ThreadSpawn`

子代理与父代理的依赖关系记录在 `SubAgentSource` 里，字段包括 `parent_thread_id`（依赖的父线程）、`depth`（层级深度）、`agent_path`（层级路径，如 `/root/child`）、`agent_nickname`、`agent_role`： codex:961-1020

这与 core 侧代码中 `SessionSource::SubAgent(SubAgentSource::ThreadSpawn { parent_thread_id, agent_path, .. })` 的实际匹配逻辑一致，用于判断"完成时该通知谁"： codex:2138-2159

### 6. 完成信封的组装与投递

完成判定后，`forward_child_completion_to_parent` 构造 `InterAgentCommunication`（`Result` 类型的 `AgentCommunicationKind`），通过 `send_inter_agent_communication` 投递给父线程： codex:2249-2286

真实的端到端测试（`multi_agent_v2_completion_queues_message_for_direct_parent`）验证了这一流程，展示了完整的期望消息结构（`worker_path` 作为接收方，`tester_path` 作为发送方，携带渲染后的完成文本）： codex:3424-3442

---

## Notes

- `message_tool.rs` 中的 `SendMessageArgs` 是模型调用 `send_message` 工具时的输入 JSON schema 起点，字段包含 `target`（目标 `AgentPath`）等，完整字段因索引截断未能完全展示，如需精确字段列表建议启动 Devin session 查看 codex:27-31 全文。
- `CollabAgentStatus` 枚举定义在 app-server 协议层，是核心 `AgentStatus` 对外暴露的 JSON Schema 版本，二者语义一致但不是同一 Rust 类型。
- 上述结构均属于 `MultiAgentV2` 体系；v1 版本 (`multi_agents.rs`) 的字段命名可能不同，未在本次检索范围内详细展开。

Wiki pages you might want to explore:
- [Codex Interface and Session Lifecycle (openai/codex)](/wiki/openai/codex#3.1)

### Citations

**File:** codex-rs/core/src/tools/handlers/multi_agents_v2.rs (L58-85)
```rust
fn communication_from_tool_message(
    author: AgentPath,
    recipient: AgentPath,
    message: String,
    source: &crate::tools::context::ToolCallSource,
    trigger_turn: bool,
) -> InterAgentCommunication {
    if !matches!(
        source,
        crate::tools::context::ToolCallSource::DirectPlaintextMessage
    ) {
        return InterAgentCommunication::new_encrypted(
            author,
            recipient,
            Vec::new(),
            message,
            trigger_turn,
        );
    }
    let message_type = if trigger_turn {
        InterAgentMessageType::NewTask
    } else {
        InterAgentMessageType::Message
    };
    let content =
        InterAgentMessage::new(message_type, recipient.clone(), author.clone(), message).render();
    InterAgentCommunication::new(author, recipient, Vec::new(), content, trigger_turn)
}
```

**File:** codex-rs/app-server-protocol/src/protocol/v2/item.rs (L1262-1316)
```rust
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub enum CollabAgentStatus {
    PendingInit,
    Running,
    Interrupted,
    Completed,
    Errored,
    Shutdown,
    NotFound,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct CollabAgentState {
    pub status: CollabAgentStatus,
    pub message: Option<String>,
}

impl From<CoreAgentStatus> for CollabAgentState {
    fn from(value: CoreAgentStatus) -> Self {
        match value {
            CoreAgentStatus::PendingInit => Self {
                status: CollabAgentStatus::PendingInit,
                message: None,
            },
            CoreAgentStatus::Running => Self {
                status: CollabAgentStatus::Running,
                message: None,
            },
            CoreAgentStatus::Interrupted => Self {
                status: CollabAgentStatus::Interrupted,
                message: None,
            },
            CoreAgentStatus::Completed(message) => Self {
                status: CollabAgentStatus::Completed,
                message,
            },
            CoreAgentStatus::Errored(message) => Self {
                status: CollabAgentStatus::Errored,
                message: Some(message),
            },
            CoreAgentStatus::Shutdown => Self {
                status: CollabAgentStatus::Shutdown,
                message: None,
            },
            CoreAgentStatus::NotFound => Self {
                status: CollabAgentStatus::NotFound,
                message: None,
            },
        }
    }
}
```

**File:** codex-rs/app-server-protocol/schema/json/v2/ItemCompletedNotification.json (L83-96)
```json
    "CollabAgentTool": {
      "enum": [
        "spawnAgent",
        "sendInput",
        "resumeAgent",
        "wait",
        "closeAgent",
        "sendMessage",
        "followupTask",
        "interruptAgent",
        "listAgents"
      ],
      "type": "string"
    },
```

**File:** codex-rs/app-server-protocol/schema/json/v2/ThreadListResponse.json (L961-1020)
```json
    "SubAgentSource": {
      "oneOf": [
        {
          "enum": [
            "review",
            "compact",
            "memory_consolidation"
          ],
          "type": "string"
        },
        {
          "additionalProperties": false,
          "properties": {
            "thread_spawn": {
              "properties": {
                "agent_nickname": {
                  "default": null,
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "agent_path": {
                  "anyOf": [
                    {
                      "$ref": "#/definitions/AgentPath"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "default": null
                },
                "agent_role": {
                  "default": null,
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "depth": {
                  "format": "int32",
                  "type": "integer"
                },
                "parent_thread_id": {
                  "$ref": "#/definitions/ThreadId"
                }
              },
              "required": [
                "depth",
                "parent_thread_id"
              ],
              "type": "object"
            }
          },
          "required": [
            "thread_spawn"
          ],
          "title": "ThreadSpawnSubAgentSource",
          "type": "object"
        }
      ]
    },
```

**File:** codex-rs/core/src/session/mod.rs (L2138-2159)
```rust
    /// Forwards terminal turn events from spawned MultiAgentV2 children to their direct parent.
    async fn maybe_notify_parent_of_terminal_turn(
        &self,
        turn_context: &TurnContext,
        msg: &EventMsg,
    ) {
        if turn_context.multi_agent_version != MultiAgentVersion::V2 {
            return;
        }

        if !matches!(msg, EventMsg::TurnComplete(_) | EventMsg::TurnAborted(_)) {
            return;
        }

        let SessionSource::SubAgent(SubAgentSource::ThreadSpawn {
            parent_thread_id,
            agent_path: Some(child_agent_path),
            ..
        }) = &turn_context.session_source
        else {
            return;
        };
```

**File:** codex-rs/core/src/session/mod.rs (L2249-2286)
```rust
        let Some(message) = format_inter_agent_completion_message(
            parent_agent_path.clone(),
            child_agent_path.clone(),
            &status,
        ) else {
            return;
        };
        // `communication` owns the message. Keep a second copy only when the
        // recorder will actually need it after parent delivery succeeds.
        let trace_message = self
            .services
            .rollout_thread_trace
            .is_enabled()
            .then(|| message.clone());
        let communication = InterAgentCommunication::new(
            child_agent_path.clone(),
            parent_agent_path,
            Vec::new(),
            message,
            /*trigger_turn*/ false,
        );
        let context =
            AgentCommunicationContext::new(AgentCommunicationKind::Result, self.thread_id);
        if let Err(err) = self
            .services
            .agent_control
            .send_inter_agent_communication(
                parent_thread_id,
                communication,
                context,
                TurnStartOptions::default(),
            )
            .await
        {
            debug!("failed to notify parent thread {parent_thread_id}: {err}");
            return;
        }
        if let Some(message) = trace_message {
```

**File:** codex-rs/core/src/agent/control_tests.rs (L3424-3442)
```rust
    let expected_message = crate::session_prefix::format_inter_agent_completion_message(
        worker_path.clone(),
        tester_path.clone(),
        &AgentStatus::Completed(Some("done".to_string())),
    )
    .expect("completed status should render");
    let expected = (
        worker_thread_id,
        Op::InterAgentCommunication {
            communication: InterAgentCommunication::new(
                tester_path.clone(),
                worker_path.clone(),
                Vec::new(),
                expected_message.clone(),
                /*trigger_turn*/ false,
            ),
            start_options: Default::default(),
        },
    );
```

**File:** codex-rs/core/src/tools/handlers/multi_agents_v2/message_tool.rs (L27-31)
```rust
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
/// Input for the MultiAgentV2 `send_message` tool.
pub(crate) struct SendMessageArgs {
    pub(crate) target: String,
```

## Q3

转换成 json 是什么样子

## 答案

## 概括

app-server 协议层已经用 JSON Schema 定义了这些结构的 JSON 形态，序列化时采用 `camelCase`。以下是各结构对应的 JSON 表现形式。

---

## `CollabAgentState` / `CollabAgentStatus`

Rust 端 `CollabAgentState { status, message }` 序列化为 JSON 后，`status` 字段取值为 camelCase 版本的枚举，`message` 为可选字符串： codex:275-303

对应的 JSON 实例示例（如完成状态）：
```json
{
  "status": "completed",
  "message": "done"
}
```
或错误状态：
```json
{
  "status": "errored",
  "message": "some error text"
}
```
这与 Rust 侧 `CollabAgentStatus` 枚举（`PendingInit` → `pendingInit` 等）及 `From<CoreAgentStatus>` 的映射逻辑一致，`Completed`/`Errored` 携带 `message`，其余状态 `message` 为 `null`。

## `CollabAgentTool`

工具枚举转成 JSON 后是纯字符串枚举，值全部为 camelCase： codex:304-317

JSON 值示例：`"spawnAgent"`、`"sendMessage"`、`"followupTask"`、`"waitAgent"` 等，对应 Rust 里的 `spawn_agent`、`send_message`、`followup_task` 等工具名的驼峰化版本。

## `SubAgentSource`（依赖关系结构）

`SubAgentSource::ThreadSpawn` 序列化为一个带 `thread_spawn` 键的对象，包含 `depth`、`parent_thread_id`、可选的 `agent_path`、`agent_nickname`、`agent_role`： codex:961-1020

对应 JSON 实例示例：
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
除 `thread_spawn` 外，`SubAgentSource` 还可以是字符串枚举 `"review"` / `"compact"` / `"memory_consolidation"`，或 `{"other": "..."}` 变体，这些都是 `oneOf` 的其他分支。

## `SubAgentActivityKind`

与子代理活动状态相关的枚举，JSON 形式为字符串： codex:952-960

取值：`"started"`、`"interacted"`、`"interrupted"`、`"completed"`。

## `CollabAgentToolCallStatus`

工具调用状态枚举 JSON 形式： codex:318-326

取值：`"inProgress"`、`"completed"`、`"failed"`、`"interrupted"`。

---

## Notes

- 上述 JSON Schema 均来自 app-server 协议层（面向外部客户端，如 VS Code 扩展），是 core 内部 Rust 结构（`AgentStatus`、`SubAgentSource` 等）经 `#[serde(rename_all = "camelCase")]` 序列化后对外暴露的形态，二者字段语义一一对应但命名风格不同（snake_case → camelCase，`thread_spawn` 是个例外，是嵌套 tag 的字面值，未被 camelCase 化）。
- 之前讨论的核心内部消息文本格式（`Message Type: MESSAGE\nTask name: ...`）并不是 JSON，而是纯文本渲染格式，来自 `InterAgentMessage::render()`，与本节的 JSON Schema 是两套不同的序列化路径（内部 agent-to-agent 消息 vs 对外协议）。
- 若需要看到实际抓包/真实运行时产生的完整 JSON payload（而非 schema 定义），建议启动一次 Devin session 运行相关测试用例来获取具体运行输出。

Wiki pages you might want to explore:
- [App Server and IDE Integration (openai/codex)](/wiki/openai/codex#4.5)

### Citations

**File:** codex-rs/app-server-protocol/schema/json/v2/ThreadStartResponse.json (L275-303)
```json
    "CollabAgentState": {
      "properties": {
        "message": {
          "type": [
            "string",
            "null"
          ]
        },
        "status": {
          "$ref": "#/definitions/CollabAgentStatus"
        }
      },
      "required": [
        "status"
      ],
      "type": "object"
    },
    "CollabAgentStatus": {
      "enum": [
        "pendingInit",
        "running",
        "interrupted",
        "completed",
        "errored",
        "shutdown",
        "notFound"
      ],
      "type": "string"
    },
```

**File:** codex-rs/app-server-protocol/schema/json/v2/ThreadStartResponse.json (L304-317)
```json
    "CollabAgentTool": {
      "enum": [
        "spawnAgent",
        "sendInput",
        "resumeAgent",
        "wait",
        "closeAgent",
        "sendMessage",
        "followupTask",
        "interruptAgent",
        "listAgents"
      ],
      "type": "string"
    },
```

**File:** codex-rs/app-server-protocol/schema/json/v2/ThreadStartResponse.json (L318-326)
```json
    "CollabAgentToolCallStatus": {
      "enum": [
        "inProgress",
        "completed",
        "failed",
        "interrupted"
      ],
      "type": "string"
    },
```

**File:** codex-rs/app-server-protocol/schema/json/v2/ThreadListResponse.json (L952-960)
```json
    "SubAgentActivityKind": {
      "enum": [
        "started",
        "interacted",
        "interrupted",
        "completed"
      ],
      "type": "string"
    },
```

**File:** codex-rs/app-server-protocol/schema/json/v2/ThreadListResponse.json (L961-1020)
```json
    "SubAgentSource": {
      "oneOf": [
        {
          "enum": [
            "review",
            "compact",
            "memory_consolidation"
          ],
          "type": "string"
        },
        {
          "additionalProperties": false,
          "properties": {
            "thread_spawn": {
              "properties": {
                "agent_nickname": {
                  "default": null,
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "agent_path": {
                  "anyOf": [
                    {
                      "$ref": "#/definitions/AgentPath"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "default": null
                },
                "agent_role": {
                  "default": null,
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "depth": {
                  "format": "int32",
                  "type": "integer"
                },
                "parent_thread_id": {
                  "$ref": "#/definitions/ThreadId"
                }
              },
              "required": [
                "depth",
                "parent_thread_id"
              ],
              "type": "object"
            }
          },
          "required": [
            "thread_spawn"
          ],
          "title": "ThreadSpawnSubAgentSource",
          "type": "object"
        }
      ]
    },
```
