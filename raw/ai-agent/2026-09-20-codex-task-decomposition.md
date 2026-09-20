# DeepWiki Q&A with Code Context for Repository: openai/codex

> Source: DeepWiki Q&A with Code Context for Repository: openai/codex
> Collected: 2026-09-20
> Published: Unknown

## Q1

拿到复杂需求时，怎么划分子任务

## 答案

在 Codex 代码库中，"拿到复杂需求时如何划分子任务"这一逻辑主要体现在两个地方：**Planning（计划工具）指导原则**和**多智能体（multi-agent）委派规则**。

---

### 1. 使用 Plan 工具进行任务分解

系统提示词 `gpt_5_2_prompt.md` 明确指出何时该用 `update_plan` 工具拆解任务：任务非平凡、存在多阶段/依赖关系、有歧义需要理清高层目标、需要中间检查点时使用计划 codex:48-56 。

拆解时的高质量与低质量示例给出了具体标准——好的计划应按照有意义、逻辑顺序的步骤拆分（如"解析 Markdown → 应用 HTML 模板 → 处理代码块 → 错误处理"这种颗粒度），而不是过于笼统的步骤 codex:60-106 。

对于简单任务（大约最简单的 40%~25%），不建议使用计划工具，也不要做单步计划 codex:33-35 codex:59-62 。

### 2. 委派给子智能体（Sub-agent）时的拆分规则

当任务复杂到需要并行处理或委派子智能体时，`spawn_agent` 工具的描述文本中给出了详细的子任务设计规则，位于 `multi_agents_spec.rs`：

- **先分析再委派**：先快速分析整体任务，形成高层计划，区分"关键路径上的阻塞任务"与"可并行的旁支任务"，并明确当下该自己做哪部分 codex:700-705 。

- **子任务设计原则**：
  - 子任务必须具体、边界清晰、自成一体（self-contained）
  - 委派的子任务必须能实质性推进主任务
  - 主任务与委派子任务之间不能重复劳动
  - 对于代码编辑类子任务，需保证各子任务的"写入范围"互不重叠（disjoint write set） codex:706-714 。

- **并行委派模式**：独立的信息收集类子任务可并行执行；将实现工作拆分为互不重叠的代码切片，分别派发给不同 agent 并行处理；验证类工作可与正在进行的实现并行委派 codex:723-727 。

这段完整的工具描述会被组装进 `spawn_agent_tool_description` 函数中，作为该工具的说明文本提供给模型使用 codex:664-694 。

### 3. Orchestrator 模式下的补充规则

在 `orchestrator.md` 模板中，进一步强调：应优先使用多个子智能体并行工作以节省时间；当有多步骤计划时，只要可行就应"每个步骤派生一个 agent"并行处理，而不是自己顺序执行 codex:37-42 。

`experimental_prompt.md` 中也列出了适合拆分为多 agent 的典型场景：非常大且有多个明确定义范围的任务、需要另一个 agent 做 review、需要与另一个 agent 讨论构思、或将测试/日志密集型工作交给专门 agent 以节省自身上下文 codex:1-8 。

---

## Notes

- 以上内容均来自 Codex CLI 内置的系统提示词（system prompt）与工具描述文本，是"模型该如何拆分任务"的**指导规则**，而不是执行拆分逻辑的算法代码——真正的拆分决策由模型在运行时根据这些提示词做出。
- `multi_agents.rs` codex:1-30  定义了多智能体系统的角色协议（root agent / sub-agent 消息格式等），是支撑上述委派规则的底层基础设施，但并不直接包含"如何拆分子任务"的策略文字。
- `gpt_5_1_prompt.md` 与 `gpt_5_2_prompt.md` 内容高度相似（不同模型版本对应的提示词），只展示了后者的引用，二者规则基本一致。
- 若你想了解某个具体版本模型（如 GPT-5.6）的更细致提示指南，`prompting-guide.md` 中也有关于"复杂提示结构"的建议模板 codex:255-269 ，但这更偏向"如何写 prompt"而非"如何拆分子任务"。

