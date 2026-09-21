# DeepWiki Q&A: 用户在任务中途改变目标 / 追发消息的处理（Codex）

> Source: DeepWiki Q&A with Code Context（openai/codex）
> Collected: 2026-09-20
> Published: Unknown

## Q1 对于用户在任务进行中途改变目标，处理方式是什么

### Answer

当用户在任务进行中途改变目标（objective）时，Codex 的 Goal Extension 系统会通过 `update_goal` / `create_goal` 工具或 TUI 的 `/goal` 命令来处理，具体分为"更新现有目标"和"替换目标"两种路径。

---

### 1. 模型侧：通过工具修改目标

模型可调用 `update_goal` 工具修改当前目标状态（如 `complete`、`blocked`），但**不能**用它修改 objective 本身；工具描述明确说明这只用于标记完成或阻塞状态 codex:72-83 。若要设定新的 objective，模型需调用 `create_goal`，但该工具在"存在未完成目标"时会失败，提示应改用 `update_goal` 处理状态 codex:43-58 。

底层这些请求最终会流向 `GoalService::set`（在 `api.rs` 中体现），逻辑为：

- 如果提供了新 `objective`：
  - 若已存在目标，调用 `update_thread_goal` 更新 objective/status/budget，并保留 `expected_goal_id` 做乐观并发校验 codex:202-224 ；
  - 若不存在目标，调用 `replace_thread_goal` 直接插入新记录 codex:225-239 。
- 如果没有提供新 objective，只更新 status/budget codex:240-276 。

数据库层的 `update_thread_goal` 会根据不同组合（status+budget、仅status、仅budget、都无）执行相应 SQL，并用 `COALESCE` 保留未修改的字段 codex:271-299 ；若目标已达到预算上限，状态会被自动置为 `BudgetLimited` codex:292-296 。

修改完成后，系统会清除 pending 的 turn-start 选项，避免用旧目标状态启动续跑 codex:278-280 。

### 2. 用户侧：TUI `/goal` 命令与编辑器

用户可以在会话中途输入 `/goal <新目标>` 来改变目标。TUI 的 `slash_dispatch.rs` 会把这条命令封装为 `GoalDraft`，并派发 `AppEvent::SetThreadGoalDraft`，其模式默认为 `ThreadGoalSetMode::ConfirmIfExists` codex:947-953 。

该事件在 `thread_goal_actions.rs` 的 `set_thread_goal_draft` 中处理：

1. 若模式为 `ConfirmIfExists`，先查询当前目标；如果存在且 `should_confirm_before_replacing_goal` 判断需要确认（即当前目标状态不是 `Complete`），则弹出"替换目标？"确认框，而非直接覆盖 codex:140-163 codex:368-379 。
2. 用户确认后模式变为 `ReplaceExisting`：系统先调用 `thread_goal_clear` 清除旧目标，然后再调用 `thread_goal_set` 写入新 objective，状态重置为 `Active` codex:181-208 。
3. 若模式为 `UpdateExisting`（例如只改状态/预算，不改 objective），则直接沿用现有状态与新预算调用 `thread_goal_set` codex:196-208 。

设置成功后，会向用户展示新的目标状态与用量摘要，并触发 `maybe_send_next_queued_input` 继续处理队列中排队的用户输入 codex:210-220 。

此外，用户也可以直接使用"编辑目标"入口 `open_thread_goal_editor`，读取当前目标并弹出编辑弹窗供修改 codex:88-129 ，或调用 `clear_thread_goal` 完全清空目标 codex:262-288 。

### 3. 与常规"任务"（Turn）中途改变意图的区别

"Goal"（目标）与普通对话中的"Turn 内容变更"是不同的机制。如果用户只是想在**当前 turn 执行过程中**追加新的指令而非改变持久化目标，App Server 提供了 `turn/steer` 方法，可以把额外的用户输入附加到当前活动 turn，而不产生新的 `turn/started` 事件，且要求提供匹配的 `expectedTurnId` codex:1477-1494 。这与 Goal 系统中长期目标（objective）的持久化变更是两条独立路径。

## Notes

- 目标（Goal）与预算（token_budget）绑定，改变目标时若已超预算会被系统自动置为 `BudgetLimited` 而非保持 `Active` codex:292-296 。
- `create_goal` 工具明确要求：只有在用户或系统显式要求时才创建目标，不应从普通任务中推断目标 codex:46-47 。
- `gpt_5_1_prompt.md` / `gpt_5_2_prompt.md` 中提到的 `update_plan` 工具是 Agent 自身规划(Plan)机制，用于中途调整执行步骤，与本文讨论的持久化"目标(Goal)"系统是不同概念，仅表面相似（都涉及"改变计划/目标"），未在本回答中作为主体依据。

### Citations

**File:** codex-rs/ext/goal/src/spec.rs (L43-58)
```rust
    ToolSpec::Function(ResponsesApiTool {
        name: CREATE_GOAL_TOOL_NAME.to_string(),
        description: format!(
            r#"Create a goal only when explicitly requested by the user or system/developer instructions; do not infer goals from ordinary tasks.
Set token_budget only when an explicit token budget is requested. Fails if an unfinished goal exists; use {UPDATE_GOAL_TOOL_NAME} only for status."#
        ),
        strict: false,
        defer_loading: None,
        parameters: JsonSchema::object(
            properties,
            /*required*/ Some(vec!["objective".to_string()]),
            Some(false.into()),
        ),
        output_schema: None,
    })
}
```

**File:** codex-rs/ext/goal/src/spec.rs (L72-83)
```rust
    ToolSpec::Function(ResponsesApiTool {
        name: UPDATE_GOAL_TOOL_NAME.to_string(),
        description: r#"Update the existing goal.
Use this tool only to mark the goal achieved or genuinely blocked.
Set status to `complete` only when the objective has actually been achieved and no required work remains.
Set status to `blocked` only when the same blocking condition has repeated for at least three consecutive goal turns, counting the original/user-triggered turn and any automatic continuations, and the agent cannot make meaningful progress without user input or an external-state change.
If the user resumes a goal that was previously marked `blocked`, treat the resumed run as a fresh blocked audit. If the same blocking condition then repeats for at least three consecutive resumed goal turns, set status to `blocked` again.
Once the blocked threshold is satisfied, do not keep reporting that you are still blocked while leaving the goal active; set status to `blocked`.
Do not use `blocked` merely because the work is hard, slow, uncertain, incomplete, or would benefit from clarification.
Do not mark a goal complete merely because its budget is nearly exhausted or because you are stopping work.
You cannot use this tool to pause, resume, budget-limit, or usage-limit a goal; those status changes are controlled by the user or system.
When marking a budgeted goal achieved with status `complete`, report the final token usage from the tool result to the user."#
    })
}
```

