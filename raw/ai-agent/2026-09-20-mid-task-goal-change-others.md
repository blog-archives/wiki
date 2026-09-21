# DeepWiki Q&A: 任务中途改变目标的处理（Claude Code / Crush）

> Source: DeepWiki Q&A with Code Context（anthropics/claude-code; charmbracelet/crush）
> Collected: 2026-09-20
> Published: Unknown

## Claude Code

### Q 用户在任务进行中途改变目标，处理方式是什么

## 简要回答

根据现有索引到的代码上下文，没有找到一个专门处理"用户在任务进行中途改变目标"的独立系统或函数。但有几条相关的记录，说明 Claude Code 在会话进行中允许接收并响应新的用户消息，而不是必须等当前任务完成：

- 修复记录提到，Claude 有时会忽略用户在其正在执行任务时发送的消息，这条修复表明系统设计上是**支持在任务进行中接收并处理新用户输入**的 claude-code:5648-5648 。
- 在自动模式（auto mode）拒绝某个操作时，系统会要求 Claude 在真正停下来问用户之前，先完成手头无关的工作，这暗示了对"打断"和"继续当前任务"之间的一种权衡逻辑 claude-code:633-633 。

---

## 详细说明

### 与你问题最接近的证据

1. **任务中接收新消息**：`CHANGELOG.md` 中记录了一个修复——"Fixed agents sometimes ignoring user messages sent while actively working on a task" claude-code:5648-5648 。这说明 Claude Code 的 agent 执行循环在处理工具调用等任务时，仍然会监听并处理新到达的用户消息，而不是完全阻塞。

2. **中断与继续的权衡（Auto Mode）**：在自动模式下，如果某个操作被权限规则拒绝，系统提示 Claude "先尝试更安全的方式，并完成无关的工作，再停下来询问用户" claude-code:633-633 ，这从侧面反映了 Claude Code 在设计上倾向于让代理在被打断时，仍试图完成一部分已开始的工作，而不是立即放弃当前上下文。

3. **Feature Development 插件中的用户确认环节**：在 `plugins/feature-dev` 这个多阶段工作流插件中，每个关键阶段（例如 Phase 3 的澄清问题、Phase 4 的架构选择、Phase 5 实现前）都**显式要求等待用户批准**才能继续 claude-code:63-97 。如果用户在这些确认点提出不同的意见或改变了需求，主编排 agent 会依据用户的新反馈调整后续阶段，例如在 Phase 6 质量审查后，"根据用户决定处理问题（现在修复、之后修复或按现状继续）" claude-code:101-109 。这体现了该插件层面对"中途改变方向"的一种应对模式：把流程设计为多个显式的用户确认关卡，用户可以在每个关卡处调整方向。

### 局限性说明

以上是现有索引中能找到的、与"任务中途改变目标"相关性最高的片段，但**没有找到 Claude Code 核心引擎（例如主 agent 循环、`SessionManager` 或工具执行调度器）中专门处理"目标变更"的具体代码逻辑**。更底层的实现细节（例如任务队列如何被中断、正在执行的工具调用是否会被取消）未在索引范围内。

## Notes

- `plugins/feature-dev/commands/feature-dev.md` 是一个具体的、面向"功能开发工作流"插件示例，与 Claude Code 核心引擎处理用户中断的机制可能并非同一套代码，仅作为设计模式参考。
- CHANGELOG 条目是产品变更记录，反映的是"修复了什么问题"，并不等同于底层实现文档，因此只能作为间接证据。

