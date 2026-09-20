# DeepWiki Q&A with Code Context for Repository: charmbracelet/crush

> Source: DeepWiki Q&A with Code Context for Repository: charmbracelet/crush
> Collected: 2026-09-20
> Published: Unknown

## Q1

怎样定义子任务的输入、输出、依赖和完成条件，让计划能够真正执行？

## 答案

在 charmbracelet/crush 代码库中，目前没有看到一个专门的"子任务(input/output/dependencies/完成条件)"结构化定义系统。与"计划执行"相关的功能主要体现在两个机制上：**Plan Mode 的完成标记** 和 **`todos` 任务清单跟踪**，但它们并不包含正式的输入/输出/依赖字段。

---

### 1. Plan 模式：完成条件通过 Sentinel Marker 判定

计划智能体（plan agent）在最终回复的开头和结尾会输出特殊标记，用来告诉 UI 计划何时"就绪可执行"：

- `PlanStartMarker`（`<!-- CRUSH_PLAN_START -->`）标记计划文档正式开始 crush:23-26
- `PlanReadyMarker`（`<!-- CRUSH_PLAN_READY -->`）标记计划已经准备好可以交接执行 crush:28-30

当一次 run 完成时，`handlePlanHandoff` 会检查响应文本中是否包含 ready marker，如果有则记录 `planReadySessionID` 并弹出交接对话框： crush:5158-5180

用户确认后，`openPlanHandoff` 会将输入模式从 plan 切回 code，并触发"Implement the plan"隐藏提示词，真正开始执行： crush:5210-5241

这套机制是通过一个二元的"ready / not ready"标记来判定完成条件的，并不是对每个子任务定义独立的输入/输出/依赖。

### 2. `todos` 工具：子任务的状态跟踪（无依赖/输入输出字段）

会话中的任务分解体现为 `session.Todo`，每个 todo 有 `Status`（如 `TodoStatusCompleted`、`TodoStatusInProgress`）、`Content`、`ActiveForm`，UI 通过 `todoPill` 渲染进度： crush:64-106

会话总结时也会把 todo 列表和状态写入 prompt，要求继续使用 `todos` 工具跟踪进度： crush:2287-2300

这里的 `Todo` 只有内容和状态两个维度，**没有**显式的 input/output/dependencies 字段。

### 3. Sub-Agent 委派：唯一的"输入"是自然语言 Prompt

如果你说的"子任务"指的是主 Agent 委派给子 Agent 执行的任务（`agent` 工具），其输入仅是一个自由文本 `Prompt` 字段，没有结构化的 schema： crush:18-24

调用时校验 `Prompt` 非空、从 context 拿到 `sessionID`/`agentMessageID`，然后通过 `runSubAgent` 启动子会话，其"输出"就是子 Agent 的最终响应，"完成条件"隐含在 LLM 自身判断任务结束（无显式依赖图）： crush:26-67

### 4. Coder Agent 提示词中的任务分解指导（软性约束）

在 coder 系统提示词模板里，有对"任务完成"的软性规范（如"先思考再行动"、"验证每个需求已满足"等），但这是给 LLM 的行为准则，而非代码里强制的 schema： crush:217-238

---

## Notes

- 目前索引到的代码库中**没有**发现你提问中描述的"为子任务显式定义 input/output/dependencies/完成条件"这一结构化系统；Crush 当前依赖 (a) plan ready 的 sentinel marker、(b) `todos` 工具的简单状态字段、(c) 自由文本 prompt 委派子 Agent，来实现"计划可执行"，均属于软约束而非强类型 schema。
- 如果你指的是某个具体的 issue/design doc 或尚未合并的功能（例如计划中要新增结构化任务图），当前索引可能未覆盖相关文件；由于索引大小限制，部分文件内容可能未被收录，建议启动一次 Devin session 以获取完整仓库内容进行确认。
- 如果这个问题其实是针对另一个项目/仓库（而非 charmbracelet/crush），请告诉我具体的仓库名，我会重新检索。