**File:** codex-rs/ext/goal/src/api.rs (L202-224)
```rust
            if let Some(existing_goal) = existing_goal.as_ref() {
                let previous_goal = PreviousGoalSnapshot::from(existing_goal);
                state_db
                    .thread_goals()
                    .update_thread_goal(
                        thread_id,
                        codex_state::GoalUpdate {
                            objective: Some(objective.to_string()),
                            status,
                            token_budget,
                            expected_goal_id: Some(existing_goal.goal_id.clone()),
                        },
                    )
```

**File:** codex-rs/ext/goal/src/api.rs (L225-239)
```rust
            } else {
                state_db
                    .thread_goals()
                    .replace_thread_goal(
                        thread_id,
                        objective,
                        status.unwrap_or(codex_state::ThreadGoalStatus::Active),
                        token_budget.flatten().or(max_goal_token_budget),
                    )
```

**File:** codex-rs/state/src/runtime/goals.rs (L271-299)
```rust
    pub async fn update_thread_goal(
        &self,
        thread_id: ThreadId,
        update: GoalUpdate,
    ) -> anyhow::Result<Option<crate::ThreadGoal>> {
        let GoalUpdate {
            objective,
            status,
            token_budget,
            expected_goal_id,
        } = update;
        let objective = objective.as_deref();
        let expected_goal_id = expected_goal_id.as_deref();
        let now_ms = datetime_to_epoch_millis(Utc::now());
        let result = match (status, token_budget) {
            (Some(status), Some(token_budget)) => {
                sqlx::query(
                    r#"
UPDATE thread_goals
SET
    objective = COALESCE(?, objective),
    status = CASE
        WHEN status = ? AND ? IN (?, ?) THEN status
        WHEN ? = 'active' AND ? IS NOT NULL AND tokens_used >= ? THEN ?
        ELSE ?
    END,
    token_budget = ?,
    updated_at_ms = ?
WHERE thread_id = ?
```
```

**File:** codex-rs/tui/src/chatwidget/slash_dispatch.rs (L947-953)
```rust
                let history_objective = draft.objective.clone();
                self.app_event_tx.send(AppEvent::SetThreadGoalDraft {
                    thread_id,
                    draft,
                    mode: ThreadGoalSetMode::ConfirmIfExists,
                });
                self.append_message_history_entry(format!("/goal {history_objective}"));
```

**File:** codex-rs/tui/src/app/thread_goal_actions.rs (L181-208)
```rust
        let replacing_goal = matches!(mode, ThreadGoalSetMode::ReplaceExisting);
        if replacing_goal {
            let result = app_server.thread_goal_clear(thread_id).await;
            ...
        }

        let (status, token_budget) = match mode {
            ThreadGoalSetMode::ConfirmIfExists | ThreadGoalSetMode::ReplaceExisting => {
                (ThreadGoalStatus::Active, None)
            }
            ThreadGoalSetMode::UpdateExisting {
                status,
                token_budget,
            } => (status, Some(token_budget)),
        };

        let result = app_server
            .thread_goal_set(thread_id, Some(objective), Some(status), token_budget)
            .await;
```

**File:** codex-rs/tui/src/app/thread_goal_actions.rs (L368-379)
```rust
fn should_confirm_before_replacing_goal(goal: &ThreadGoal) -> bool {
    // Completed goals are terminal, so `/goal <objective>` can start a fresh goal
    // without asking the user to confirm replacing already-finished work.
    match goal.status {
        ThreadGoalStatus::Complete => false,
        ThreadGoalStatus::Active
        | ThreadGoalStatus::Paused
        | ThreadGoalStatus::Blocked
        | ThreadGoalStatus::UsageLimited
        | ThreadGoalStatus::BudgetLimited => true,
    }
}
```

**File:** codex-rs/app-server/README.md (L1477-1494)
```markdown
### Example: Steer an active turn

Use `turn/steer` to append additional user input to the currently active regular turn. This does
not emit `turn/started` and does not accept thread settings overrides.

```json
{ "method": "turn/steer", "id": 32, "params": {
    "threadId": "thr_123",
    "clientUserMessageId": "client_msg_124",
    "input": [ { "type": "text", "text": "Actually focus on failing tests first." } ],
    "expectedTurnId": "turn_456"
} }
{ "id": 32, "result": { "turnId": "turn_456" } }
```