Wiki pages you might want to explore:
- [Agent System & Subagents (anthropics/claude-code)](/wiki/anthropics/claude-code#3.1)

### Citations

**File:** CHANGELOG.md (L633-633)
```markdown
- Improved auto mode denials: the message Claude receives now names the rule that blocked the action and asks Claude to try a safer method and finish unrelated work before stopping to ask you
```

**File:** CHANGELOG.md (L5648-5648)
```markdown
- Fixed agents sometimes ignoring user messages sent while actively working on a task
```

**File:** plugins/feature-dev/commands/feature-dev.md (L63-97)
```markdown
**Actions**:
1. Review the codebase findings and original feature request
2. Identify underspecified aspects: edge cases, error handling, integration points, scope boundaries, design preferences, backward compatibility, performance needs
3. **Present all questions to the user in a clear, organized list**
4. **Wait for answers before proceeding to architecture design**

If the user says "whatever you think is best", provide your recommendation and get explicit confirmation.

---

## Phase 4: Architecture Design

**Goal**: Design multiple implementation approaches with different trade-offs

**Actions**:
1. Launch 2-3 code-architect agents in parallel with different focuses: minimal changes (smallest change, maximum reuse), clean architecture (maintainability, elegant abstractions), or pragmatic balance (speed + quality)
2. Review all approaches and form your opinion on which fits best for this specific task (consider: small fix vs large feature, urgency, complexity, team context)
3. Present to user: brief summary of each approach, trade-offs comparison, **your recommendation with reasoning**, concrete implementation differences
4. **Ask user which approach they prefer**

---

## Phase 5: Implementation

**Goal**: Build the feature

**DO NOT START WITHOUT USER APPROVAL**

**Actions**:
1. Wait for explicit user approval
2. Read all relevant files identified in previous phases
3. Implement following chosen architecture
4. Follow codebase conventions strictly
5. Write clean, well-documented code
6. Update todos as you progress
```

**File:** plugins/feature-dev/commands/feature-dev.md (L101-109)
```markdown
## Phase 6: Quality Review

**Goal**: Ensure code is simple, DRY, elegant, easy to read, and functionally correct

**Actions**:
1. Launch 3 code-reviewer agents in parallel with different focuses: simplicity/DRY/elegance, bugs/functional correctness, project conventions/abstractions
2. Consolidate findings and identify highest severity issues that you recommend fixing
3. **Present findings to user and ask what they want to do** (fix now, fix later, or proceed as-is)
4. Address issues based on user decision
```

## Crush

### Q 用户在任务进行中途改变目标，处理方式是什么

## 答案

当用户在 `SessionAgent` 处理当前任务的过程中发送新的提示（相当于中途改变目标）时，Crush 不会立即打断当前正在执行的流式请求，而是把新的提示**排队**（`messageQueue`），等当前这一步（`PrepareStep`）执行完后再合并进上下文。

---

### 处理流程

1. **排队机制**：新到达的提示会存入 `a.messageQueue`，以 `SessionID` 为 key crush:325-378 。这段逻辑也出现在总结（summarize）逻辑中——如果总结触发时助手还有未完成的工具调用，会把原始提示包装成一条新的提示重新放入队列，等下一轮继续处理。

2. **`PrepareStep` 中消费队列**：在每一步开始前，`PrepareStep` 回调负责处理队列中积压的消息，为它们创建用户消息，然后再进入模型调用。也就是说，用户中途发来的新目标/新指令会作为**追加的用户消息**并入同一个会话历史，而不是取消当前任务。

3. **运行结束后的"交接"逻辑**：当一轮 `Run` 完成后，代码检查是否有排队的消息，如果有就递归调用 `Run` 继续处理下一个排队的提示，从而实现"下一个目标接着跑"的效果 crush:1273-1289 。

4. **取消（Cancel）与目标切换的交互**：如果用户不仅是追加新目标，而是显式取消当前任务（例如按下 Esc），代码里维护了 `cancelMark` 机制，用来判断哪些排队的提示应该被丢弃、哪些应该保留继续执行。判断逻辑是比较 `acceptSeq`（提示到达顺序）与取消发生时记录的 `mark`：排在取消标记之前或等于的提示会被丢弃（并发布已取消的 `RunComplete` 事件），排在取消标记之后的提示会被保留继续执行 crush:1246-1272 。这意味着：
   - 如果用户是在当前任务完成前又发了一条新指令（没有取消），新指令会正常排队，等当前任务结束后自动执行。
   - 如果用户先取消当前任务、再发新指令，旧的排队任务会被清除，只保留取消动作之后到达的新提示。

5. **总结场景下的目标延续**：当会话上下文接近 token 上限触发自动摘要时，如果当时助手还有未完成的工具调用（即任务还没做完），系统会把原始用户请求重新包装成一条提示："The previous session was interrupted because it got too long, the initial user request was: `%s`"，放回队列继续执行，以保证原始目标不会因为摘要而丢失 crush:1200-1214 。

## Notes

- 以上逻辑均在 `internal/agent/agent.go` 的 `sessionAgent.Run` 方法内实现，涉及并发控制的字段包括 `messageQueue`、`cancelMark`、`acceptedRuns` 等。
- `internal/agent/templates/coder.md.tpl` 中的 `<proactiveness>` 部分描述的是**系统提示词**层面对模型行为的指导（例如"当用户提供新信息时立即执行而非停下确认"），这是给 LLM 看的指令文本，并非实际代码逻辑，与上面 `SessionAgent.Run` 的队列/取消机制是两个不同层次的"处理方式"，但可以互相印证：提示词要求模型不要停顿，而代码层面则通过队列机制真正实现了不中断当前流程、顺序处理新目标的效果。

Wiki pages you might want to explore:
- [Streaming and Summarization (charmbracelet/crush)](/wiki/charmbracelet/crush#4.5)

### Citations

**File:** internal/agent/agent.go (L325-378)
```go
// covered by the same mark are serialized on the per-session dispatch
// mutex and read the mark before they Close, so this never clears it out
// from under a covered handle still waiting to enter Run.
func (a *sessionAgent) endAccepted(sessionID string) {
	a.acceptedMu.Lock()
	defer a.acceptedMu.Unlock()
	count, ok := a.acceptedRuns.Get(sessionID)
	if !ok || count <= 1 {
		a.acceptedRuns.Del(sessionID)
		a.cancelMark.Del(sessionID)
		return
	}
	a.acceptedRuns.Set(sessionID, count-1)
}

// sessionMu returns the per-session dispatch mutex, creating it on first
// use. Creation is guarded so concurrent callers always observe the same
// mutex instance for a given session.
func (a *sessionAgent) sessionMu(sessionID string) *sync.Mutex {
	if mu, ok := a.dispatchMu.Get(sessionID); ok {
		return mu
	}
	a.dispatchMuCreate.Lock()
	defer a.dispatchMuCreate.Unlock()
	if mu, ok := a.dispatchMu.Get(sessionID); ok {
		return mu
	}
	mu := &sync.Mutex{}
	a.dispatchMu.Set(sessionID, mu)
	return mu
}

// enqueueCall appends call to the session's message queue. The
// OnComplete hook is stripped: the caller that supplied it (typically
// coordinator.Run) has its own retry/coalesce scope that ends when it
// returns, so by the time the queue drains nobody is left to consume the
// buffered terminal event. The recursive Run falls back to the default
// broker publish, which is what existing subscribers expect for queued
// turns.
func (a *sessionAgent) enqueueCall(call SessionAgentCall) {
	existing, ok := a.messageQueue.Get(call.SessionID)
	if !ok {
		existing = []SessionAgentCall{}
	}
	queued := call
	if call.Accepted != nil {
		// Preserve the accept sequence after the handle is stripped so
		// the queue-drain paths can tell a follow-up queued before a
		// cancel (covered by the mark) from one queued after it.
		queued.acceptSeq = call.Accepted.seq
	}
	queued.OnComplete = nil
	queued.Accepted = nil
	existing = append(existing, queued)
```

**File:** internal/agent/agent.go (L1200-1214)
```go
	if shouldSummarize {
		a.activeRequests.Del(call.SessionID)
		if summarizeErr := a.Summarize(genCtx, call.SessionID, call.ProviderOptions, call.OnAuthRefresh); summarizeErr != nil {
			return nil, summarizeErr
		}
		// If the agent wasn't done...
		if len(currentAssistant.ToolCalls()) > 0 {
			existing, ok := a.messageQueue.Get(call.SessionID)
			if !ok {
				existing = []SessionAgentCall{}
			}
			call.Prompt = fmt.Sprintf("The previous session was interrupted because it got too long, the initial user request was: `%s`", call.Prompt)
			existing = append(existing, call)
			a.messageQueue.Set(call.SessionID, existing)
		}
```

**File:** internal/agent/agent.go (L1246-1272)
```go
	mu := a.sessionMu(call.SessionID)
	mu.Lock()
	queuedMessages, _ := a.messageQueue.Get(call.SessionID)
	if mark, ok := a.cancelMark.Get(call.SessionID); ok && mark > 0 && len(queuedMessages) > 0 {
		// A cancel was recorded for this session (e.g. it arrived while
		// this run was active and follow-ups had been queued). Drop the
		// queued prompts it covers (accept sequence at or below the
		// mark, or untracked); keep any queued after the cancel (higher
		// sequence) so they still run.
		var kept []SessionAgentCall
		var canceledRunIDDrops []SessionAgentCall
		for _, q := range queuedMessages {
			if q.acceptSeq == 0 || q.acceptSeq <= mark {
				if q.RunID != "" {
					canceledRunIDDrops = append(canceledRunIDDrops, q)
				}
				continue
			}
			kept = append(kept, q)
		}
		queuedMessages = kept
		a.messageQueue.Set(call.SessionID, kept)
		// A dropped prompt carrying a RunID must still publish its
		// terminal cancelled RunComplete so a caller waiting on that
		// RunID does not hang.
		a.publishCanceledQueueDrops(canceledRunIDDrops)
	}
```

**File:** internal/agent/agent.go (L1273-1289)
```go
	if len(queuedMessages) == 0 {
		// No queued work. Clear the cancel mark only when no accepted
		// run remains in flight that it might still cover; otherwise a
		// sibling prompt (sequence at or below the mark) waiting to
		// enter Run would lose its cancellation. When accepted runs are
		// gone, this also clears a stale mark so it can't catch a
		// future run.
		a.messageQueue.Del(call.SessionID)
		a.acceptedMu.Lock()
		inFlight, _ := a.acceptedRuns.Get(call.SessionID)
		a.acceptedMu.Unlock()
		if inFlight == 0 {
			a.cancelMark.Del(call.SessionID)
		}
		mu.Unlock()
		return result, err
	}
```