Wiki pages you might want to explore:
- [Models Manager (openai/codex)](/wiki/openai/codex#3.8)

### Citations

**File:** codex-rs/core/gpt_5_2_prompt.md (L48-56)
```markdown
Use a plan when:

- The task is non-trivial and will require multiple actions over a long time horizon.
- There are logical phases or dependencies where sequencing matters.
- The work has ambiguity that benefits from outlining high-level goals.
- You want intermediate checkpoints for feedback and validation.
- When the user asked you to do more than one thing in a single prompt
- The user has asked you to use the plan tool (aka "TODOs")
- You generate additional steps while working, and plan to do them before yielding to the user
```

**File:** codex-rs/core/gpt_5_2_prompt.md (L60-106)
```markdown
**High-quality plans**

Example 1:

1. Add CLI entry with file args
2. Parse Markdown via CommonMark library
3. Apply semantic HTML template
4. Handle code blocks, images, links
5. Add error handling for invalid files

Example 2:

1. Define CSS variables for colors
2. Add toggle with localStorage state
3. Refactor components to use variables
4. Verify all views for readability
5. Add smooth theme-change transition

Example 3:

1. Set up Node.js + WebSocket server
2. Add join/leave broadcast events
3. Implement messaging with timestamps
4. Add usernames + mention highlighting
5. Persist messages in lightweight DB
6. Add typing indicators + unread count

**Low-quality plans**

Example 1:

1. Create CLI tool
2. Add Markdown parser
3. Convert to HTML

Example 2:

1. Add dark mode toggle
2. Save preference
3. Make styles look good

Example 3:

1. Create single-file HTML game
2. Run quick sanity check
3. Summarize usage instructions

```

**File:** codex-rs/core/templates/agents/orchestrator.md (L33-35)
```markdown
- Use the plan tool to explain to the user what you are going to do
    - Only use it for more complex tasks, do not use it for straightforward tasks (roughly the easiest 40%).
    - Do not make single-step plans. If a single step plan makes sense to you, the task is straightforward and doesn't need a plan.
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

**File:** codex-rs/core/templates/model_instructions/gpt-5.2-codex_instructions_template.md (L59-62)
```markdown
When using the planning tool:
- Skip using the planning tool for straightforward tasks (roughly the easiest 25%).
- Do not make single-step plans.
- When you made a plan, update it after having performed one of the sub-tasks that you shared on the plan.
```

**File:** codex-rs/core/src/tools/handlers/multi_agents_spec.rs (L664-694)
```rust
fn spawn_agent_tool_description(
    available_models_description: Option<&str>,
    inherited_model_guidance: Option<&str>,
    return_value_description: &str,
    usage_hint_text: Option<String>,
) -> String {
    let agent_role_guidance = available_models_description.unwrap_or_default();
    let inherited_model_guidance = inherited_model_guidance.unwrap_or_default();

    let tool_description = format!(
        r#"
        {agent_role_guidance}
        Spawn a sub-agent for a well-scoped task. {return_value_description} {inherited_model_guidance}"#
    );

    if let Some(usage_hint_text) = usage_hint_text {
        return format!(
            r#"
        {tool_description}
{usage_hint_text}"#
        );
    }
    let agent_role_usage_hint = available_models_description
        .map(|_| {
            "Agent-role guidance below only helps choose which agent to use after spawning is already authorized; it never authorizes spawning by itself."
        })
        .unwrap_or_default();
    format!(
        r#"
        {tool_description}
This spawn_agent tool provides you access to sub-agents that inherit your current model by default. Do not set the `model` field unless the user explicitly asks for a different model. You should follow the rules and guidelines below to use this tool.
```

**File:** codex-rs/core/src/tools/handlers/multi_agents_spec.rs (L700-705)
```rust
### When to delegate vs. do the subtask yourself
- First, quickly analyze the overall user task and form a succinct high-level plan. Identify which tasks are immediate blockers on the critical path, and which tasks are sidecar tasks that are needed but can run in parallel without blocking the next local step. As part of that plan, explicitly decide what immediate task you should do locally right now. Do this planning step before delegating to agents so you do not hand off the immediate blocking task to a submodel and then waste time waiting on it.
- Use a subagent when a subtask is easy enough for it to handle and can run in parallel with your local work. Prefer delegating concrete, bounded sidecar tasks that materially advance the main task without blocking your immediate next local step.
- Do not delegate urgent blocking work when your immediate next step depends on that result. If the very next action is blocked on that task, the main rollout should usually do it locally to keep the critical path moving.
- Keep work local when the subtask is too difficult to delegate well and when it is tightly coupled, urgent, or likely to block your immediate next step.

```

**File:** codex-rs/core/src/tools/handlers/multi_agents_spec.rs (L706-714)
```rust
### Designing delegated subtasks
- Subtasks must be concrete, well-defined, and self-contained.
- Delegated subtasks must materially advance the main task.
- Do not duplicate work between the main rollout and delegated subtasks.
- Avoid issuing multiple delegate calls on the same unresolved thread unless the new delegated task is genuinely different and necessary.
- Narrow the delegated ask to the concrete output you need next.
- For coding tasks, prefer delegating concrete code-change worker subtasks over read-only explorer analysis when the subagent can make a bounded patch in a clear write scope.
- When delegating coding work, instruct the submodel to edit files directly in its forked workspace and list the file paths it changed in the final answer.
- For code-edit subtasks, decompose work so each delegated task has a disjoint write set.
```

**File:** codex-rs/core/src/tools/handlers/multi_agents_spec.rs (L723-727)
```rust
### Parallel delegation patterns
- Run multiple independent information-seeking subtasks in parallel when you have distinct questions that can be answered independently.
- Split implementation into disjoint codebase slices and spawn multiple agents for them in parallel when the write scopes do not overlap.
- Delegate verification only when it can run in parallel with ongoing implementation and is likely to catch a concrete risk before final integration.
- The key is to find opportunities to spawn multiple independent subtasks in parallel within the same round, while ensuring each subtask is well-defined, self-contained, and materially advances the main task."#
```

**File:** codex-rs/core/templates/collab/experimental_prompt.md (L1-8)
```markdown
## Multi agents
You have the possibility to spawn and use other agents to complete a task. For example, this can be use for:
* Very large tasks with multiple well-defined scopes
* When you want a review from another agent. This can review your own work or the work of another agent.
* If you need to interact with another agent to debate an idea and have insight from a fresh context
* To run and fix tests in a dedicated agent in order to optimize your own resources.

This feature must be used wisely. For simple or straightforward tasks, you don't need to spawn a new agent.
```

**File:** codex-rs/core/src/session/multi_agents.rs (L1-30)
```rust
use crate::config::MultiAgentV2Config;
use crate::context::MultiAgentRoleInstructions;
use crate::session::turn_context::TurnContext;
use codex_protocol::config_types::MultiAgentMode;
use codex_protocol::openai_models::MultiAgentRoleMessages;
use codex_protocol::openai_models::ReasoningEffort;
use codex_protocol::protocol::MultiAgentVersion;
use codex_protocol::protocol::SessionSource;
use codex_protocol::protocol::SubAgentSource;

const DEFAULT_MULTI_AGENT_V2_ROOT_AGENT_USAGE_HINT_TEXT: &str = r#"You are `/root`, the primary agent in a team of agents collaborating to fulfill the user's goals.

At the start of your turn, you are the active agent.
You can spawn sub-agents to handle subtasks, and those sub-agents can spawn their own sub-agents.
All agents in the team, including the agents that you can assign tasks to, are equally intelligent and capable, and have access to the same set of tools.

You can use `spawn_agent` to create a new agent, `followup_task` to give an existing agent a new task and trigger a turn, and `send_message` to pass a message to a running agent without triggering a turn.
Child agents can also spawn their own sub-agents.
You can decide how much context you want to propagate to your sub-agents with the `fork_turns` parameter.

You will receive messages in the analysis channel in the form:
```
Message Type: MESSAGE | FINAL_ANSWER
Task name: <recipient>
Sender: <author>
Payload:
<payload text>
```
They may be addressed as to=/root
"#;
```

**File:** codex-rs/skills/src/assets/samples/openai-docs/references/prompting-guide.md (L255-269)
```markdown
## Suggested prompt structure

Use this structure as a starting point for complex prompts. Keep each section short. Add detail only where it changes behavior.

    Role: [the model's function and context]

    Personality: [tone and collaboration style]

    Goal: [user-visible outcome]

    Success criteria: [what must be true before the final answer]

    Constraints: [policy, safety, business, evidence, and side-effect limits]

    Tools: [which tools to use, when, and what not to use]
```

## Q2

拆分的依据是什么

## 答案

拆分子任务的依据主要有三类：**任务复杂度门槛**、**依赖/阻塞关系**、**写入范围（write scope）是否重叠**。

---

### 1. 是否值得拆分：复杂度门槛

只有非平凡、多阶段、有依赖顺序、或有歧义需要理清目标的任务才需要拆分为计划步骤 codex:48-56 。简单任务（约最简单的 25%~40%）不需要拆分，也不要做"单步计划"（意味着任务本身够简单，不需要拆） codex:33-35 codex:59-62 。

### 2. 拆分粒度：逻辑阶段 vs 过度笼统

高质量计划的判断标准是每一步都是"有意义、可独立验证的逻辑阶段"，例如按"CLI 入口 → 解析 → 应用模板 → 处理细节 → 错误处理"这种功能层次拆分，而不是"创建工具 → 加解析器 → 转 HTML"这种笼统步骤 codex:60-106 。

### 3. 是否委派给子智能体：阻塞关系（critical path）

这是最核心的依据——先分析哪些任务是"关键路径上的阻塞项"（自己必须马上做），哪些是"可并行的旁支任务"（可以委派）：

- 关键路径阻塞任务 → 自己本地做，不要委派后干等 codex:700-705
- 简单、可并行、不阻塞下一步的旁支任务 → 委派给 sub-agent

### 4. 子任务设计的具体依据

委派出去的子任务必须满足：

- 具体、边界清晰、自成一体（self-contained）
- 能实质性推进主任务，且不与主线程重复劳动
- 对代码编辑类任务，**各子任务的写入范围（write set）必须互不重叠**，这是并行拆分代码修改工作时最关键的依据 codex:706-714

### 5. 并行拆分的适用场景

- 多个**独立**的信息收集类问题 → 可并行委派
- 实现工作拆成**互不重叠的代码切片** → 并行委派
- 验证工作只有在能与实现并行、且能提前发现具体风险时才委派 codex:723-727

`orchestrator.md` 模板进一步强调：一旦有多步计划，只要可行就"每个步骤派生一个 agent"并行处理 codex:37-42 。

---

## Notes

- 简而言之，拆分依据可归纳为：**复杂度是否达到阈值 → 按逻辑阶段/依赖顺序切分 → 判断是否阻塞关键路径 → 若可并行则按写入范围互不重叠原

### Citations

**File:** codex-rs/core/gpt_5_2_prompt.md (L48-56)
```markdown
Use a plan when:

- The task is non-trivial and will require multiple actions over a long time horizon.
- There are logical phases or dependencies where sequencing matters.
- The work has ambiguity that benefits from outlining high-level goals.
- You want intermediate checkpoints for feedback and validation.
- When the user asked you to do more than one thing in a single prompt
- The user has asked you to use the plan tool (aka "TODOs")
- You generate additional steps while working, and plan to do them before yielding to the user
```

**File:** codex-rs/core/gpt_5_2_prompt.md (L60-106)
```markdown
**High-quality plans**

Example 1:

1. Add CLI entry with file args
2. Parse Markdown via CommonMark library
3. Apply semantic HTML template
4. Handle code blocks, images, links
5. Add error handling for invalid files

Example 2:

1. Define CSS variables for colors
2. Add toggle with localStorage state
3. Refactor components to use variables
4. Verify all views for readability
5. Add smooth theme-change transition

Example 3:

1. Set up Node.js + WebSocket server
2. Add join/leave broadcast events
3. Implement messaging with timestamps
4. Add usernames + mention highlighting
5. Persist messages in lightweight DB
6. Add typing indicators + unread count

**Low-quality plans**

Example 1:

1. Create CLI tool
2. Add Markdown parser
3. Convert to HTML

Example 2:

1. Add dark mode toggle
2. Save preference
3. Make styles look good

Example 3:

1. Create single-file HTML game
2. Run quick sanity check
3. Summarize usage instructions

```

**File:** codex-rs/core/templates/agents/orchestrator.md (L33-35)
```markdown
- Use the plan tool to explain to the user what you are going to do
    - Only use it for more complex tasks, do not use it for straightforward tasks (roughly the easiest 40%).
    - Do not make single-step plans. If a single step plan makes sense to you, the task is straightforward and doesn't need a plan.
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

**File:** codex-rs/core/templates/model_instructions/gpt-5.2-codex_instructions_template.md (L59-62)
```markdown
When using the planning tool:
- Skip using the planning tool for straightforward tasks (roughly the easiest 25%).
- Do not make single-step plans.
- When you made a plan, update it after having performed one of the sub-tasks that you shared on the plan.
```

**File:** codex-rs/core/src/tools/handlers/multi_agents_spec.rs (L700-705)
```rust
### When to delegate vs. do the subtask yourself
- First, quickly analyze the overall user task and form a succinct high-level plan. Identify which tasks are immediate blockers on the critical path, and which tasks are sidecar tasks that are needed but can run in parallel without blocking the next local step. As part of that plan, explicitly decide what immediate task you should do locally right now. Do this planning step before delegating to agents so you do not hand off the immediate blocking task to a submodel and then waste time waiting on it.
- Use a subagent when a subtask is easy enough for it to handle and can run in parallel with your local work. Prefer delegating concrete, bounded sidecar tasks that materially advance the main task without blocking your immediate next local step.
- Do not delegate urgent blocking work when your immediate next step depends on that result. If the very next action is blocked on that task, the main rollout should usually do it locally to keep the critical path moving.
- Keep work local when the subtask is too difficult to delegate well and when it is tightly coupled, urgent, or likely to block your immediate next step.

```

**File:** codex-rs/core/src/tools/handlers/multi_agents_spec.rs (L706-714)
```rust
### Designing delegated subtasks
- Subtasks must be concrete, well-defined, and self-contained.
- Delegated subtasks must materially advance the main task.
- Do not duplicate work between the main rollout and delegated subtasks.
- Avoid issuing multiple delegate calls on the same unresolved thread unless the new delegated task is genuinely different and necessary.
- Narrow the delegated ask to the concrete output you need next.
- For coding tasks, prefer delegating concrete code-change worker subtasks over read-only explorer analysis when the subagent can make a bounded patch in a clear write scope.
- When delegating coding work, instruct the submodel to edit files directly in its forked workspace and list the file paths it changed in the final answer.
- For code-edit subtasks, decompose work so each delegated task has a disjoint write set.
```

**File:** codex-rs/core/src/tools/handlers/multi_agents_spec.rs (L723-727)
```rust
### Parallel delegation patterns
- Run multiple independent information-seeking subtasks in parallel when you have distinct questions that can be answered independently.
- Split implementation into disjoint codebase slices and spawn multiple agents for them in parallel when the write scopes do not overlap.
- Delegate verification only when it can run in parallel with ongoing implementation and is likely to catch a concrete risk before final integration.
- The key is to find opportunities to spawn multiple independent subtasks in parallel within the same round, while ensuring each subtask is well-defined, self-contained, and materially advances the main task."#
```