`expectedTurnId` is required. If there is no active turn, `expectedTurnId` does not match the
active turn, or the active turn kind does not accept same-turn steering (for example review or
manual compaction), the request fails with an `invalid request` error.
```

## Q2 Goal Extension 系统是什么

### Answer

Goal Extension 系统是 `codex-rs/ext/goal` crate 实现的一个扩展模块，用于在线程（thread）级别持久化跟踪高层目标（objective）、token/时间预算，以及在多轮对话中自动"引导"（steering）模型继续朝目标努力。它通过 `GoalExtension` 结构体挂接到线程与轮次（turn）生命周期中 codex:95-98 。

---

### 核心组成

#### 1. `GoalExtension`：生命周期挂钩

`GoalExtension<C>` 实现了多个 Contributor trait，把目标逻辑注入到线程/轮次/工具调用的各个环节：

- `ThreadLifecycleContributor`：在 `on_thread_start` 时为线程初始化 `GoalAccountingState` 和 `GoalRuntimeHandle`；在 `on_thread_resume` 恢复目标状态；在 `on_thread_idle` 时检查是否要继续推进目标；在 `on_thread_stop` 注销 runtime codex:95-197 。
- `TurnLifecycleContributor`：在 `on_turn_start` 记录轮次开始的 token 用量基线，并检查该轮是否对应一个 `Active`/`BudgetLimited` 目标 codex:219-271 。
- `ToolLifecycleContributor`：在 `on_tool_finish` 统计工具调用是否消耗了目标进度的 token 用量，并在达到预算上限时注入"预算受限"提示 codex:421-490 。
- `ToolContributor`：向模型暴露 `get_goal` / `create_goal` / `update_goal` 三个工具 codex:493-541 。

#### 2. 三个模型工具（Tool）

| 工具 | 作用 |
|---|---|
| `get_goal` | 查询当前线程的目标状态、预算、用量 codex:13-23 |
| `create_goal` | 创建新目标（仅在用户/系统显式要求时使用），若已有未完成目标会失败 codex:25-58 |
| `update_goal` | 仅用于将目标标记为 `complete` 或 `blocked` codex:60-93 |

#### 3. `GoalService` 与 `GoalRuntimeHandle`

`GoalService`（`api.rs`）是全局服务，负责跨线程注册/查找 `GoalRuntimeHandle`，并提供 `set_thread_goal` 等 API 供外部（如 TUI）调用来创建/更新/替换目标 codex:87-149 。

`GoalRuntimeHandle`（`runtime.rs`）维护目标运行时状态：处理外部目标变更（`apply_external_goal_set`）、决定何时给模型注入"目标已更新"或"继续"之类的引导性提示（steering item），以及处理使用限额/超预算/执行不可用等异常导致的目标终止逻辑 codex:181-245 codex:260-312 。

#### 4. 持久化层：`codex-state`

底层数据保存在独立的 `goals_1.sqlite` 数据库中，由 `codex-state` crate 的 `runtime/goals.rs` 提供的 `update_thread_goal` / `insert_thread_goal` / `get_thread_goal` 等函数管理，包含 SQL 层面的状态转换逻辑（例如当 `tokens_used >= token_budget` 时自动切换到 `BudgetLimited`） codex:271-299 。

### 与 TUI 的集成

用户在 TUI 中输入 `/goal <objective>` 会触发 `slash_dispatch.rs` 生成 `GoalDraft` 并派发事件 codex:947-953 ，最终由 `thread_goal_actions.rs` 调用 `app_server.thread_goal_set` / `thread_goal_clear` 等 RPC，走到上面提到的 `GoalService::set_thread_goal` 逻辑，形成完整链路：TUI 命令 → App Server RPC → `GoalService` → `codex-state` SQLite 持久化 → `GoalRuntimeHandle` 触发 steering。

## Notes

- Goal 是"持久化的、跨轮次的高层目标"机制，与普通对话中临时的 `turn/steer`（追加输入到当前活动轮次）是完全不同的两套系统。

### Citations

**File:** codex-rs/ext/goal/src/extension.rs (L95-197)
```rust
impl<C> ThreadLifecycleContributor<C> for GoalExtension<C>
where
    C: Send + Sync + 'static,
{
    fn on_thread_start<'a>(&'a self, input: ThreadStartInput<'a, C>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            let config = (self.goal_config)(input.config);
            ...
            let runtime = input.thread_store.get_or_init::<GoalRuntimeHandle>(|| {
                GoalRuntimeHandle::new(
                    thread_id,
                    Arc::clone(&self.state_dbs),
                    self.event_emitter.clone(),
                    self.metrics.clone(),
                    self.thread_manager.clone(),
                    accounting_state,
                    GoalRuntimeConfig {
                        analytics: self.analytics.clone(),
                        enabled,
                        tools_available_for_thread,
                        root_accounting_state,
                    },
                )
            });
            runtime.set_enabled(enabled);
            self.goal_service.register_runtime(&runtime);
        })
    }

    fn on_thread_idle<'a>(&'a self, input: ThreadIdleInput<'a>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            let Some(runtime) = goal_runtime_handle(input.thread_store) else {
                return;
            };

            if let Err(err) = runtime.continue_if_idle().await {
                tracing::warn!(
                    "failed to continue active goal for idle thread {}: {err}",
                    runtime.thread_id()
                );
            }
        })
    }
}
```

**File:** codex-rs/ext/goal/src/extension.rs (L219-271)
```rust
impl<C> TurnLifecycleContributor for GoalExtension<C>
where
    C: Send + Sync + 'static,
{
    fn on_turn_start<'a>(&'a self, input: TurnStartInput<'a>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            let Some(runtime) = goal_runtime_handle(input.thread_store) else {
                return;
            };
            if !runtime.is_enabled() {
                return;
            }

            if let Err(err) = self
                .state_dbs
                .thread_goals()
                .clear_thread_goal_continuation_deferral(runtime.thread_id())
                .await
            {
                tracing::warn!("failed to clear deferred goal continuation: {err}");
            }

            let accounting = runtime.accounting_state();
            accounting.start_turn(
                input.turn_id,
                input.collaboration_mode.mode,
                input.token_usage_at_turn_start,
            );
            if matches!(
                input.collaboration_mode.mode,
                codex_protocol::config_types::ModeKind::Plan
            ) {
                accounting.clear_current_turn_goal();
                return;
            }
            let Ok(goal) = self
                .state_dbs
                .thread_goals()
                .get_thread_goal(runtime.thread_id())
                .await
            else {
                return;
            };
            if let Some(goal) = goal
                && matches!(
                    goal.status,
                    codex_state::ThreadGoalStatus::Active
                        | codex_state::ThreadGoalStatus::BudgetLimited
                )
            {
                accounting.mark_turn_goal_active(input.turn_id, goal.goal_id);
            }
        })
    }
}
```

**File:** codex-rs/ext/goal/src/extension.rs (L493-541)
```rust
impl<C> ToolContributor for GoalExtension<C>
where
    C: Send + Sync + 'static,
{
    fn tools(
        &self,
        _session_store: &ExtensionData,
        thread_store: &ExtensionData,
    ) -> Vec<
        Arc<dyn for<'call> codex_extension_api::ToolExecutor<codex_extension_api::ToolCall<'call>>>,
    > {
        ...
        vec![
            Arc::new(GoalToolExecutor::get(...)),
            Arc::new(GoalToolExecutor::create(...)),
            Arc::new(GoalToolExecutor::update(...)),
        ]
    }
}
```

**File:** codex-rs/ext/goal/src/spec.rs (L13-23)
```rust
pub fn create_get_goal_tool() -> ToolSpec {
    ToolSpec::Function(ResponsesApiTool {
        name: GET_GOAL_TOOL_NAME.to_string(),
        description: "Get the current goal for this thread, including status, budgets, token and elapsed-time usage, and remaining token budget."
            .to_string(),
        strict: false,
        defer_loading: None,
        parameters: JsonSchema::object(BTreeMap::new(), Some(Vec::new()), Some(false.into())),
        output_schema: None,
    })
}
```

**File:** codex-rs/ext/goal/src/api.rs (L87-149)
```rust
#[derive(Debug, Default)]
pub struct GoalService {
    runtimes: Mutex<HashMap<String, Weak<GoalRuntimeHandle>>>,
}

