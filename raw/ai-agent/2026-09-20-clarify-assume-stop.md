# DeepWiki Q&A: 目标模糊 / 信息缺失 / 约束冲突时如何决定澄清、假设或停止

> Source: DeepWiki Q&A with Code Context（charmbracelet/crush; anthropics/claude-code; openai/codex）
> Collected: 2026-09-20
> Published: Unknown

## Q1（Crush）

Crush 的 Agent 在目标模糊、信息缺失或约束冲突时，遵循一套明确的"自主决策优先，谨慎澄清，明确停止条件"的策略，主要定义在系统提示模板中。

---

## 决策逻辑

### 1. 默认原则：自主假设，避免打断

`coder.md.tpl` 的 `<decision_making>` 部分明确要求 Agent 优先自己解决问题而非提问：搜索代码、阅读模式、检查相似实现、从上下文推断，并"当需求不完整但不明显危险时，基于项目模式和记忆文件做出最合理假设，简要说明后继续执行，而不是等待澄清" [1](#0-0) 。

### 2. 何时应该澄清/停止

只有在以下情况才允许停止提问：
- 真正含糊的业务需求
- 多个有效方案且权衡巨大
- 可能造成数据丢失
- 已经穷尽所有尝试且遇到实际阻塞性错误 [2](#0-1)

同时明确列出**绝不应该停止**的情形：任务看起来太大、需要改多个文件、担心"会话限制"（并不存在）、工作步骤很多 [3](#0-2) 。

### 3. 请求信息时的具体规范

当必须向用户请求信息/权限时，要求穷尽所有工具、搜索和合理假设后才可以提问，并且不能只说"需要更多信息"，而要在同一条消息中列出：缺失项、为何需要、可替代方案、以及已尝试过什么 [4](#0-3) 。

真正停下来时，需先完成所有未阻塞的部分，再清晰报告：已尝试的内容、被阻塞的具体原因、所需的最小外部动作，并且不能因单一路径失败就停止——要先穷尽多种合理方法 [5](#0-4) 。

### 4. 澄清的正式渠道：Question Tool

当确实需要澄清时，Agent 不是用纯文本提问，而是调用结构化的 `question` 工具（定义见 `internal/agent/tools/question.md`），它支持 `yes_no`、`single_choice`、`multi_choice`、`free_text` 四种类型，并强制要求提供 `description` 说明背景/权衡 [6](#0-5) 。该工具的"适用场景"明确写明：确认破坏性或含糊的操作、用户请求存在多种合理解释、需要用户从选项中选择、一次性收集多个相关答案 [7](#0-6) ；而"不适用场景"则是可以通过读代码/文档、或其他工具获得的信息，以及权限确认（权限系统单独处理） [8](#0-7) 。

### 5. Plan 模式下更严格的澄清规则

在计划模式 (`plan.md.tpl`) 中，规则更严格："仅在为产出正确实现计划而严格必要时才提出澄清问题"，且只能用 `question` 工具做澄清用途，**绝不能**用它做最终计划确认 [9](#0-8) 。工作流也要求：先做批判性复审找出差距、矛盾、未验证假设，反复弥补直到有信心，然后才决定是否需要提问澄清以解锁计划 [10](#0-9) 。风格指南进一步强调：代码能验证的问题不要问，若代码含糊则用 `question` 工具而非纯文本；综合探索结果后要"明确列出仍未知或未验证的内容"，未闭环或未声明为假设前不得草拟计划 [11](#0-10) 。

---

## Notes

- 这套逻辑全部来自系统提示模板（`coder.md.tpl` 和 `plan.md.tpl`），是对 LLM 行为的约束性指令，而非代码层面强制执行的控制流；实际执行效果取决于模型对提示的遵循程度。
- `question` 工具的技术实现（`internal/question/question.go`、`internal/ui/dialog/question_form.go` 等）在 wiki 页面 "Question Tool" 中有详细描述，涉及基于 pub/sub 的阻塞式交互流程，但本次未直接引用其源码，仅引用了工具描述文档 `question.md`。
- Plan 模式和普通 Coder 模式的澄清尺度不同：Plan 模式更保守（只在必要时问），Coder 模式则更倾向自主推进并事后说明假设。

Wiki pages you might want to explore:
- [Streaming and Summarization (charmbracelet/crush)](/wiki/charmbracelet/crush#4.5)
- [Question Tool (charmbracelet/crush)](/wiki/charmbracelet/crush#6.9)

### Citations

**File:** internal/agent/templates/coder.md.tpl (L99-106)
```text
<decision_making>
**Make decisions autonomously** - don't ask when you can:
- Search to find the answer
- Read files to see patterns
- Check similar code
- Infer from context
- Try most likely approach
- When requirements are underspecified but not obviously dangerous, make the most reasonable assumptions based on project patterns and memory files, briefly state them if needed, and proceed instead of waiting for clarification.
```

**File:** internal/agent/templates/coder.md.tpl (L108-112)
```text
**Only stop/ask user if**:
- Truly ambiguous business requirement
- Multiple valid approaches with big tradeoffs
- Could cause data loss
- Exhausted all attempts and hit actual blocking errors
```

**File:** internal/agent/templates/coder.md.tpl (L114-118)
```text
**When requesting information/access**:
- Exhaust all available tools, searches, and reasonable assumptions first.
- Never say "Need more info" without detail.
- In the same message, list each missing item, why it is required, acceptable substitutes, and what you already attempted.
- State exactly what you will do once the information arrives so the user knows the next step.
```

**File:** internal/agent/templates/coder.md.tpl (L120-120)
```text
When you must stop, first finish all unblocked parts of the request, then clearly report: (a) what you tried, (b) exactly why you are blocked, and (c) the minimal external action required. Don't stop just because one path failed—exhaust multiple plausible approaches first.
```

**File:** internal/agent/templates/coder.md.tpl (L122-126)
```text
**Never stop for**:
- Task seems too large (break it down)
- Multiple files to change (change them)
- Concerns about "session limits" (no such limits exist)
- Work will take many steps (do all the steps)
```

**File:** internal/agent/tools/question.md (L10-14)
```markdown
Every question MUST include:
- `type` — `yes_no`, `single_choice`, `multi_choice`, or `free_text`
- `question` — a short, direct question (one line)
- `description` — markdown context shown below the question with details,
  tradeoffs, or examples. **Always required.** Omitting it causes an error.
```

**File:** internal/agent/tools/question.md (L87-92)
```markdown
## When to use

- Confirm destructive or ambiguous actions
- User's request has multiple valid interpretations
- Need the user to pick from options
- Gather multiple related answers at once
```

**File:** internal/agent/tools/question.md (L94-98)
```markdown
## When NOT to use

- Questions answerable by reading code or docs
- Information obtainable via other tools
- Asking permission (use the permission system)
```

**File:** internal/agent/templates/plan.md.tpl (L22-24)
```text
5. ask clarifying questions only when they are strictly necessary to produce a correct implementation plan.
6. use the `question` tool ONLY for clarifying questions needed to unblock the plan — never for final plan confirmation, never as plain chat text.
7. once all required questions are answered and no further investigation is needed, output the plan bracketed by the start and end markers — the UI will prompt the user to confirm.
```

**File:** internal/agent/templates/plan.md.tpl (L31-34)
```text
4. critically review the synthesis — identify gaps, contradictions, unverified assumptions, and areas not yet explored; use additional targeted reads or searches to close gaps; repeat until confident nothing material is missing
5. assess potential risks, edge cases, failure modes, and pre-existing issues in touched areas; do not expand scope beyond what informs the plan
6. produce a concrete, actionable implementation plan
7. if needed, ask only clarifying questions required to unblock the plan; use the `question` tool — never plain text
```

**File:** internal/agent/templates/plan.md.tpl (L47-55)
```text
- Avoid asking open-ended questions for information that can be verified directly from the code.
- If the code is ambiguous or lacks context, do not guess; use the `question` tool to ask the user — never write questions as plain chat text.
- Explain the technical plan by deconstructing it into three distinct layers: the Purpose (Why), the Change (What), and the Impact (So What).
- Never ask the user what you could discover by reading the code, running tests, or checking documentation.
- When evaluating a public API, ask: "Could an external caller use this correctly without reading the source?"
- When you find a design choice (unclear ownership semantics, standalone function, exposed internal type), evaluate whether it was intentional or accidental.
- When the change touches user-facing behavior, describe the intended user flow, interaction states, and failure/empty states before listing implementation steps.
- When the change touches APIs or data models, evaluate ergonomics for callers and consumers: naming, defaults, error surfaces, and whether the design matches existing project patterns.
- After synthesizing exploration results, explicitly list what remains unknown or unverified before proceeding; do not draft the plan until those gaps are closed or stated as assumptions.
```

## Q2（Claude Code）

在 `feature-dev` 插件中，这一决策逻辑体现在两个层面：命令流程的强制澄清阶段，以及子代理系统提示中的 Edge Cases 处理规则。

---

## 1. 命令层面：`/feature-dev` 的澄清优先原则

`feature-dev.md` 的核心原则明确规定：遇到歧义、边界情况或未说明的行为时，应提出具体问题而非做假设，并等待用户回答后再继续 [1](#0-0) 。

**Phase 1 (Discovery)**：如果需求不清晰，Agent 应主动询问用户三类问题——要解决什么问题、功能应该做什么、有什么约束条件 [2](#0-1) 。

**Phase 3 (Clarifying Questions)** 是关键的"止损点"，文档中用 **CRITICAL** 标注：这是最重要的阶段之一，绝不能跳过 [3](#0-2) 。此阶段要求 Agent 系统性地识别所有未说明的方面（边界情况、错误处理、集成点、范围边界、设计偏好、向后兼容性、性能需求），将所有问题整理后一次性呈现给用户，并**等待答案后才能进入架构设计** [4](#0-3) 。

**"假设"的唯一合法路径**：只有当用户明确表示"whatever you think is best"（都听你的）时，Agent 才可以给出自己的推荐方案，但仍需获得用户的**明确确认**才能继续，而不是直接假设并执行 [5](#0-4) 。

同理，在 **Phase 4 (Architecture Design)** 中，即使 Agent 提出多套方案并给出推荐，仍需"询问用户偏好哪种方案"，而不是自行决定 [6](#0-5) ；在 **Phase 5 (Implementation)** 开始前，文档用大写强调"DO NOT START WITHOUT USER APPROVAL"，即冲突或不确定性未解决前必须停止，不能推进实现 [7](#0-6) 。

---

## 2. 子代理提示设计层面：Edge Cases 模式

在 `plugin-dev` 的 Agent 开发规范文档中，给出了更通用的设计模式，指导所有 Agent（不限于 feature-dev）如何在系统提示中声明"何时澄清 / 何时假设 / 何时停止"：

| 场景 | 处理方式 | 来源 |
|---|---|---|
| 信息不足 (Insufficient context) | 向用户请求澄清 | [8](#0-7) |
| 模式冲突 (Conflicting patterns) | 遵循最新/最明确的模式（即用假设规则消解冲突） | [9](#0-8) |
| 需求过于复杂 | 拆分为更小的子任务 | [10](#0-9) |
| 规则含糊不清 (Ambiguous rules) | 记录不确定性，请求澄清而非硬猜 | [11](#0-10) |
| 编排流程中某阶段失败 | 先重试，若仍失败则报告并**停止** | [12](#0-11) |
| 缺少依赖 | 向用户请求（而非假设默认值） | [13](#0-12) |

这套模式明确区分了三种响应策略：
- **澄清**：当信息缺失或规则含糊时，主动询问用户 [8](#0-7)
- **假设并明示**：当存在冲突但有明确优先级规则（如"最近/最明确的模式优先"）时，可以按规则做出假设，但通常仍需记录 [9](#0-8)
- **停止**：当执行失败或依赖缺失导致无法继续时，报告状态并停止，而不是强行continue [12](#0-11)

## Notes

- `feature-dev.md` 与 `system-prompt-design.md` 属于两个不同插件（`feature-dev` vs `plugin-dev`），前者是具体工作流实例，后者是编写 Agent 提示的通用指导规范；两者体现的原则高度一致（遇到歧义优先澄清、避免臆测），但并非直接调用关系。
- `feature-dev.md` 中还提到 `TodoWrite` 用于全程跟踪进度 [14](#0-13) ，这与澄清/停止决策本身无直接关系，仅作为流程管理工具补充说明。

Wiki pages you might want to explore:
- [Feature Development Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.3)

### Citations

**File:** plugins/feature-dev/commands/feature-dev.md (L12-12)
```markdown
- **Ask clarifying questions**: Identify all ambiguities, edge cases, and underspecified behaviors. Ask specific, concrete questions rather than making assumptions. Wait for user answers before proceeding with implementation. Ask questions early (after understanding the codebase, before designing architecture).
```

**File:** plugins/feature-dev/commands/feature-dev.md (L16-16)
```markdown
- **Use TodoWrite**: Track all progress throughout
```

**File:** plugins/feature-dev/commands/feature-dev.md (L28-31)
```markdown
2. If feature unclear, ask user for:
   - What problem are they solving?
   - What should the feature do?
   - Any constraints or requirements?
```

**File:** plugins/feature-dev/commands/feature-dev.md (L57-61)
```markdown
## Phase 3: Clarifying Questions

**Goal**: Fill in gaps and resolve all ambiguities before designing

**CRITICAL**: This is one of the most important phases. DO NOT SKIP.
```

**File:** plugins/feature-dev/commands/feature-dev.md (L63-67)
```markdown
**Actions**:
1. Review the codebase findings and original feature request
2. Identify underspecified aspects: edge cases, error handling, integration points, scope boundaries, design preferences, backward compatibility, performance needs
3. **Present all questions to the user in a clear, organized list**
4. **Wait for answers before proceeding to architecture design**
```

**File:** plugins/feature-dev/commands/feature-dev.md (L69-69)
```markdown
If the user says "whatever you think is best", provide your recommendation and get explicit confirmation.
```

**File:** plugins/feature-dev/commands/feature-dev.md (L78-81)
```markdown
1. Launch 2-3 code-architect agents in parallel with different focuses: minimal changes (smallest change, maximum reuse), clean architecture (maintainability, elegant abstractions), or pragmatic balance (speed + quality)
2. Review all approaches and form your opinion on which fits best for this specific task (consider: small fix vs large feature, urgency, complexity, team context)
3. Present to user: brief summary of each approach, trade-offs comparison, **your recommendation with reasoning**, concrete implementation differences
4. **Ask user which approach they prefer**
```

**File:** plugins/feature-dev/commands/feature-dev.md (L87-92)
```markdown
**Goal**: Build the feature

**DO NOT START WITHOUT USER APPROVAL**

**Actions**:
1. Wait for explicit user approval
```

**File:** plugins/plugin-dev/skills/agent-development/references/system-prompt-design.md (L128-129)
```markdown
**Edge Cases:**
- Insufficient context: Ask user for clarification
```

**File:** plugins/plugin-dev/skills/agent-development/references/system-prompt-design.md (L130-130)
```markdown
- Conflicting patterns: Follow most recent/explicit pattern
```

**File:** plugins/plugin-dev/skills/agent-development/references/system-prompt-design.md (L131-131)
```markdown
- Complex requirements: Break into smaller pieces
```

**File:** plugins/plugin-dev/skills/agent-development/references/system-prompt-design.md (L178-181)
```markdown
**Edge Cases:**
- No violations: Confirm validation passed
- Too many violations: Group by type, show top 20
- Ambiguous rules: Document uncertainty, request clarification
```

**File:** plugins/plugin-dev/skills/agent-development/references/system-prompt-design.md (L226-229)
```markdown
**Edge Cases:**
- Phase failure: Attempt retry, then report and stop
- Missing dependencies: Request from user
- Timeout: Report partial completion
```

## Q3（Codex）

在 Codex 代码库中，Agent 何时澄清、假设或停止的决策逻辑主要由 **Collaboration Mode 模板**和**系统 Prompt** 定义，而非由代码中的显式分支逻辑控制——这是一套嵌入模型指令的行为规则。

---

## 默认模式：优先假设，谨慎澄清

`codex-rs/collaboration-mode-templates/templates/default.md` 明确规定，在 Default 协作模式下，Agent 应"strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions" [1](#0-0) 。

`request_user_input` 工具的使用受到严格限制：

- 仅在该工具被列入当前 turn 可用工具时才能使用 [2](#0-1)
- 仅用于"答案能实质性提升工作质量"的可选问题，而非必要问题 [3](#0-2)
- 若调用后无返回结果，Agent 应凭最佳判断继续，而不是重复提问或视为阻塞 [4](#0-3)
- 永远不能用于权限请求/升级 [5](#0-4)
- 若确实需要用户输入才能安全继续，且不能使用 `request_user_input`，则应直接以一句简洁的纯文本问题询问用户，而非选择题格式 [6](#0-5)

这套模板会被注入到具体模型的 `model_messages.collaboration_modes.default` 字段中，例如 GPT-6-Astra 模型在 `models.json` 中就内嵌了这段相同的协作模式文本 [7](#0-6) ，说明该规则是随模型元数据一起下发、作用于实际 system prompt 的。

## 系统级 Prompt 的自主性规则

在核心系统 prompt `gpt_5_2_prompt.md` 中，Autonomy 部分进一步强化了"默认执行，不轻易停下"的原则：除非用户明确只是要方案/在头脑风暴/提问，否则应假设用户想要代码被实际修改并直接执行，"如果遇到障碍，应自行尝试解决" [8](#0-7) 。

同一文件也规定了何时必须停止：若在工作过程中发现自己没有做出的意外改动（可能是用户所为），应"立即停止并询问用户如何处理" [9](#0-8) ；对具破坏性的 git 操作（如 `git reset --hard`）也需要用户明确批准 [10](#0-9) 。

## Prompting Guide 中的通用决策原则

`prompting-guide.md`（面向 GPT-5.6 迁移的官方指导样例）给出了更通用的框架，用于指导如何在 prompt 里定义 Autonomy/Permission 边界：

- 对"回答/解释/审查/诊断/规划"类请求：仅检查相关材料并汇报结果，除非明确要求，否则不实施更改 [11](#0-10)
- 对"修改/构建/修复"类请求：可直接在范围内做改动并运行非破坏性验证，无需事先询问 [12](#0-11)
- 对外部写入、破坏性操作、购买或范围重大扩张，需要用户确认 [13](#0-12)
- 建议保留用户显式给出的取值；当取值隐含时，提供判断准则让模型从上下文推理，而非用通用默认值 [14](#0-13)
- 建议加入"停止条件"（stopping conditions），明确所需证据缺失时该如何回退 [15](#0-14)

## Skill 场景下的澄清原则

在 Skill 创建流程中（`SKILL.md`），同样体现"仅在必要且无法合理推断时才澄清"的原则："Ask clarifying questions only when the missing information matters and cannot be reasonably inferred" [16](#0-15) ；同时应保留已存在的用户选择（如 skill 的调用策略），除非用户主动要求更改 [17](#0-16) 。

---

## Notes

- 这些规则以**自然语言 prompt 模板**的形式存在（`default.md`、`gpt_5_2_prompt.md`、`SKILL.md`、`prompting-guide.md`），而非代码里的 if/else 逻辑；它们通过 `models.json` 中的 `model_messages.collaboration_modes` 字段注入到实际模型上下文中，具体机制可参考 Models Manager wiki 页面所述的 `ModelInfo.model_messages` 字段 [18](#0-17) 。
- 另有 `plan` 协作模式（区别于 `default`），在 `models.json` 中该字段目前为 `null` [19](#0-18) ，说明可能未对所有模型启用或还在开发中；无法从当前索引确认其具体内容。
- 如果你想查看完整的 `plan.md` 协作模式模板或某个具体模型的完整 `model_messages` 配置，由于索引大小限制，建议启动一个 Devin session 来获取完整文件内容。

Wiki pages you might want to explore:
- [Models Manager (openai/codex)](/wiki/openai/codex#3.8)

### Citations

**File:** codex-rs/collaboration-mode-templates/templates/default.md (L7-9)
```markdown
## request_user_input availability

Use the `request_user_input` tool only when it is listed in the available tools for this turn.
```

**File:** codex-rs/collaboration-mode-templates/templates/default.md (L11-11)
```markdown
In Default mode, strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions.
```

**File:** codex-rs/collaboration-mode-templates/templates/default.md (L13-13)
```markdown
Use the `request_user_input` tool only for optional questions where the answer would materially improve the quality of the work.
```

**File:** codex-rs/collaboration-mode-templates/templates/default.md (L15-15)
```markdown
If `request_user_input` returns no answers, continue with best judgment instead of asking again or treating the turn as blocked.
```

**File:** codex-rs/collaboration-mode-templates/templates/default.md (L17-17)
```markdown
Never use the `request_user_input` tool for permission requests or permission-related escalations.
```

**File:** codex-rs/collaboration-mode-templates/templates/default.md (L19-19)
```markdown
If explicit user input is required for another reason before progress can safely continue, do not use the `request_user_input` tool. Ask the user directly with one concise plain-text question instead. Never write a multiple choice question as a textual assistant message.
```

**File:** codex-rs/models-manager/models.json (L73-87)
```json
      "model_messages": {
        "instructions_template": "You are Codex, an agent based on GPT-6. You and the user share one workspace, and your job is to collaborate with them until their intended goal is completely handled.\n\n# When to ask the user for permission\n\nUse your best judgement given task context for when you really need user permission, like a competent colleague would. Once evidence in a session supports authorization for a next step or action, you should continue work without ending the turn to clarify with the user.\n\nUser authorization and preferences persist across turns. Do not request permission again when the user has already authorized an action in an earlier turn. The user's instruction, whether implied from the task or explicitly stated in the session, must take precedence over any gui ... (truncated)
        "instructions_variables": null,
        "persistent_instructions": "## Overview\nYou are now in persistent mode for this session until explicitly disabled by a later developer message.\n\nIn persistent mode, your first order goal is still to fulfill the user's request, as in non-persistent mode. The key difference is that now you need be more persistent and proactive: anticipate, identify, and perform useful follow-up tasks beyond the immediate deliverables.\n\nBecause a `final` answer immediately ends the turn, use `functions.send_user_message_async` to deliver answers while useful work remains. Only send a `final` message after concluding that no follow-up or proactive work could be a useful continuation of any user request in the current turn. Work that requires waiting still counts as a useful continuation; having no ... (truncated)
        "tools": null,
        "approvals": {
          "on_request": null,
          "on_request_auto_review": "\n`approvals_reviewer` is `auto_review`: Sandbox escalations with require_escalated will be reviewed for compliance with the policy.\nIf a rejection happens, you can continue with a safer alternative, or carry out checks to prove that the action is authorized or low risk before trying again. Complete unaffected work without asking for confirmation. Report anything that remains blocked, clarify why it was blocked by auto-review, inform the user of the risk and ask for approval.",
          "never": null,
          "unless_trusted": null
        },
        "collaboration_modes": {
          "default": "# Collaboration Mode: Default\n\nYou are now in Default mode. Any previous instructions for other modes (e.g. Plan mode) are no longer active.\n\nYour active mode changes only when new developer instructions with a different `<collaboration_mode>...</collaboration_mode>` change it; user requests or tool descriptions do not change mode by themselves. Known mode names are Default and Plan.\n\n## request_user_input availability\n\nUse the `request_user_input` tool only when it is listed in the available tools for this turn.\n\nIn Default mode, strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions.\n\nUse the `request_user_input` tool only for optional questions where the answer would materially improve the qu ... (truncated)
          "plan": null
        },
```

**File:** codex-rs/core/gpt_5_2_prompt.md (L26-26)
```markdown
    - Direct system/developer/user instructions (as part of a prompt) take precedence over AGENTS.md instructions.
```

**File:** codex-rs/core/gpt_5_2_prompt.md (L32-32)
```markdown
Unless the user explicitly asks for a plan, asks a question about the code, is brainstorming potential solutions, or some other intent that makes it clear that code should not be written, assume the user wants you to make code changes or run tools to solve the user's problem. In these cases, it's bad to output your proposed solution in a message, you should go ahead and actually implement the change. If you encounter challenges or blockers, you should attempt to resolve them yourself.
```

**File:** codex-rs/core/templates/agents/orchestrator.md (L27-27)
```markdown
- Be cautious when using git. **NEVER** use destructive commands like `git reset --hard` or `git checkout --` unless specifically requested or approved by the user.
```

**File:** codex-rs/skills/src/assets/samples/openai-docs/references/prompting-guide.md (L57-57)
```markdown
Preserve explicit user values. When the correct value is implicit, provide decision criteria and let the model reason from context or schema. Avoid universal defaults, keyword maps, and broad semantic shortcuts.
```

**File:** codex-rs/skills/src/assets/samples/openai-docs/references/prompting-guide.md (L59-67)
```markdown
Add stopping conditions:

    Resolve the request in the fewest useful tool loops, but do not let loop
    minimization outrank correctness, required evidence, calculations, or
    required citations.

    After each result, ask whether the core request can now be answered with
    useful evidence. If yes, answer. If required evidence is still missing,
    name the missing fact and use the smallest useful fallback.
```

**File:** codex-rs/skills/src/assets/samples/openai-docs/references/prompting-guide.md (L104-106)
```markdown
    For requests to answer, explain, review, diagnose, or plan, inspect the
    relevant materials and report the result. Do not implement changes unless
    the request also asks for them.
```

**File:** codex-rs/skills/src/assets/samples/openai-docs/references/prompting-guide.md (L108-109)
```markdown
    For requests to change, build, or fix, make the requested in-scope local
    changes and run relevant non-destructive validation without asking first.
```

**File:** codex-rs/skills/src/assets/samples/openai-docs/references/prompting-guide.md (L111-112)
```markdown
    Require confirmation for external writes, destructive actions, purchases,
    or a material expansion of scope.
```

**File:** codex-rs/skills/src/assets/samples/openai-docs/references/skill-creator/SKILL.md (L151-151)
```markdown
Ask clarifying questions only when the missing information matters and cannot be reasonably inferred. Respect a user-specified location; otherwise create discoverable skills in `$CODEX_HOME/skills`, or `~/.codex/skills` when `CODEX_HOME` is unset.
```

**File:** codex-rs/skills/src/assets/samples/skill-creator/SKILL.md (L153-153)
```markdown
Keep automatic skill selection enabled unless the user explicitly requests an explicit-only skill. When the intended invocation mode is genuinely unclear and matters to the requested workflow, ask whether the user wants normal automatic discovery or explicit-only invocation; otherwise preserve the default. Do not infer explicit-only invocation from sensitive operations or required approvals: keep the skill discoverable and require authorization immediately before the actual mutation. Preserve an existing skill's invocation policy unless the user asks to change it.
```
