# 计划质量校验：漏项 / 重复 / 不可执行

> Source: DeepWiki Q&A with Code Context（anthropics/claude-code; openai/codex; charmbracelet/crush）
> Collected: 2026-09-20
> Published: Unknown

## Q1（Claude Code）

有没有针对"模型生成的计划"进行漏项、重复步骤或不可执行步骤检测的系统或函数？

## Answer

根据当前索引到的代码内容,我没有找到专门针对"模型生成的计划"进行漏项、重复步骤或不可执行步骤检测的系统或函数。

---

### 详细说明

在提供的代码上下文中,与"计划(plan)"相关的机制主要出现在两个地方,但它们都不是通用的计划质量校验器:

1. **`code-architect` 子代理**:该代理负责生成实现蓝图(architecture blueprint),包含"Build Sequence"作为分阶段实施步骤清单 [1](#0-0) 。但其职责是**生成**计划,而非事后校验计划中是否有遗漏、重复或不可执行的步骤。

2. **`/code-review` 命令的验证阶段**:这是当前上下文中唯一涉及"验证"逻辑的系统,但它针对的是代码审查中发现的 bug/合规问题,而非任务计划本身。流程是:先由 4 个并行 agent 找出问题列表 [2](#0-1) ,然后为每个发现的问题启动独立的验证子代理来确认该问题确实存在(而不是误报) [3](#0-2) ,最后过滤掉未通过验证的问题 [4](#0-3) 。这种"生成→独立验证→过滤"的模式在架构上确实类似于对"计划/结果"做二次校验,但它专门服务于 PR 审查场景,并不是通用的计划漏项/重复/不可执行检测机制。

此外,`CHANGELOG.md` 中提到过一些与执行相关的修复,例如当子代理列表中的 `tools` 无法解析时,`Task` 工具会返回明确指出未识别条目的错误 [5](#0-4) (引用自 wiki 背景资料),但这属于工具配置校验,而非计划步骤本身的语义校验。

## Notes

- 由于索引大小限制,部分文件内容可能未被收录到当前上下文中(例如 Claude Code 主体的计划生成/执行引擎源码可能不在此索引范围内)。如果你需要确认核心 Agent Loop 或 `TodoWrite`/任务追踪相关模块中是否存在专门的计划校验逻辑,建议启动一个 Devin session 以访问完整代码库内容进行进一步排查。
- `plugins/feature-dev/commands/feature-dev.md` 中提到的多阶段编排流程(Explorer → Architect → Reviewer)也值得关注,它虽然引入了多个视角的交叉检查,但同样没有证据表明其专门检测"漏项/重复/不可执行步骤"。

Wiki pages you might want to explore:
- [Agent System & Subagents (anthropics/claude-code)](/wiki/anthropics/claude-code#3.1)
- [Code Review Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.2)

### Citations

**File:** plugins/feature-dev/agents/code-architect.md (L19-31)
```markdown
**3. Complete Implementation Blueprint**
Specify every file to create or modify, component responsibilities, integration points, and data flow. Break implementation into clear phases with specific tasks.

## Output Guidance

Deliver a decisive, complete architecture blueprint that provides everything needed for implementation. Include:

- **Patterns & Conventions Found**: Existing patterns with file:line references, similar features, key abstractions
- **Architecture Decision**: Your chosen approach with rationale and trade-offs
- **Component Design**: Each component with file path, responsibilities, dependencies, and interfaces
- **Implementation Map**: Specific files to create/modify with detailed change descriptions
- **Data Flow**: Complete flow from entry points through transformations to outputs
- **Build Sequence**: Phased implementation steps as a checklist
```

**File:** plugins/code-review/commands/code-review.md (L30-53)
```markdown
4. Launch 4 agents in parallel to independently review the changes. Each agent should return the list of issues, where each issue includes a description and the reason it was flagged (e.g. "CLAUDE.md adherence", "bug"). The agents should do the following:

   Agents 1 + 2: CLAUDE.md compliance sonnet agents
   Audit changes for CLAUDE.md compliance in parallel. Note: When evaluating CLAUDE.md compliance for a file, you should only consider CLAUDE.md files that share a file path with the file or parents.

   Agent 3: Opus bug agent (parallel subagent with agent 4)
   Scan for obvious bugs. Focus only on the diff itself without reading extra context. Flag only significant bugs; ignore nitpicks and likely false positives. Do not flag issues that you cannot validate without looking at context outside of the git diff.

   Agent 4: Opus bug agent (parallel subagent with agent 3)
   Look for problems that exist in the introduced code. This could be security issues, incorrect logic, etc. Only look for issues that fall within the changed code.

   **CRITICAL: We only want HIGH SIGNAL issues.** Flag issues where:
   - The code will fail to compile or parse (syntax errors, type errors, missing imports, unresolved references)
   - The code will definitely produce wrong results regardless of inputs (clear logic errors)
   - Clear, unambiguous CLAUDE.md violations where you can quote the exact rule being broken

   Do NOT flag:
   - Code style or quality concerns
   - Potential issues that depend on specific inputs or state
   - Subjective suggestions or improvements

   If you are not certain an issue is real, do not flag it. False positives erode trust and waste reviewer time.

   In addition to the above, each subagent should be told the PR title and description. This will help provide context regarding the author's intent.
```

**File:** plugins/code-review/commands/code-review.md (L55-57)
```markdown
5. For each issue found in the previous step by agents 3 and 4, launch parallel subagents to validate the issue. These subagents should get the PR title and description along with a description of the issue. The agent's job is to review the issue to validate that the stated issue is truly an issue with high confidence. For example, if an issue such as "variable is not defined" was flagged, the subagent's job would be to validate that is actually true in the code. Another example would be CLAUDE.md issues. The agent should validate that the CLAUDE.md rule that was violated is scoped for this file and is actually violated. Use Opus subagents for bugs and logic issues, and sonnet agents for CLAUDE.md violations.

6. Filter out any issues that were not validated in step 5. This step will give us our list of high signal issues for our review.
```

**File:** CHANGELOG.md (L30-30)
```markdown
- Fixed messages from other agents (such as a subagent's SendMessage) that arrived mid-turn showing up below the "Ran N shell commands" row instead of where they arrived
```

## Q2（Codex）

`update_plan` 工具是否有自动化逻辑来检测计划中的漏项、重复步骤或无法执行的步骤？

## 答案

根据现有代码上下文,`update_plan` 工具本身**没有**自动化的逻辑来检测计划中的漏项、重复步骤或无法执行的步骤。目前所见到的相关内容仅是系统提示词(prompt)中对模型的行为指导,而非代码层面的校验机制。

---

### 详细说明

### `update_plan` 工具的定位

在 `codex-rs/core/gpt_5_1_prompt.md` 和 `codex-rs/core/gpt_5_2_prompt.md` 中,`update_plan` 被描述为一个"跟踪步骤和进度并渲染给用户"的工具 [1](#0-0) 。这些指导明确说明了什么是"高质量"计划 vs "低质量"计划,并给出了对比示例 [2](#0-1) 。

### 状态管理规则,而非结构校验

Prompt 中对计划状态转换有严格规则:同一时间只能有一个 `in_progress` 项,不能从 `pending` 直接跳到 `completed`,不能批量完成多个项目 [3](#0-2) 。此外,当理解发生变化时(拆分/合并/重排步骤),要求更新计划 [3](#0-2) 。这属于**流程约束**,依赖模型自身遵守,并不是代码层面对计划内容(是否有漏项、重复、不可执行步骤)的自动检测或校验。

### 无自动化检测逻辑的证据

在两份 prompt 文件(`gpt_5_1_prompt.md` 与 `gpt_5_2_prompt.md`,两者内容几乎一致)中,均只强调计划应"break the task into meaningful, logically ordered steps that are easy to verify" [4](#0-3) ,以及不要为简单任务写计划、不要包含自己做不到的事情 [5](#0-4) 。这些都是**对模型自身生成行为的软性约束**,依靠模型的推理能力来自我判断计划质量,而不是有独立的验证器/解析器对计划结构进行漏项检测、重复检测或可执行性检测。

### 与 app-server 的 `turn/plan/updated` 事件的区分

在无关的 app-server 协议文档中,有一个 `turn/plan/updated` 通知,携带 `plan` 条目 `{step, status}`(`pending`/`inProgress`/`completed`) [6](#0-5) 。这只是把计划数据结构透传给客户端展示的通知机制,同样没有做漏项/重复/可执行性的校验逻辑,它只是把 agent 自身维护的计划状态广播出去。

## Notes

- 从索引到的内容来看,代码库中并未包含对"计划"(plan)结构做静态分析、语义校验、或步骤可执行性检查的独立模块或函数。若这类校验逻辑存在于其他未被索引到的文件中(索引存在大小限制),建议启动一个 Devin session 以获取完整文件内容进行确认。
- 若你想问的是关于生成计划的评审/校验能力(例如是否有单独的 review agent 或 linter 对 plan 做审计),目前提供的上下文中没有找到相关实现;这属于本次索引未覆盖或代码库中确实不存在的功能。

Wiki pages you might want to explore:
- [App Server and IDE Integration (openai/codex)](/wiki/openai/codex#4.5)

### Citations

**File:** codex-rs/core/gpt_5_1_prompt.md (L63-65)
```markdown
## Planning

You have access to an `update_plan` tool which tracks steps and progress and renders them to the user. Using the tool helps demonstrate that you've understood the task and convey how you're approaching it. Plans can help to make complex, ambiguous, or multi-phase work clearer and more collaborative for the user. A good plan should break the task into meaningful, logically ordered steps that are easy to verify as you go.
```

**File:** codex-rs/core/gpt_5_1_prompt.md (L73-73)
```markdown
Maintain statuses in the tool: exactly one item in_progress at a time; mark items complete when done; post timely status transitions. Do not jump an item from pending to completed: always set it to in_progress first. Do not batch-complete multiple items after the fact. Finish with all items completed or explicitly canceled/deferred before ending the turn. Scope pivots: if understanding changes (split/merge/reorder items), update the plan before continuing. Do not let the plan go stale while coding.
```

**File:** codex-rs/core/gpt_5_1_prompt.md (L85-134)
```markdown
### Examples

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

If you need to write a plan, only write high quality plans, not low quality ones.
```

**File:** codex-rs/core/gpt_5_2_prompt.md (L38-38)
```markdown
You have access to an `update_plan` tool which tracks steps and progress and renders them to the user. Using the tool helps demonstrate that you've understood the task and convey how you're approaching it. Plans can help to make complex, ambiguous, or multi-phase work clearer and more collaborative for the user. A good plan should break the task into meaningful, logically ordered steps that are easy to verify as you go.
```

**File:** codex-rs/core/gpt_5_2_prompt.md (L40-40)
```markdown
Note that plans are not for padding out simple work with filler steps or stating the obvious. The content of your plan should not involve doing anything that you aren't capable of doing (i.e. don't try to test things that you can't test). Do not use plans for simple or single-step queries that you can just do or answer immediately.
```

**File:** codex-rs/app-server/README.md (L1876-1876)
```markdown
- `turn/plan/updated` — `{ turnId, explanation?, plan }` whenever the agent shares or changes its plan; each `plan` entry is `{ step, status }` with `status` in `pending`, `inProgress`, or `completed`.
```

## Q3（Crush）

Crush 代码库中是否有专门的程序化逻辑用于自动检测模型生成的计划是否存在漏项、重复步骤或无法执行的步骤？

## 答案

根据现有代码上下文，Crush 代码库中**没有专门的程序化逻辑**用于自动检测模型生成的计划是否存在漏项、重复步骤或无法执行的步骤。相关的"计划质量保证"更多是通过**提示词层面的自我核查指令**（依赖模型自身）和**运行时的工具调用循环检测**（针对重复工具调用，而非计划步骤本身）实现的。

---

## 详细说明

### 1. 提示词层面：依赖模型自我核查

`coder.md.tpl` 模板中的 `<task_completion>` 部分要求模型在执行前后自行核对需求是否完整，例如识别所有需要变更的组件、逐条核对多部分请求的清单项 [1](#0-0) 。这属于对 LLM 的行为指导（prompt engineering），并非代码中的自动校验逻辑，因此无法保证真正检测出漏项。

`<workflow>` 部分同样要求模型在"finishing"前交叉核对原始需求与自己的心智清单 [2](#0-1) 。

### 2. Plan 模式（Plan Mode）：仅负责流程切换，不校验内容

Crush 的 UI 有专门的 "plan mode"（`uiInputModePlan`），当计划生成完毕并检测到 `CRUSH_PLAN_READY` 标记时，`handlePlanHandoff` 会打开一个交接对话框，让用户确认或要求修改 [3](#0-2) 。这个流程只是识别计划"是否生成完毕"（通过标记字符串 `common.PlanReadyMarkerPresent`），并不解析计划内容来判断是否有遗漏或重复步骤 [4](#0-3) 。

用户如果认为计划有问题，只能通过 `OnRequestChanges` 手动反馈文字，让模型重新生成，而不是系统自动指出问题 [5](#0-4) 。

### 3. 运行时循环检测：仅针对"重复工具调用"，不是"计划步骤重复"

在 Agent 执行循环中，存在 `hasRepeatedToolCalls` 检测机制，作为 `StopCondition` 用于阻止 Agent 陷入死循环，防止执行同一工具调用超过阈值次数 [6](#0-5) 。测试文件展示了其判定逻辑：例如窗口内重复次数超过 `maxRepeats` 才会判定为循环 [7](#0-6) ，以及不同模式交替出现时不会被误判为循环 [8](#0-7) 。

**注意**：这个机制作用于**已执行的工具调用步骤**（`fantasy.StepResult`），是运行时防止死循环的安全阀，而不是对"模型预先生成的计划文本"做静态分析，因此不能直接回答"计划是否有重复步骤"这个问题。

### 4. Summary 模板：侧重记录进度，非计划校验

`summary.md` 模板用于对话摘要，要求列出"当前进度"、"待完成事项"等，帮助后续继续任务 [9](#0-8) ，同样是提示词指导，不涉及自动检测计划缺陷。

## Notes

- 综上，目前代码库中**不存在**一个独立的"计划验证器"（plan validator）模块，能够结构化地分析计划文本、识别漏项/重复/不可执行步骤。所有相关保障都依赖 LLM 在提示词指导下的自我核查，或运行时对工具调用循环的检测。
- 如果你是想了解某个具体的、可能存在于其他未被索引到的文件里的"计划校验"功能，建议启动一个 Devin session 以获取完整代码库内容进行确认，因为索引存在大小限制，可能有相关文件未被收录。
- `hasRepeatedToolCalls` 和 plan mode（`PlanHandoffInline`）是两个不同的系统：前者属于 Agent 执行循环的安全机制，后者属于 TUI 的计划-代码模式切换流程，两者没有直接调用关系，仅在概念上都与"计划/循环"有关，容易混淆，请注意区分。

Wiki pages you might want to explore:
- [TUI Architecture (charmbracelet/crush)](/wiki/charmbracelet/crush#5.1)
- [Glossary (charmbracelet/crush)](/wiki/charmbracelet/crush#9)

### Citations

**File:** internal/agent/templates/coder.md.tpl (L82-97)
```text
**Before finishing**:
- Verify ENTIRE query is resolved (not just first step)
- All described next steps must be completed
- Cross-check the original prompt and your own mental checklist; if any feasible part remains undone, continue working instead of responding.
- Run lint/typecheck if in memory
- Verify all changes work
- Keep response under 4 lines

**Key behaviors**:
- Use find_references before changing shared code
- Follow existing patterns (check similar files)
- If stuck, try different approach (don't repeat failures)
- Make decisions yourself (search first, don't ask)
- Fix problems at root cause, not surface-level patches
- Don't fix unrelated bugs or broken tests (mention them in final message if relevant)
</workflow>
```

**File:** internal/agent/templates/coder.md.tpl (L217-238)
```text
<task_completion>
Ensure every task is implemented completely, not partially or sketched.

1. **Think before acting** (for non-trivial tasks)
   - Identify all components that need changes (models, logic, routes, config, tests, docs)
   - Consider edge cases and error paths upfront
   - Form a mental checklist of requirements before making the first edit
   - This planning happens internally - don't narrate it to the user

2. **Implement end-to-end**
   - Treat every request as complete work: if adding a feature, wire it fully
   - Update all affected files (callers, configs, tests, docs)
   - Don't leave TODOs or "you'll also need to..." - do it yourself
   - No task is too large - break it down and complete all parts
   - For multi-part prompts, treat each bullet/question as a checklist item and ensure every item is implemented or answered. Partial completion is not an acceptable final state.

3. **Verify before finishing**
   - Re-read the original request and verify each requirement is met
   - Check for missing error handling, edge cases, or unwired code
   - Run tests to confirm the implementation works
   - Only say "Done" when truly done - never stop mid-task
</task_completion>
```

**File:** internal/ui/model/ui.go (L5158-5180)
```go
// handlePlanHandoff checks whether a completed run in plan mode contained the
// plan-ready sentinel marker and, if so, opens the plan handoff dialog.
func (m *UI) handlePlanHandoff(rc notify.RunComplete) tea.Cmd {
	if m.mode != uiInputModePlan {
		return nil
	}
	if rc.Error != "" || rc.Cancelled {
		return nil
	}
	if m.session == nil || rc.SessionID != m.session.ID {
		return nil
	}
	if !common.PlanReadyMarkerPresent(rc.Text) {
		slog.Debug("Plan run completed without ready marker", "session_id", rc.SessionID)
		return nil
	}
	m.setPlanReadyPending(rc.SessionID)
	if _, ok := m.activeInline.(*dialog.PlanHandoffInline); ok {
		return nil
	}
	m.openPlanHandoff()
	return nil
}
```

**File:** internal/ui/model/ui.go (L5231-5233)
```go
	inline.OnRequestChanges = func(feedback string) tea.Cmd {
		return m.sendMessage(feedback)
	}
```

**File:** internal/ui/common/common.go (L23-30)
```go
// PlanStartMarker is the sentinel the plan agent emits on its own line at the
// very start of its final response, so the UI can tell the plan document
// apart from the agent's intermediate exploratory replies while it streams.
const PlanStartMarker = "<!-- CRUSH_PLAN_START -->"

// PlanReadyMarker is the sentinel the plan agent emits on its own line at the
// end of its final response to signal that the plan is ready for execution.
const PlanReadyMarker = "<!-- CRUSH_PLAN_READY -->"
```

**File:** internal/agent/agent.go (L1062-1064)
```go
			func(steps []fantasy.StepResult) bool {
				return hasRepeatedToolCalls(steps, loopDetectionWindowSize, loopDetectionMaxRepeats)
			},
```

**File:** internal/agent/loop_detection_test.go (L95-108)
```go
	t.Run("loop detected", func(t *testing.T) {
		// 6 identical steps in a window of 10 with maxRepeats=5 → detected
		steps := make([]fantasy.StepResult, 10)
		for i := range 6 {
			steps[i] = makeToolStep("read", `{"file":"a.go"}`, "content")
		}
		for i := 6; i < 10; i++ {
			steps[i] = makeToolStep("tool", fmt.Sprintf(`{"i":%d}`, i), fmt.Sprintf("result-%d", i))
		}
		result := hasRepeatedToolCalls(steps, 10, 5)
		if !result {
			t.Error("expected true when same signature appears more than maxRepeats times")
		}
	})
```

**File:** internal/agent/loop_detection_test.go (L128-142)
```go
	t.Run("multiple different patterns alternating", func(t *testing.T) {
		// Two patterns alternating: each appears 5 times — not above threshold
		steps := make([]fantasy.StepResult, 10)
		for i := range steps {
			if i%2 == 0 {
				steps[i] = makeToolStep("read", `{"file":"a.go"}`, "content-a")
			} else {
				steps[i] = makeToolStep("write", `{"file":"b.go"}`, "content-b")
			}
		}
		result := hasRepeatedToolCalls(steps, 10, 5)
		if result {
			t.Error("expected false: two patterns each appearing 5 times (not > 5)")
		}
	})
```

**File:** internal/agent/templates/summary.md (L1-20)
```markdown
You are summarizing a conversation to preserve context for continuing work later.

**Critical**: This summary will be the ONLY context available when the conversation resumes. Assume all previous messages will be lost. Be thorough.

**Required sections**:

## Current State

- What task is being worked on (exact user request)
- Current progress and what's been completed
- What's being worked on right now (incomplete work)
- What remains to be done (specific next steps, not vague)

## Files & Changes

- Files that were modified (with brief description of changes)
- Files that were read/analyzed (why they're relevant)
- Key files not yet touched but will need changes
- File paths and line numbers for important code locations
```