impl GoalService {
    pub fn new() -> Self {
        Self::default()
    }
    ...
    pub async fn set_thread_goal(
        &self,
        state_db: &codex_state::StateRuntime,
        request: GoalSetRequest<'_>,
    ) -> Result<GoalSetOutcome, GoalServiceError> {
```

**File:** codex-rs/ext/goal/src/runtime.rs (L181-245)
```rust
    pub async fn apply_external_goal_set(
        &self,
        goal: codex_state::ThreadGoal,
        previous_goal: Option<PreviousGoalSnapshot>,
    ) -> Result<(), String> {
        ...
        match goal.status {
            codex_state::ThreadGoalStatus::Active => {
                ...
                if objective_changed {
                    let item = objective_updated_steering_item(&protocol_goal_from_state(goal));
                    self.inject_active_turn_steering(item).await;
                }
                self.continue_if_idle().await?;
            }
            ...
        }
        Ok(())
    }
```

**File:** codex-rs/ext/goal/src/runtime.rs (L260-312)
```rust
    pub async fn usage_limit_active_goal_for_turn(&self, turn_id: &str) -> Result<(), String> {
        self.stop_active_goal_for_turn(turn_id, ActiveGoalStopReason::UsageLimit)
            .await
    }

    /// Accounts the ending turn and stops its active goal after a terminal error.
    pub(crate) async fn stop_active_goal_for_turn(
        &self,
        turn_id: &str,
        reason: ActiveGoalStopReason,
    ) -> Result<(), String> {
        ...
        let (event_name, status, expected_goal_id) = match reason {
            ActiveGoalStopReason::TurnError => {
                ("turn-error", codex_state::ThreadGoalStatus::Blocked, None)
            }
            ActiveGoalStopReason::UsageLimit => (
                "usage-limit",
                codex_state::ThreadGoalStatus::UsageLimited,
                None,
            ),
            ActiveGoalStopReason::ExecutionUnavailable { expected_goal_id } => (
                "execution-unavailable",
                codex_state::ThreadGoalStatus::Blocked,
                Some(expected_goal_id),
            ),
        };
```

## Q3 这个结构体或者这个 goal 维护哪些值

### Answer

你问的应该是 `ThreadGoal` 结构体（目标 Goal 本身持久化/展示的数据），以及 Goal Extension 内部维护状态的 `GoalRuntimeInner` / `GoalAccountingState`。

---

### 1. `ThreadGoal`（协议层，暴露给前端/TUI/API） codex:4019-4033

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thread_id` | `ThreadId` | 所属线程 |
| `objective` | `String` | 目标描述文本 |
| `status` | `ThreadGoalStatus` | `Active` / `Paused` / `Blocked` / `UsageLimited` / `BudgetLimited` / `Complete` |
| `token_budget` | `Option<i64>` | token 预算（可选） |
| `tokens_used` | `i64` | 已用 token |
| `time_used_seconds` | `i64` | 已用时间(秒) |
| `created_at` | `i64` | 创建时间戳 |
| `updated_at` | `i64` | 更新时间戳 |

这是从底层 `codex_state::ThreadGoal`（SQLite 持久化行）转换而来的，转换函数 `protocol_goal_from_state` 逐字段映射（含 `goal_id` 被内部使用但不暴露到协议层，还有 `status` 的映射函数 `protocol_status_from_state`） codex:478-500 。

底层数据库行在 `thread_goals` 表中，除了协议字段外还额外维护了内部用的 `goal_id`（唯一标识每次目标的实例，用于并发校验），可从查询 SQL 中看到全部列 codex:45-66 。

### 2. Goal Extension 运行时内部状态（不对外暴露）

#### `GoalRuntimeInner`（`runtime.rs`） codex:45-57

维护：`thread_id`、状态库引用 `state_dbs`、`analytics`/`event_emitter`/`metrics` 客户端、`thread_manager`（弱引用）、`accounting_state`（本线程用量统计）、`root_accounting_state`（若为子代理，指向根线程的统计）、`enabled` 开关、`tools_available_for_thread`、以及 `goal_state_lock` 信号量（保证并发安全的互斥锁）。

#### `GoalAccountingState` / `GoalAccountingInner`（`accounting.rs`） codex:16-16

- `inner.current_turn_id`：当前活跃的 turn
- `inner.turns`：turn_id → `GoalTurnAccounting`（每个 turn 的 token 用量、`active_goal_id`、是否记账、执行失败/成功标记）
- `inner.wall_clock`：墙钟计时的目标关联（`GoalWallClockAccounting`：上次记账时间 + 当前活跃目标 id）
- `inner.budget_limit_reported_goal_id` / `execution_failure_goal_id` / `consecutive_execution_failure_turns`：用于跟踪预算超限提示是否已发送过、以及连续执行失败次数（用于 blocked 判定的"三次"阈值)
- `descendant_token_usage`：子代理（sub-agent）的 token 用量累加 codex:1-32

这些内部字段主要服务于：判断何时把目标标记为 `BudgetLimited`（`should_clear_active_goal`） codex:542-557 ，以及计算 turn 级别的 token/时间增量，供 `account_active_goal_progress` 写回数据库 codex:509-539 。

## Notes

- `ThreadGoal`（协议层）是对外可见、持久化的核心数据；`GoalRuntimeInner` / `GoalAccountingState` 是纯内存中的运行时辅助状态，重启后靠 `restore_after_resume` 从数据库重建，不直接持久化自身字段。

### Citations

**File:** codex-rs/protocol/src/protocol.rs (L4019-4033)
```rust
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "protocol/")]
pub struct ThreadGoal {
    pub thread_id: ThreadId,
    pub objective: String,
    pub status: ThreadGoalStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub token_budget: Option<i64>,
    pub tokens_used: i64,
    pub time_used_seconds: i64,
    pub created_at: i64,
    pub updated_at: i64,
}
```

**File:** codex-rs/ext/goal/src/tool.rs (L478-500)
```rust
pub(crate) fn protocol_goal_from_state(goal: codex_state::ThreadGoal) -> ThreadGoal {
    ThreadGoal {
        thread_id: goal.thread_id,
        objective: goal.objective,
        status: protocol_status_from_state(goal.status),
        token_budget: goal.token_budget,
        tokens_used: goal.tokens_used,
        time_used_seconds: goal.time_used_seconds,
        created_at: goal.created_at.timestamp(),
        updated_at: goal.updated_at.timestamp(),
    }
}

fn protocol_status_from_state(status: codex_state::ThreadGoalStatus) -> ThreadGoalStatus {
    match status {
        codex_state::ThreadGoalStatus::Active => ThreadGoalStatus::Active,
        codex_state::ThreadGoalStatus::Paused => ThreadGoalStatus::Paused,
        codex_state::ThreadGoalStatus::Blocked => ThreadGoalStatus::Blocked,
        codex_state::ThreadGoalStatus::UsageLimited => ThreadGoalStatus::UsageLimited,
        codex_state::ThreadGoalStatus::BudgetLimited => ThreadGoalStatus::BudgetLimited,
        codex_state::ThreadGoalStatus::Complete => ThreadGoalStatus::Complete,
    }
}
```

**File:** codex-rs/state/src/runtime/goals.rs (L45-66)
```rust
        let row = sqlx::query(
            r#"
SELECT
    thread_id,
    goal_id,
    objective,
    status,
    token_budget,
    tokens_used,
    time_used_seconds,
    created_at_ms,
    updated_at_ms
FROM thread_goals
WHERE thread_id = ?
            "#,
        )
```

**File:** codex-rs/ext/goal/src/runtime.rs (L45-57)
```rust
struct GoalRuntimeInner {
    thread_id: ThreadId,
    state_dbs: Arc<codex_state::StateRuntime>,
    analytics: GoalAnalytics,
    event_emitter: GoalEventEmitter,
    metrics: GoalMetrics,
    thread_manager: Weak<ThreadManager>,
    accounting_state: Arc<GoalAccountingState>,
    root_accounting_state: Option<Arc<GoalAccountingState>>,
    enabled: AtomicBool,
    tools_available_for_thread: bool,
    goal_state_lock: Semaphore,
}
```

**File:** codex-rs/ext/goal/src/accounting.rs (L1-32)
```rust
#[derive(Debug)]
pub(crate) struct GoalAccountingState {
    inner: Mutex<GoalAccountingInner>,
    progress_accounting_lock: Semaphore,
    descendant_token_usage: AtomicI64,
}

#[derive(Debug)]
struct GoalAccountingInner {
    current_turn_id: Option<String>,
    turns: HashMap<String, GoalTurnAccounting>,
    wall_clock: GoalWallClockAccounting,
    budget_limit_reported_goal_id: Option<String>,
    execution_failure_goal_id: Option<String>,
    consecutive_execution_failure_turns: u8,
    last_accounted_descendant_token_usage: i64,
}
```

**File:** codex-rs/ext/goal/src/accounting.rs (L542-557)
```rust
fn should_clear_active_goal(
    status: ThreadGoalStatus,
    budget_limited_goal_disposition: BudgetLimitedGoalDisposition,
) -> bool {
    match status {
        ThreadGoalStatus::Active => false,
        ThreadGoalStatus::BudgetLimited => matches!(
            budget_limited_goal_disposition,
            BudgetLimitedGoalDisposition::ClearActive
        ),
        ThreadGoalStatus::Paused
        | ThreadGoalStatus::Blocked
        | ThreadGoalStatus::UsageLimited
        | ThreadGoalStatus::Complete => true,
    }
}
```

## Q4 所以用户在任务中途发送消息，会尝试检查是否需要更新 goal 然后再继续执行吗

### Answer

不会。用户在任务中途发送消息本身**不会**触发系统去检查或更新 Goal；发送消息只是正常的对话输入（可能被加入队列 `thread/queue/add` 或通过 `turn/steer` 追加到当前轮次），Goal 的创建/更新仍然只能通过两条明确路径触发：模型主动调用 `create_goal`/`update_goal` 工具，或用户显式使用 `/goal` 命令 codex:132-163 。

---

### 1. 每个 Turn 开始时的检查，是"状态同步"而非"内容检测"

`GoalExtension` 的 `on_turn_start` 钩子在**每次新 turn 开始**时都会运行，但它做的是清除延迟标记、记录 token 用量基线，并从数据库读取当前 Goal 状态，如果处于 `Active`/`BudgetLimited` 就把这个 turn 标记为"目标活跃 turn" codex:219-271 。这个逻辑**与用户发的消息内容无关**——它只是把已存在的持久化 Goal 状态同步到当前 turn 的记账逻辑里，不会去"解析"用户消息判断是否要改目标。

### 2. 真正改变 Goal 的只有两条路径

- **模型工具调用**：`create_goal` / `update_goal`，由模型在回复过程中主动决定调用，同样受 `on_tool_finish` 钩子里的 `CREATE_GOAL_TOOL_NAME` / `UPDATE_GOAL_TOOL_NAME` 特判处理 codex:421-464 。
- **用户显式命令**：`/goal` slash 命令，走 `set_thread_goal_draft` 流程 codex:132-231 。

普通的一句用户输入（不含 `/goal`，模型也未调用 goal 工具）不会经过这两条路径，因此不会更新 Goal。

### 3. 中途发消息实际发生的事情：排队或 `turn/steer`

如果当前有 Goal 驱动的 turn 正在运行，用户发的新消息通常会被加入队列（`thread/queue/add`），等当前 turn 结束后再处理，测试用例中即演示了这种"intervening user message"场景，同时该 Goal 保持 `Blocked` 状态直到显式恢复 codex:3167-3196 。另有测试 `misalignment_policy_blocks_queued_turns_and_goal_resumption` 显示：当 Goal 处于 `Blocked` 时，即使触发 `AppEvent::SetThreadGoalStatus`/`SetThreadGoalDraft` 等事件，系统在"misalignment policy violation"情况下也会阻止排队的 turn 与 goal 自动恢复，必须走确认弹窗（`show_replace_thread_goal_confirmation`）等显式路径 codex:64-151 。

### 4. Turn 结束/中断时会主动暂停 Goal（而非"检查更新"）

反方向的联动：如果用户在 Goal 驱动的 turn 运行中选择"退出并中断"（`RunningTaskExitAction::Exit`），TUI 会先调用 `thread_goal_set` 把 Goal 状态设为 `Paused`，然后再中断 turn codex:634-664 。这是系统主动管理 Goal 生命周期的例子，但触发条件是"用户退出/中断"这个动作，而不是"发送了一条消息"。

## Notes

- Goal 的更新是**显式触发**的（工具调用或 `/goal` 命令），不是对每条用户消息做隐式的"是否需要改目标"检测。
- `on_turn_start` 检查更接近"恢复/同步已有状态到当前 turn"，不涉及决策是否要修改 Goal 内容。

## Q5 我的关注在于，程序还在执行任务，但是用户继续发送消息甚至改变任务目标。处理方式是什么

### Answer

程序执行中途，用户发送的普通消息会走 TUI 的排队/steer 机制：默认尝试通过 `turn/steer` 把内容追加到当前活动 turn；如果条件不允许（比如处于 Plan 模式流式渲染中），则先放入 `queued_user_messages` 队列，等当前 turn 结束后自动发送 codex:258-294 。而如果用户在此期间输入 `/goal <新目标>` 试图改变目标，这条命令本身也会被**同样当作普通文本排队**，只有在当前 turn 完成后才会被解析为 slash 命令并真正触发目标变更流程，绝不会打断正在进行的任务或立即生效。

---

### 1. 普通消息中途发送：steer 或排队

`submit_user_message_with_mode` 是消息提交入口，先检查 `blocks_direct_input`（父子代理场景下拒绝直接输入），再判断是否需要排队 codex:258-294 ：

- 若 `is_plan_streaming_in_tui()` 为真（Plan 模式正在流式输出），调用 `queue_user_message` 放入 `InputQueueState.queued_user_messages` codex:21-48 。
- 否则调用 `submit_user_message`，这通常会尝试把消息作为 `turn/steer` 追加到当前活动 turn（App Server 侧的 `turn/steer` 方法要求提供匹配的 `expectedTurnId`，且 review/手动压缩类 turn 会拒绝 steer） codex:1477-1494 。

如果 steer 被拒绝（比如 turn 已切换成不可 steer 的类型），TUI 会把这条消息移入 `rejected_steers_queue`，等待下次合适时机重试 codex:213-228 。`InputQueueState` 结构体本身就同时维护了三类"中途消息"状态：`queued_user_messages`、`pending_steers`、`rejected_steers_queue` codex:21-48 。

### 2. 用户中途输入 `/goal` 改变目标：同样先排队，不会立即生效

关键点：`/goal` 命令走的也是**同一套输入通道**。测试 `queued_goal_slash_command_preserves_large_paste` 演示了这一行为——先 `handle_turn_started` 让一个 turn 处于运行状态，再排队输入 `/goal <objective>`，此时该文本原样进入 `queued_user_messages`；只有当 `complete_turn_with_message` 结束当前 turn 后，才会解析出 `GoalDraft` 并派发目标设置事件 codex:136-154 。

`slash_dispatch.rs` 中的 `SlashCommand::Goal` 分支印证了这一点：若当前处于"排队"路径（`source != Live`），它会走 `queue_user_message_with_options(..., QueuedInputAction::ParseSlash, ...)`，也就是先原样入队，稍后再"解析为 slash 命令"；只有在 `Live`（即直接可处理）路径下才立即构造 `GoalDraft` 并发送 `AppEvent::SetThreadGoalDraft` codex:843-953 。

也就是说：**任务还在执行时输入 `/goal`，不会立刻替换目标，也不会打断当前 turn**；它先被静默存入队列，等当前 turn 走完，`maybe_send_next_queued_input` 触发后才真正解析执行，进入 `set_thread_goal_draft` 确认/替换流程 codex:132-231 。

### 3. App Server 侧：`thread/queue/add` 与并发写入的实测行为

在 App Server 层面同样有类似语义：测试用例展示了在原始 turn 仍未释放期间，通过 `thread/queue/add` 把"intervening user message"加入队列，随后等原 turn 释放、完成，再处理排队消息，全过程用 3 次 `turn/completed` 通知确认 codex:3167-3196 。这说明底层协议本身就是"先排队，turn 结束后串行处理"，而不是并发修改当前状态。

### 4. Goal 处于 `Blocked`/异常状态时，中途操作会被系统性拦截

如果当前 Goal 因某种策略被标记为 `Blocked`（例如 `MisalignmentPolicyViolation`），即使用户在中途触发排队的 turn、`SetThreadGoalStatus`、`SetThreadGoalDraft`（`ReplaceExisting`）等一系列事件，测试 `misalignment_policy_blocks_queued_turns_and_goal_resumption` 显示这些操作都会被精确率、弹窗确认等机制拦住，Goal 状态最终仍保持 `Blocked` codex:64-151 。

## Notes

- 核心结论：**中途发消息（包括 `/goal`）不会打断正在运行的任务，也不会立即改变 Goal**。系统统一采用"排队 + turn 结束后串行处理"或者"steer 追加到当前 turn"两种机制。

## Q6 不是输入 /goal 主动改变目标，而是上一条消息的任务是往东，执行了一半以后发一条新消息说往西。codex 的处理逻辑是什么

### Answer

Codex 既不是"把往东的任务全部执行完"，也不是"语义层面识别到你改变方向就自动中断"。真实机制是：新消息通过 `turn/steer` 被追加进当前 turn 的**待处理输入队列**，但只会在当前这一步（当前的模型请求/工具调用）执行完毕、进入 turn 循环下一轮迭代时才被"喂给"模型；模型看到这条新输入后，会自己决定要不要转向往西——Codex 本身不做任何"这和原目标不一致，需要中断"的语义判断。若你想要真正立刻打断当前执行，必须显式按中断键（Esc → `turn/interrupt`），那才是真正的强制中断。

---

### 1. 中途消息默认走 `turn/steer`，不是排队等 turn 完全结束

TUI 侧 `try_submit_active_thread_op_via_app_server` 处理 `AppCommand::UserTurn` 时，如果该线程有 `active_turn_id`，会调用 `app_server.turn_steer(...)` 把新输入直接发给正在运行的 turn，而不是等它彻底跑完 codex:661-690 。只有当 steer 被拒绝（比如 turn 类型不可 steer，如 review/compaction）时，才会退化为排队重试 codex:691-699 。

### 2. Core 侧：Session 决定"start / steer / reject"

App Server 请求最终落到 Core 的 `turn_input.rs`，其注释明确说明这是**唯一决定输入是开启新 turn、追加到活动 turn（steer），还是被拒绝**的地方 codex:1-9 。如果判定为 steer，输入会被追加到当前 turn 的 `pending_input`，并"唤醒"邮箱投递机制，但**不打断当前正在进行的模型推理/工具执行** codex:259-270 。

### 3. 新输入何时真正被"喂给"模型：turn 循环的下一次迭代边界

`core/src/session/turn.rs` 里驱动整个 turn 的主循环，每次迭代开始时才会调用 `sess.input_queue.get_pending_input(...)` 把 steer 进来的内容取出来，合并进下一步的请求上下文（`step_context`） codex:333-404 。也就是说：

- 如果你在模型正在流式生成回复，或正在执行一个工具调用的**过程中**发消息，这条"往西"消息不会立刻打断这个正在进行的模型调用/工具执行；
- 但也不需要等**整个原始任务彻底完成**——只需等到当前这一步（当前模型响应或当前工具调用）结束，进入循环下一轮时，"往西"的内容就会被合并进下一次发给模型的请求里，模型会看到它并自主决定如何调整。

### 4. Codex 不做语义层面的"目标冲突检测"

无论是 App Server 协议文档里对 `turn/steer` 的描述 codex:1477-1494 ，还是 Core 的处理逻辑，都只是把新文本**追加**进上下文，没有任何逻辑去解析"往东"和"往西"是否冲突、是否应该终止旧任务。是否响应新指令、是否放弃旧方向，完全取决于模型自己在下一轮推理时如何理解合并后的上下文——这是模型层面的决策，不是 Codex 系统层面的硬编码行为。

### 5. 如果确实需要"立刻中断"

若你想要的是**强制打断当前执行**，需要显式按中断键：TUI 的 Esc 处理逻辑会在有 `pending_steers` 时先设置 `submit_pending_steers_after_interrupt` 标记，再调用 `submit_op(AppCommand::interrupt())` 发起真正的 `turn/interrupt` 请求，之后被打断的 turn 结束后再把 pending 内容合并成一次全新的 turn 重新提交 codex:145-157 。这与"自然 steer 融合"是两条不同路径：前者是"礼貌插话，模型自己决定"，后者是"强制打断，重新开始"。

## Notes

- 简言之：Codex 采取的是**渐进式融合（steer）而非硬性中断或硬性排队**——新消息会在当前执行步骤的自然边界处被并入上下文，模型基于最新完整上下文自主决定后续行为，系统本身不做"方向冲突"检测。

## Q7 对于上一条消息或者任务还没处理结束，用户追发消息的时候，处理方式是什么，完全等待执行完了再处理，还是中途把消息追加进去

### Answer

不会完全等执行完；Codex 默认会尝试**中途把新消息追加进当前正在运行的 turn**（通过 `turn/steer` 机制），只有在这条 steer 请求被拒绝时才会退化为排队等待 turn 结束。

---

### 1. 中途追发消息的默认路径：`turn/steer`

TUI 检测到当前线程有活动 turn 时（`active_turn_id_for_thread`），会调用 `app_server.turn_steer(...)` 直接把新消息发给正在运行的 turn，而不等它跑完 codex:661-690 。只有当这个 steer 请求被服务端拒绝（比如当前 turn 类型不可 steer），才会调用 `enqueue_rejected_steer` 把消息放入重试队列 codex:691-699 。

### 2. Core 侧：决定 start / steer / reject

App Server 的请求最终落到 Core 的 `turn_input.rs`，其模块注释明确说明**这是唯一决定提交的输入是开启新 turn、追加到活动 turn（steer），还是被拒绝的地方** codex:1-9 。具体的 `steer_input` 函数会检查活动任务类型：如果是 `Regular` 任务，则允许把输入合并进 `pending_input` 并唤醒 mailbox 投递；如果是 `Review` 或 `Compact` 类型任务，则返回 `ActiveTurnNotSteerable` 错误，拒绝 steer codex:553-649 。

被接受的 steer 输入通过 `extend_pending_input_and_accept_mailbox_delivery_for_turn_state` 写入当前 turn 的 `pending_input` codex:259-270 。

### 3. 何时真正被喂给模型：turn 主循环的下一次迭代

驱动 turn 执行的主循环每次迭代开头都会调用 `sess.input_queue.get_pending_input(...)` 取出已经 steer 进来的内容，合并进下一步的请求上下文 codex:333-404 。也就是说：不会打断当前正在执行的单个模型调用/工具调用，但也不需要等**整个原始任务**完全结束——只需等到当前步骤结束、进入下一轮循环时，新消息就会被并入。

### 4. Steer 被拒绝时的排队回退

App Server 的 `turn_processor.rs` 里明确列出了 steer 被拒绝的各种原因（`NoActiveTurn`、`ExpectedTurnMismatch`、`ActiveTurnNotSteerable`（review/compact turn）、`EmptyInput` 等） codex:1058-1128 。TUI 测试也验证了这一行为：当当前 turn 是 compaction（压缩）类型时，`submit_user_message` 先尝试 steer，被拒绝后消息转入普通排队队列 `queued_user_messages`，等 turn 完成再作为新 `Op::UserTurn` 提交 codex:1167-1215 。

此外 TUI 还提供另一条主动干预路径：`inject_if_running` 可以把响应条目直接注入正在运行的 turn（若没有活动 turn 则返回错误，交给调用方处理） codex:15-36 ，这与用户手动输入消息走的是同一底层 `input_queue` 机制。

## Notes

- 结论与"往东/往西"场景一致：**追加（steer）而非等待或立即中断**是默认行为；只有 steer 被拒绝时才排队，等 turn 彻底结束后再作为新 turn 提交。

## Q8 turn/steer 机制是什么

### Answer

`turn/steer` 是 App Server 协议中的一个 JSON-RPC 方法，用于把额外的用户输入**追加到当前正在运行的活动 turn**，而不是开启一个新 turn，也不会打断当前执行 codex:1477-1494 。

---

### 1. 协议定义

请求需要携带 `threadId`、`input`（新增的用户输入内容）和必填的 `expectedTurnId`（用于校验目标 turn 是否仍是当前活动 turn），响应返回被追加到的 `turnId` codex:272-306 。如果没有活动 turn、`expectedTurnId` 不匹配，或当前 turn 类型不支持同轮 steer（如 review、手动 compaction），请求会失败并返回 `invalid request` 错误 codex:1492-1494 。

### 2. TUI 客户端侧：调用入口

TUI 的 `AppServerSession::turn_steer` 是发起该请求的客户端封装，把 `ThreadId`、`turn_id`、`client_user_message_id` 和用户输入 `items` 打包成 `ClientRequest::TurnSteer` 发出 codex:1325-1346 。

当 TUI 检测到线程有活动 turn（`active_turn_id_for_thread`）时，会优先尝试 `turn_steer` 而不是开启新 turn；只有在 steer 失败（`ActiveTurnNotSteerable`）时才转入 `enqueue_rejected_steer` 排队重试，若失败原因是"目标 turn 不存在/turn id 不匹配"（`ActiveTurnSteerRace`），还会重试一次，用服务端返回的实际 turn id 再次尝试 codex:661-744 。

### 3. App Server 服务端处理

服务端的 `turn_steer_inner` 负责校验输入合法性（`validate_v2_input_limit`）、要求 `expected_turn_id` 非空，然后调用 Core 侧 `thread.steer_turn(...)` 提交真正的 steer 请求 codex:1006-1057 。如果 Core 返回 `NotSubmittedReason`（例如 `NoActiveTurn`、`ExpectedTurnMismatch`、`ActiveTurnNotSteerable`、`EmptyInput` 等），服务端会把对应原因转换成结构化的 `invalid request` 错误并附带详细的 `TurnSteerRequestError` 分类数据 codex:1058-1136 。

### 4. Core 侧决策：`steer_input`

Core 的 `session/turn_input.rs` 模块注释明确表明这是**唯一决定输入是开启新 turn、追加到活动 turn（steer）、还是被拒绝**的地方 codex:1-9 。具体的 `Session::steer_input` 函数：

1. 锁定 `active_turn`，若无活动任务返回 `NoActiveTurn` codex:561-569 ；
2. 校验 `expected_turn_id` 是否与当前活动 turn 一致，不一致返回 `ExpectedTurnMismatch` codex:572-579 ；
3. 检查任务类型：只有 `TaskKind::Regular` 允许 steer，`Review`/`Compact` 类型会拒绝并返回 `ActiveTurnNotSteerable` codex:581-593 ；
4. 校验输入非空、输出 schema 是否匹配 codex:595-605 ；
5. 通过校验后，把新输入合并进 `pending_input`，调用 `extend_pending_input_and_accept_mailbox_delivery_for_turn_state` 写入当前 turn 的挂起输入队列，并返回该 turn id codex:606-649 。

### 5. 何时真正被喂给模型

写入 `pending_input` 后并不会立刻打断正在进行的模型调用/工具执行。驱动 turn 执行的主循环 `run_turn`（`session/turn.rs`）在**每次迭代开始时**都会调用 `sess.input_queue.get_pending_input(...)` 取出 steer 进来的内容，合并进下一次发给模型的请求上下文 codex:333-404 。

## Notes

- `turn/steer` 不会触发 `turn/started` 通知，也不接受线程设置覆盖（thread settings overrides） codex:1479-1480 。
- 若 steer 被拒绝，TUI 会退化为排队等待当前 turn 结束后作为新 turn 重新提交。

### Citations

**File:** codex-rs/core/src/session/turn_input.rs (L1-9)
```rust
//! Handles reply-bearing turn-input operations.
//!
//! This is the one place Core decides whether submitted input starts a turn,
//! steers an active turn, or is rejected. It replies after that decision; it
//! does not wait for user-prompt hooks, updating the in-memory model context,
//! rollout persistence, or sampling.
//!
//! Persistent thread settings apply on Started and Steered. Turn start
//! options only apply on Started.
```

**File:** codex-rs/core/src/session/turn_input.rs (L553-649)
```rust
    async fn steer_input(
        &self,
        input: &mut SubmittedTurnInput,
        additional_context: BTreeMap<String, AdditionalContextEntry>,
        expected_turn_id: Option<&str>,
        required_final_output_json_schema: Option<&Value>,
        responsesapi_client_metadata: Option<HashMap<String, String>>,
        incoming_root_turn_id: Option<Option<String>>,
    ) -> Result<String, NotSubmittedReason> {
        let mut active = self.active_turn.lock().await;
        let Some(active_turn) = active.as_mut() else {
            return Err(NotSubmittedReason::NoActiveTurn);
        };

        let Some(active_task) = active_turn.task.as_ref() else {
            return Err(NotSubmittedReason::NoActiveTurn);
        };
        let active_turn_id = &active_task.turn_context.sub_id;

        if let Some(expected_turn_id) = expected_turn_id
            && expected_turn_id != active_turn_id
        {
            return Err(NotSubmittedReason::ExpectedTurnMismatch {
                expected: expected_turn_id.to_string(),
                actual: active_turn_id.clone(),
            });
        }

        match active_task.kind {
            crate::state::TaskKind::Regular => {}
            crate::state::TaskKind::Review => {
                return Err(NotSubmittedReason::ActiveTurnNotSteerable {
                    turn_kind: NonSteerableTurnKind::Review,
                });
            }
            crate::state::TaskKind::Compact => {
                return Err(NotSubmittedReason::ActiveTurnNotSteerable {
                    turn_kind: NonSteerableTurnKind::Compact,
                });
            }
        }
        ...
        self.input_queue
            .extend_pending_input_and_accept_mailbox_delivery_for_turn_state(
                active_turn.turn_state.as_ref(),
                pending_input,
            )
            .await;
        Ok(active_turn_id.clone())
    }
```

**File:** codex-rs/core/src/session/input_queue.rs (L259-270)
```rust
    pub(super) async fn extend_pending_input_and_accept_mailbox_delivery_for_turn_state(
        &self,
        turn_state: &Mutex<TurnState>,
        input: Vec<TurnInput>,
    ) {
        {
            let mut turn_state = turn_state.lock().await;
            turn_state.pending_input.items.extend(input);
            turn_state.accept_mailbox_delivery_for_current_turn();
        }
        self.activity_tx.send_replace(InputQueueActivity::Steer);
    }
```

**File:** codex-rs/core/src/session/turn.rs (L333-404)
```rust
    let mut next_step_context = Some(first_step_context);
    loop {
        // Note that pending_input would be something like a message the user
        // submitted through the UI while the model was running. Though the UI
        // may support this, the model might not.
        let pending_input = if can_drain_pending_input {
            sess.input_queue
                .get_pending_input(&sess.active_turn)
                .await
                .0
        } else {
            Vec::new()
        };
        ...
```

**File:** codex-rs/tui/src/chatwidget/input_queue.rs (L21-48)
```rust
#[derive(Debug, Default)]
pub(super) struct InputQueueState {
    /// User inputs queued while a turn is in progress.
    pub(super) queued_user_messages: VecDeque<QueuedUserMessage>,
    ...
    /// User messages that tried to steer a non-regular turn and must be retried first.
    pub(super) rejected_steers_queue: VecDeque<UserMessage>,
    ...
    /// Steers already submitted to core but not yet committed into history.
    pub(super) pending_steers: VecDeque<PendingSteer>,
    ...
}
```

**File:** codex-rs/app-server/README.md (L1477-1494)
```markdown
### Example: Steer an active turn

Use `turn/steer` to append additional user input to the currently active regular turn. This does
not emit `turn/started` and does not accept thread settings overrides.
...
```

**File:** codex-rs/app-server/src/request_processors/turn_processor.rs (L1058-1136)
```rust
        let turn_id = match submission {
            SteerSubmission::Steered { turn_id } => turn_id,
            SteerSubmission::NotSubmitted { reason } => {
                let (message, data, error_type) = match reason {
                    NotSubmittedReason::NoActiveTurn | NotSubmittedReason::NotIdle => (
                        "no active turn to steer".to_string(),
                        ...
                    ),
                    NotSubmittedReason::ExpectedTurnMismatch { expected, actual } => (
                        format!("expected active turn id `{expected}` but found `{actual}`"),
                        ...
                    ),
                    NotSubmittedReason::ActiveTurnNotSteerable { turn_kind } => {
                        ...
                    }
                    NotSubmittedReason::EmptyInput => (
                        "input must not be empty".to_string(),
                        ...
                    ),
                    ...
                };
```

**File:** codex-rs/tui/src/app/thread_routing.rs (L661-744)
```rust
            AppCommand::UserTurn { ... } => {
                let mut should_start_turn = true;
                if let Some(turn_id) = self.active_turn_id_for_thread(thread_id).await {
                    let mut steer_turn_id = turn_id;
                    let mut retried_after_turn_mismatch = false;
                    loop {
                        match app_server
                            .turn_steer(
                                thread_id,
                                steer_turn_id.clone(),
                                client_user_message_id.clone(),
                                items.to_vec(),
                            )
                            .await
                        {
                            Ok(_) => return Ok(true),
                            Err(error) => {
                                if let Some(turn_error) =
                                    active_turn_not_steerable_turn_error(&error)
                                {
                                    if !self.chat_widget.enqueue_rejected_steer() {
                                        self.chat_widget.add_error_message(turn_error.message);
                                    }
                                    return Ok(true);
                                }
                                ...
                            }
                        }
                    }
                }
            }
```

**File:** codex-rs/tui/src/chatwidget/interaction.rs (L145-157)
```rust
        if self.chat_keymap.interrupt_turn.is_pressed(key_event)
            && !self.input_queue.pending_steers.is_empty()
            && self.bottom_pane.is_task_running()
            && self.bottom_pane.no_modal_or_popup_active()
            && !self.should_handle_vim_insert_escape(key_event)
        {
            self.input_queue.submit_pending_steers_after_interrupt = true;
            if self.submit_op(AppCommand::interrupt()) {
                self.pause_active_goal_for_interrupt();
            } else {
                self.input_queue.submit_pending_steers_after_interrupt = false;
            }
            return;
        }
```