Wiki pages you might want to explore:
- [TUI Architecture (charmbracelet/crush)](/wiki/charmbracelet/crush#5.1)
- [Glossary (charmbracelet/crush)](/wiki/charmbracelet/crush#9)

### Citations

**File:** internal/ui/common/common.go (L23-26)
```go
// PlanStartMarker is the sentinel the plan agent emits on its own line at the
// very start of its final response, so the UI can tell the plan document
// apart from the agent's intermediate exploratory replies while it streams.
const PlanStartMarker = "<!-- CRUSH_PLAN_START -->"
```

**File:** internal/ui/common/common.go (L28-30)
```go
// PlanReadyMarker is the sentinel the plan agent emits on its own line at the
// end of its final response to signal that the plan is ready for execution.
const PlanReadyMarker = "<!-- CRUSH_PLAN_READY -->"
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

**File:** internal/ui/model/ui.go (L5210-5241)
```go
// openPlanHandoff replaces the textarea with the inline "switch to code"
// prompt. Dismissing it keeps the pending plan, so the prompt can be reopened
// by pressing enter on an empty editor while still in plan mode.
func (m *UI) openPlanHandoff() {
	inline := dialog.NewPlanHandoffInline(m.com)
	inline.OnConfirm = func(yolo bool) tea.Cmd {
		if m.com.Workspace.PermissionSkipRequests() != yolo {
			m.toggleYoloMode()
		}
		m.setPlanReadyPending("")
		sessionID := m.session.ID
		cmd := m.setInputMode(uiInputModeCode)
		return func() tea.Msg {
			result := cmd()
			if switched, ok := result.(modeSwitchedMsg); ok {
				switched.continueSessionID = sessionID
				return switched
			}
			return result
		}
	}
	inline.OnRequestChanges = func(feedback string) tea.Cmd {
		return m.sendMessage(feedback)
	}
	m.activeInline = inline
	m.textarea.Blur()
	m.focus = uiFocusEditor
	m.activeInline.SetFocused(true)
	if m.status != nil {
		m.updateLayoutAndSize()
	}
}
```

**File:** internal/ui/model/pills.go (L64-106)
```go
// todoPill renders the todo progress pill with optional spinner and task name.
func todoPill(todos []session.Todo, spinnerView string, panelFocused bool, t *styles.Styles) string {
	if !hasIncompleteTodos(todos) {
		return ""
	}

	completed := 0
	var currentTodo *session.Todo
	for i := range todos {
		switch todos[i].Status {
		case session.TodoStatusCompleted:
			completed++
		case session.TodoStatusInProgress:
			if currentTodo == nil {
				currentTodo = &todos[i]
			}
		}
	}

	total := len(todos)

	label := t.Pills.TodoLabel.Render("To-Do")
	progress := t.Pills.TodoProgress.Render(fmt.Sprintf("%d/%d", completed, total))

	var content string
	if panelFocused {
		content = fmt.Sprintf("%s %s", label, progress)
	} else if currentTodo != nil {
		taskText := currentTodo.Content
		if currentTodo.ActiveForm != "" {
			taskText = currentTodo.ActiveForm
		}
		if ansi.StringWidth(taskText) > maxTaskDisplayLength {
			taskText = ansi.Truncate(taskText, maxTaskDisplayLength-1, "…")
		}
		task := t.Pills.TodoCurrentTask.Render(taskText)
		content = fmt.Sprintf("%s %s %s  %s", spinnerView, label, progress, task)
	} else {
		content = fmt.Sprintf("%s %s", label, progress)
	}

	return t.Pills.Focused.Render(content)
}
```

**File:** internal/agent/agent.go (L2287-2300)
```go
// buildSummaryPrompt constructs the prompt text for session summarization.
func buildSummaryPrompt(todos []session.Todo) string {
	var sb strings.Builder
	sb.WriteString("Provide a detailed summary of our conversation above.")
	if len(todos) > 0 {
		sb.WriteString("\n\n## Current Todo List\n\n")
		for _, t := range todos {
			fmt.Fprintf(&sb, "- [%s] %s\n", t.Status, t.Content)
		}
		sb.WriteString("\nInclude these tasks and their statuses in your summary. ")
		sb.WriteString("Instruct the resuming assistant to use the `todos` tool to continue tracking progress on these tasks.")
	}
	return sb.String()
}
```

**File:** internal/agent/agent_tool.go (L18-24)
```go
type AgentParams struct {
	Prompt string `json:"prompt" description:"The task for the agent to perform"`
}

const (
	AgentToolName = "agent"
)
```

**File:** internal/agent/agent_tool.go (L26-67)
```go
func (c *coordinator) agentTool(ctx context.Context) (fantasy.AgentTool, error) {
	agentCfg, ok := c.cfg.Config().Agents[config.AgentTask]
	if !ok {
		return nil, errors.New("task agent not configured")
	}
	prompt, err := taskPrompt(prompt.WithWorkingDir(c.cfg.WorkingDir()))
	if err != nil {
		return nil, err
	}

	agent, err := c.buildAgent(ctx, prompt, agentCfg, true)
	if err != nil {
		return nil, err
	}
	return fantasy.NewParallelAgentTool(
		AgentToolName,
		agentToolDescription,
		func(ctx context.Context, params AgentParams, call fantasy.ToolCall) (fantasy.ToolResponse, error) {
			if params.Prompt == "" {
				return fantasy.NewTextErrorResponse("prompt is required"), nil
			}

			sessionID := tools.GetSessionFromContext(ctx)
			if sessionID == "" {
				return fantasy.ToolResponse{}, errors.New("session id missing from context")
			}

			agentMessageID := tools.GetMessageFromContext(ctx)
			if agentMessageID == "" {
				return fantasy.ToolResponse{}, errors.New("agent message id missing from context")
			}

			return c.runSubAgent(ctx, subAgentParams{
				Agent:          agent,
				SessionID:      sessionID,
				AgentMessageID: agentMessageID,
				ToolCallID:     call.ID,
				Prompt:         params.Prompt,
				SessionTitle:   "New Agent Session",
			})
		},
	), nil
}
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

## Q2

拆分子任务有哪些形式？拆成小步骤，还是拆成多个 agent

## 答案

Crush 中确实存在两种不同的"拆分子任务"形式，二者是互补而非互斥的：

1. **拆成小步骤** —— 通过 `todos` 工具在同一个 Agent 会话内维护一份任务清单（`session.Todo`），每项有 `Status`（pending/in_progress/completed），供同一个 Agent 顺序执行、跟踪进度 crush:64-84 。
2. **拆成多个 Agent** —— 通过 `agent` 工具把整段任务委派给独立的子 Agent（`AgentTask`），在单独的子会话中运行，返回结果后再交还给主 Agent crush:26-67 。

---

## 详细说明

### 形式一：小步骤拆分（`todos` 工具，同一 Agent 内）

`todoPill` 根据 `session.Todo` 的 `Status` 统计已完成/进行中的子步骤数量，并在 UI 上渲染进度条 crush:64-106 。这些 todo 项没有依赖图，仅是线性的状态追踪，由同一个 Agent（比如 coder）自己维护、逐项执行。

会话总结（summarize）时，`buildSummaryPrompt` 会把当前 todo 列表和状态写入 prompt，并指示"继续使用 `todos` 工具跟踪进度"，说明这种拆分是持续贯穿整个会话生命周期的 crush:2287-2300 。

Coder Agent 的系统提示词也明确要求："No task is too large - break it down and complete all parts"，即遇到复杂任务时应在内部（不对用户旁白）拆解成检查清单逐一完成 crush:217-238 。这属于**同一个 Agent 内部**的步骤化分解，不涉及多 Agent 协作。

### 形式二：拆成多个 Agent（sub-agent 委派）

Crush 提供了三种典型的多 Agent 委派场景，均通过 `coordinator.runSubAgent` 统一实现：

| 委派工具 | 用途 | 子 Agent 类型 |
|---|---|---|
| `agent` 工具 | 通用检索/实现子任务 | `AgentTask`（只读工具集） crush:26-42  |
| `agentic_fetch` 工具 | 网络抓取分析子任务 | 使用小模型的专用子 Agent crush:181-203  |
| Plan 模式 | 生成实施计划 | `AgentPlan`，只读+可再调用 `agent` 工具 crush:973-989  |

这些委派的核心都调用 `runSubAgent`：为子任务创建独立的子会话（`CreateTaskSession`），运行子 Agent，再将耗时/成本回写父会话，最后把子 Agent 的文本输出作为工具响应返回给主 Agent crush:1605-1648 。子任务的"完成"就是子 Agent Run 结束并产生非空文本输出，否则返回错误响应 crush:1673-1678 。

`AgentParams` 说明这种委派唯一结构化的"输入"字段就是自由文本 `Prompt`，没有显式的依赖/输出 schema，子任务的"依赖关系"由父 Agent 在调用顺序上隐式控制（例如先调用 `agent` 检索上下文，再据此生成代码） crush:18-24 。

`SetupAgents` 中还能看到每种 Agent 被赋予不同的工具权限（`AgentCoder` 全量、`AgentTask` 只读、`AgentPlan` 只读+`agent`），这决定了拆分到子 Agent 后各自能做什么，从而间接约束了"子任务的边界" crush:1003-1038 。

### 两种形式的关系

两者可以嵌套组合：Coder Agent 在自己内部用 `todos` 做步骤化跟踪，遇到需要独立探索/隔离上下文的子任务时，再通过 `agent` 工具委派给子 Agent；子 Agent 内部同样可以自己维护 todo（因为子 Agent 也带有 `todos` 工具，见 `buildTools` 中统一挂载） crush:839-857 。

## Notes

- 目前代码库中没有看到显式的"多 Agent 任务依赖图"调度器；`agent`/`agentic_fetch` 的委派是一次性、单向、无回调依赖的（父等待子完成后拿到文本结果）。
- Hooks 目前默认不拦截子 Agent 内部的工具调用，仅对顶层调用生效，这点在 `docs/hooks/FUTURE.md` 中被记录为已知限制/未来计划 crush:81-93 ，与本问题关系不大，仅供参考。

Wiki pages you might want to explore:
- [Glossary (charmbracelet/crush)](/wiki/charmbracelet/crush#9)

### Citations

**File:** internal/agent/agent_tool.go (L18-24)
```go
type AgentParams struct {
	Prompt string `json:"prompt" description:"The task for the agent to perform"`
}

const (
	AgentToolName = "agent"
)
```

**File:** internal/agent/agent_tool.go (L26-67)
```go
func (c *coordinator) agentTool(ctx context.Context) (fantasy.AgentTool, error) {
	agentCfg, ok := c.cfg.Config().Agents[config.AgentTask]
	if !ok {
		return nil, errors.New("task agent not configured")
	}
	prompt, err := taskPrompt(prompt.WithWorkingDir(c.cfg.WorkingDir()))
	if err != nil {
		return nil, err
	}

	agent, err := c.buildAgent(ctx, prompt, agentCfg, true)
	if err != nil {
		return nil, err
	}
	return fantasy.NewParallelAgentTool(
		AgentToolName,
		agentToolDescription,
		func(ctx context.Context, params AgentParams, call fantasy.ToolCall) (fantasy.ToolResponse, error) {
			if params.Prompt == "" {
				return fantasy.NewTextErrorResponse("prompt is required"), nil
			}

			sessionID := tools.GetSessionFromContext(ctx)
			if sessionID == "" {
				return fantasy.ToolResponse{}, errors.New("session id missing from context")
			}

			agentMessageID := tools.GetMessageFromContext(ctx)
			if agentMessageID == "" {
				return fantasy.ToolResponse{}, errors.New("agent message id missing from context")
			}

			return c.runSubAgent(ctx, subAgentParams{
				Agent:          agent,
				SessionID:      sessionID,
				AgentMessageID: agentMessageID,
				ToolCallID:     call.ID,
				Prompt:         params.Prompt,
				SessionTitle:   "New Agent Session",
			})
		},
	), nil
}
```

**File:** internal/agent/agent.go (L2287-2300)
```go
// buildSummaryPrompt constructs the prompt text for session summarization.
func buildSummaryPrompt(todos []session.Todo) string {
	var sb strings.Builder
	sb.WriteString("Provide a detailed summary of our conversation above.")
	if len(todos) > 0 {
		sb.WriteString("\n\n## Current Todo List\n\n")
		for _, t := range todos {
			fmt.Fprintf(&sb, "- [%s] %s\n", t.Status, t.Content)
		}
		sb.WriteString("\nInclude these tasks and their statuses in your summary. ")
		sb.WriteString("Instruct the resuming assistant to use the `todos` tool to continue tracking progress on these tasks.")
	}
	return sb.String()
}
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

**File:** internal/agent/agentic_fetch_tool.go (L181-203)
```go
			agent := NewSessionAgent(SessionAgentOptions{
				LargeModel:           small, // Use small model for both (fetch doesn't need large)
				SmallModel:           small,
				SystemPromptPrefix:   smallProviderCfg.SystemPromptPrefix,
				SystemPrompt:         systemPrompt,
				DisableAutoSummarize: c.cfg.Config().Options.DisableAutoSummarize,
				IsYolo:               c.permissions.SkipRequests(),
				Sessions:             c.sessions,
				Messages:             c.messages,
				Tools:                fetchTools,
			})

			return c.runSubAgent(ctx, subAgentParams{
				Agent:          agent,
				SessionID:      validationResult.SessionID,
				AgentMessageID: validationResult.AgentMessageID,
				ToolCallID:     call.ID,
				Prompt:         fullPrompt,
				SessionTitle:   "Fetch Analysis",
				SessionSetup: func(sessionID string) {
					c.permissions.AutoApproveSession(sessionID)
				},
			})
```

**File:** internal/config/config.go (L973-989)
```go
func resolvePlanTools(tools []string) []string {
	// The read-only LSP lookups mirror the task agent's tool set: planning
	// needs symbol navigation just as much as research does.
	planTools := []string{
		"agent",
		"glob",
		"grep",
		"ls",
		"lsp_call_hierarchy",
		"lsp_definition",
		"lsp_symbols",
		"question",
		"sourcegraph",
		"view",
	}
	return filterSlice(tools, planTools, true)
}
```

**File:** internal/config/config.go (L1003-1038)
```go
func (c *Config) SetupAgents() {
	allowedTools := resolveAllowedTools(allToolNames(), c.Options.DisabledTools)

	agents := map[string]Agent{
		AgentCoder: {
			ID:           AgentCoder,
			Name:         "Coder",
			Description:  "An agent that helps with executing coding tasks.",
			Model:        SelectedModelTypeLarge,
			ContextPaths: c.Options.ContextPaths,
			AllowedTools: allowedTools,
		},

		AgentTask: {
			ID:           AgentTask,
			Name:         "Task",
			Description:  "An agent that helps with searching for context and finding implementation details.",
			Model:        SelectedModelTypeLarge,
			ContextPaths: c.Options.ContextPaths,
			AllowedTools: resolveReadOnlyTools(allowedTools),
			// NO MCPs or LSPs by default
			AllowedMCP: map[string][]string{},
		},

		AgentPlan: {
			ID:           AgentPlan,
			Name:         "Plan",
			Description:  "An agent that performs deep analysis and prepares implementation plans without modifying files.",
			Model:        SelectedModelTypeLarge,
			ContextPaths: c.Options.ContextPaths,
			AllowedTools: resolvePlanTools(allowedTools),
			// NO MCPs or LSPs by default
			AllowedMCP: map[string][]string{},
		},
	}
	c.Agents = agents
```

**File:** internal/agent/coordinator.go (L839-857)
```go
	allTools = append(
		allTools,
		tools.NewBashTool(c.permissions, c.cfg.WorkingDir(), c.cfg.Config().Options.Attribution, modelID),
		tools.NewCrushInfoTool(c.cfg, c.lspManager, c.allSkills, c.activeSkills, c.skillTracker),
		tools.NewCrushLogsTool(logFile),
		tools.NewJobOutputTool(),
		tools.NewJobKillTool(),
		tools.NewDownloadTool(c.permissions, c.cfg.WorkingDir(), nil),
		tools.NewEditTool(c.lspManager, c.permissions, c.history, c.filetracker, c.cfg.WorkingDir()),
		tools.NewMultiEditTool(c.lspManager, c.permissions, c.history, c.filetracker, c.cfg.WorkingDir()),
		tools.NewFetchTool(c.permissions, c.cfg.WorkingDir(), nil),
		tools.NewGlobTool(c.cfg.WorkingDir(), c.cfg.Config().Tools.Glob),
		tools.NewGrepTool(c.cfg.WorkingDir(), c.cfg.Config().Tools.Grep),
		tools.NewLsTool(c.permissions, c.cfg.WorkingDir(), c.cfg.Config().Tools.Ls),
		tools.NewSourcegraphTool(nil),
		tools.NewTodosTool(c.sessions),
		tools.NewViewTool(c.lspManager, c.permissions, c.filetracker, c.skillTracker, c.cfg.WorkingDir(), c.cfg.Config().Options.SkillsPaths...),
		tools.NewWriteTool(c.lspManager, c.permissions, c.history, c.filetracker, c.cfg.WorkingDir()),
	)
```

**File:** internal/agent/coordinator.go (L1605-1648)
```go
// runSubAgent runs a sub-agent and handles session management and cost accumulation.
// It creates a sub-session, runs the agent with the given prompt, and propagates
// the cost to the parent session.
func (c *coordinator) runSubAgent(ctx context.Context, params subAgentParams) (fantasy.ToolResponse, error) {
	// Create sub-session
	agentToolSessionID := c.sessions.CreateAgentToolSessionID(params.AgentMessageID, params.ToolCallID)
	session, err := c.sessions.CreateTaskSession(ctx, agentToolSessionID, params.SessionID, params.SessionTitle)
	if err != nil {
		return fantasy.ToolResponse{}, fmt.Errorf("create session: %w", err)
	}

	// Call session setup function if provided
	if params.SessionSetup != nil {
		params.SessionSetup(session.ID)
	}

	// Get model configuration
	model := params.Agent.Model()
	maxTokens := model.CatwalkCfg.DefaultMaxTokens
	if model.ModelCfg.MaxTokens != 0 {
		maxTokens = model.ModelCfg.MaxTokens
	}

	providerCfg, ok := c.cfg.Config().Providers.Get(model.ModelCfg.Provider)
	if !ok {
		return fantasy.ToolResponse{}, errModelProviderNotConfigured
	}

	// Run the agent
	run := func() (*fantasy.AgentResult, error) {
		return params.Agent.Run(ctx, SessionAgentCall{
			SessionID:        session.ID,
			Prompt:           params.Prompt,
			MaxOutputTokens:  maxTokens,
			ProviderOptions:  getProviderOptions(model, providerCfg),
			Temperature:      model.ModelCfg.Temperature,
			TopP:             model.ModelCfg.TopP,
			TopK:             callTopK(providerCfg, model.ModelCfg.TopK),
			FrequencyPenalty: model.ModelCfg.FrequencyPenalty,
			PresencePenalty:  model.ModelCfg.PresencePenalty,
			NonInteractive:   true,
			OnAuthRefresh:    c.makeAuthRefreshCallback(providerCfg),
		})
	}
```

**File:** internal/agent/coordinator.go (L1673-1678)
```go
	output := subAgentOutput(result)
	if output == "" {
		return fantasy.NewTextErrorResponse("Sub-agent completed but produced no text output."), nil
	}
	return fantasy.NewTextResponse(output), nil
}
```

**File:** docs/hooks/FUTURE.md (L81-93)
```markdown
## Sub-agent opt-in

**Status:** not implemented.

### Background

Today hooks fire **only** on the top-level agent's tool calls. Sub-agents
(`agent` task tool, `agentic_fetch`, future delegated loops) run without hook
interception so a single delegated turn doesn't trigger the user's hook N times.

The outer sub-agent tool call itself is hooked, so blanket policy like "never
spawn sub-agents" or "rewrite prompts sent to the task agent" still works from
the coder's side. The sub-agent's inner loop is the part that's exempt.
```

## Q3

那不管哪种形式，都有相同的问题，输入输出内容是怎么约定的，依赖和完成条件是怎么判定的

## 答案

不管是 `todos` 小步骤还是子 Agent 委派，Crush 代码里都**没有**结构化的输入/输出 schema 或依赖图——两者都依赖自由文本和 LLM 自身判断，代码层面只做"有没有内容"这种弱校验。

---

## 详细说明

### 子 Agent 委派：输入/输出/完成条件

**输入**：唯一字段是自由文本 `Prompt`，工具层仅校验非空 crush:18-46 。没有 schema 约定"需要产出哪些字段"，全靠父 Agent 在 prompt 文本里自然语言描述。

**输出**：`runSubAgent` 调用 `params.Agent.Run` 拿到 `*fantasy.AgentResult`，再用 `subAgentOutput(result)` 提取文本，作为 `fantasy.ToolResponse` 返回给父 Agent crush:1633-1648 。输出同样是无结构的纯文本，没有约定格式（比如 JSON schema）。

**完成条件**：代码层面唯一的判定是"输出文本是否为空"——

```
output := subAgentOutput(result)
if output == "" {
    return fantasy.NewTextErrorResponse("Sub-agent completed but produced no text output."), nil
}
return fantasy.NewTextResponse(output), nil
``` crush:1673-1678

也就是说，只要子 Agent 的 LLM 调用返回了非空文本，就视为"完成"；至于内容是否真正满足父任务的要求，代码不做校验，完全交给父 Agent（也是一个 LLM）自己读取子 Agent 的回复文本后判断是否可以继续下一步。测试用例也印证了这一点：nil 或空结果都统一走"produced no text output"的错误分支 crush:176-222 。

**依赖**：代码里没有依赖图/DAG 结构。依赖关系是隐式的——父 Agent 在自己的推理过程中决定"先调用 `agent` 工具做 A，再基于 A 的文本结果调用工具做 B"，这个顺序完全由 LLM 在对话中决定，`runSubAgent` 本身是同步阻塞调用（父 Agent 等待 `run()` 返回后才继续），所以顺序依赖只体现在"父 Agent 何时发起下一次工具调用"这一层，而非配置或代码里声明的依赖关系 crush:1608-1649 。

### `todos` 小步骤：输入/输出/完成条件

`todos` 工具的每一项 `session.Todo` 只有 `Content`（描述）、`ActiveForm`（进行中展示文案）和 `Status`（pending/in_progress/completed）三个字段，没有 input/output 字段 crush:64-84 。

**完成条件**同样没有代码级校验——`Status` 字段的值完全由调用 `todos` 工具的 LLM 自己写入（例如它主观判断某一步做完了，就把状态改成 `completed`），UI 侧的 `todoPill` 和 `TodosToolRenderContext.RenderTool` 只是读取并展示这个状态，不做任何验证 crush:41-67 。

**依赖**：todo 列表是纯线性清单，没有字段表达"todo B 依赖 todo A"，执行顺序仍由 LLM 自己决定先做哪一项。

---

## 结论

| 维度 | 子 Agent 委派 | `todos` 小步骤 |
|---|---|---|
| 输入约定 | 自由文本 `Prompt`，仅校验非空 | 无（`Content`/`ActiveForm` 是描述性文本） |
| 输出约定 | 自由文本响应，仅校验非空 | 无独立输出，状态即结果 |
| 依赖判定 | 无代码依赖图，靠父 Agent 推理顺序 + 同步阻塞调用 | 无依赖字段，靠 LLM 自主排序 |
| 完成条件 | 代码只判断"文本非空" | 代码只读取 LLM 自己写的 `Status` 字符串，不做校验 |

## Notes

- 这印证了此前的结论：Crush 当前架构把"任务分解的语义正确性"完全交给 LLM 自身推理，代码基础设施只提供最基础的管道（会话创建、文本传递、非空校验），没有类型化的任务契约系统。
- 如果你希望的是一个更严格的、带 schema/DAG 的任务编排系统，这在当前代码库中不存在，可能需要作为新功能设计（例如给 `AgentParams` 增加结构化输出 schema，或给 `session.Todo` 加 `DependsOn` 字段）。

Wiki pages you might want to explore:
- [Agent Coordinator (charmbracelet/crush)](/wiki/charmbracelet/crush#4.1)
- [Glossary (charmbracelet/crush)](/wiki/charmbracelet/crush#9)

### Citations

**File:** internal/agent/agent_tool.go (L18-46)
```go
type AgentParams struct {
	Prompt string `json:"prompt" description:"The task for the agent to perform"`
}

const (
	AgentToolName = "agent"
)

func (c *coordinator) agentTool(ctx context.Context) (fantasy.AgentTool, error) {
	agentCfg, ok := c.cfg.Config().Agents[config.AgentTask]
	if !ok {
		return nil, errors.New("task agent not configured")
	}
	prompt, err := taskPrompt(prompt.WithWorkingDir(c.cfg.WorkingDir()))
	if err != nil {
		return nil, err
	}

	agent, err := c.buildAgent(ctx, prompt, agentCfg, true)
	if err != nil {
		return nil, err
	}
	return fantasy.NewParallelAgentTool(
		AgentToolName,
		agentToolDescription,
		func(ctx context.Context, params AgentParams, call fantasy.ToolCall) (fantasy.ToolResponse, error) {
			if params.Prompt == "" {
				return fantasy.NewTextErrorResponse("prompt is required"), nil
			}
```

**File:** internal/agent/coordinator.go (L1608-1649)
```go
func (c *coordinator) runSubAgent(ctx context.Context, params subAgentParams) (fantasy.ToolResponse, error) {
	// Create sub-session
	agentToolSessionID := c.sessions.CreateAgentToolSessionID(params.AgentMessageID, params.ToolCallID)
	session, err := c.sessions.CreateTaskSession(ctx, agentToolSessionID, params.SessionID, params.SessionTitle)
	if err != nil {
		return fantasy.ToolResponse{}, fmt.Errorf("create session: %w", err)
	}

	// Call session setup function if provided
	if params.SessionSetup != nil {
		params.SessionSetup(session.ID)
	}

	// Get model configuration
	model := params.Agent.Model()
	maxTokens := model.CatwalkCfg.DefaultMaxTokens
	if model.ModelCfg.MaxTokens != 0 {
		maxTokens = model.ModelCfg.MaxTokens
	}

	providerCfg, ok := c.cfg.Config().Providers.Get(model.ModelCfg.Provider)
	if !ok {
		return fantasy.ToolResponse{}, errModelProviderNotConfigured
	}

	// Run the agent
	run := func() (*fantasy.AgentResult, error) {
		return params.Agent.Run(ctx, SessionAgentCall{
			SessionID:        session.ID,
			Prompt:           params.Prompt,
			MaxOutputTokens:  maxTokens,
			ProviderOptions:  getProviderOptions(model, providerCfg),
			Temperature:      model.ModelCfg.Temperature,
			TopP:             model.ModelCfg.TopP,
			TopK:             callTopK(providerCfg, model.ModelCfg.TopK),
			FrequencyPenalty: model.ModelCfg.FrequencyPenalty,
			PresencePenalty:  model.ModelCfg.PresencePenalty,
			NonInteractive:   true,
			OnAuthRefresh:    c.makeAuthRefreshCallback(providerCfg),
		})
	}
	result, err := run()
```

**File:** internal/agent/coordinator.go (L1673-1678)
```go
	output := subAgentOutput(result)
	if output == "" {
		return fantasy.NewTextErrorResponse("Sub-agent completed but produced no text output."), nil
	}
	return fantasy.NewTextResponse(output), nil
}
```

**File:** internal/agent/coordinator_test.go (L176-222)
```go
	t.Run("nil result returns error response", func(t *testing.T) {
		env := testEnv(t)
		coord := newTestCoordinator(t, env, providerID, providerCfg)

		parentSession, err := env.sessions.Create(t.Context(), "Parent")
		require.NoError(t, err)

		agent := newMockAgent(providerID, 4096, func(_ context.Context, _ SessionAgentCall) (*fantasy.AgentResult, error) {
			return nil, nil
		})

		resp, err := coord.runSubAgent(t.Context(), subAgentParams{
			Agent:          agent,
			SessionID:      parentSession.ID,
			AgentMessageID: "msg-1",
			ToolCallID:     "call-1",
			Prompt:         "test",
			SessionTitle:   "Test",
		})
		require.NoError(t, err)
		assert.True(t, resp.IsError)
		assert.Equal(t, "Sub-agent completed but produced no text output.", resp.Content)
	})

	t.Run("empty result returns error response", func(t *testing.T) {
		env := testEnv(t)
		coord := newTestCoordinator(t, env, providerID, providerCfg)

		parentSession, err := env.sessions.Create(t.Context(), "Parent")
		require.NoError(t, err)

		agent := newMockAgent(providerID, 4096, func(_ context.Context, _ SessionAgentCall) (*fantasy.AgentResult, error) {
			return &fantasy.AgentResult{}, nil
		})

		resp, err := coord.runSubAgent(t.Context(), subAgentParams{
			Agent:          agent,
			SessionID:      parentSession.ID,
			AgentMessageID: "msg-1",
			ToolCallID:     "call-1",
			Prompt:         "test",
			SessionTitle:   "Test",
		})
		require.NoError(t, err)
		assert.True(t, resp.IsError)
		assert.Equal(t, "Sub-agent completed but produced no text output.", resp.Content)
	})
```

**File:** internal/ui/chat/todos.go (L41-67)
```go
func (t *TodosToolRenderContext) RenderTool(sty *styles.Styles, width int, opts *ToolRenderOpts) string {
	cappedWidth := cappedMessageWidth(width)
	if opts.IsPending() {
		return pendingTool(sty, "To-Do", opts.Anim, opts.Compact)
	}

	var params tools.TodosParams
	var meta tools.TodosResponseMetadata
	var headerText string
	var body string

	// Parse params for pending state (before result is available).
	if err := json.Unmarshal([]byte(opts.ToolCall.Input), &params); err == nil {
		completedCount := 0
		inProgressTask := ""
		for _, todo := range params.Todos {
			if todo.Status == "completed" {
				completedCount++
			}
			if todo.Status == "in_progress" {
				if todo.ActiveForm != "" {
					inProgressTask = todo.ActiveForm
				} else {
					inProgressTask = todo.Content
				}
			}
		}
```
