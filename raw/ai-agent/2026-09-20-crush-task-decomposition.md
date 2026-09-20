# DeepWiki Q&A with Code Context for Repository: charmbracelet/crush

> Source: DeepWiki Q&A with Code Context for Repository: charmbracelet/crush
> Collected: 2026-09-20
> Published: Unknown

## Q1

拿到复杂需求时，怎么划分子任务

## 答案

拿到复杂需求时，Crush 的智能体主要通过两种机制划分子任务：**任务分解原则**（写在 system prompt 中）和 **todos 工具**（结构化任务列表）。

---

### 1. 任务分解原则（`coder.md.tpl`）

Crush 的 coder agent 的系统提示词中明确要求将复杂任务拆解为步骤并自主完成，不允许因为任务大而停下： crush:7-7

在 `<task_completion>` 部分，要求在动手前先做内部思考（不对用户旁白），列出所有需要改动的组件（models、logic、routes、config、tests、docs），并形成一个"心理清单"： crush:217-231

以及在 `<decision_making>` 中明确说明"任务看起来太大"不是停下来的理由，而应该拆解它： crush:122-126

### 2. `todos` 工具管理子任务状态

对于多步骤任务，agent 会使用 `todos` 工具维护一个结构化任务列表，每个任务有 pending/in_progress/completed 三种状态，且规定同一时刻只能有一个任务处于 in_progress： crush:1-1

（注：对于简单或单步任务会跳过这个工具。）

### 3. Plan 模式下的分解方式（`plan.md.tpl`）

如果是在 Plan 模式（专门用于分析并输出实施计划，而不直接改代码）下，工作流第一步就是把需求拆解为独立的"探索线程"（如架构、类似功能、测试、配置、文档、用户界面触点等），然后逐一探索、综合、审查缺口，最后产出具体可执行的实施计划： crush:27-42

Plan 模式下没有文件编辑/命令执行权限，只能借助 `glob`/`grep`/`ls`/`view` 等只读工具进行探索，必要时可以委派给子 agent 做更深入的代码库探索： crush:5-20

---

## Notes

- 这三者是互补关系：`plan.md.tpl` 描述的是"规划阶段"如何拆分探索/分析任务；`coder.md.tpl` 描述的是执行阶段的分解原则；`todos` 工具则是执行过程中跟踪具体子任务状态的机制。
- 我在结果中还看到 `internal/agent/agentic_fetch_tool.go` 里也有"将问题拆解为更小、更聚焦的搜索"的提示词 crush:136-139 ，但这是专门针对网络搜索子任务（`agentic_fetch`/`web_search`）的场景，与通用需求分解关系不大，仅供参考。
- 由于索引大小限制，`internal/agent/tools/todo.go`（todos 工具的具体实现逻辑）未包含在本次上下文中；如果你需要查看该工具的完整实现代码，建议开启一个 Devin session 以获取完整文件内容。

Wiki pages you might want to explore:
- [Streaming and Summarization (charmbracelet/crush)](/wiki/charmbracelet/crush#4.5)
- [Network Tools (charmbracelet/crush)](/wiki/charmbracelet/crush#6.6)

### Citations

**File:** internal/agent/templates/coder.md.tpl (L7-7)
```text
2. **BE AUTONOMOUS**: Don't ask questions - search, read, think, decide, act. Break complex tasks into steps and complete them all. Systematically try alternative strategies (different commands, search terms, tools, refactors, or scopes) until either the task is complete or you hit a hard external limit (missing credentials, permissions, files, or network access you cannot change). Only stop for actual blocking errors, not perceived difficulty.
```

**File:** internal/agent/templates/coder.md.tpl (L122-126)
```text
**Never stop for**:
- Task seems too large (break it down)
- Multiple files to change (change them)
- Concerns about "session limits" (no such limits exist)
- Work will take many steps (do all the steps)
```

**File:** internal/agent/templates/coder.md.tpl (L217-231)
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
```

**File:** internal/agent/tools/todos.md (L1-1)
```markdown
Manage a structured task list for multi-step work; each task has pending/in_progress/completed state. Keep exactly one task in_progress at a time. Skip for simple or single-step tasks.
```

**File:** internal/agent/templates/plan.md.tpl (L5-20)
```text
<capabilities>
You do NOT have access to file-modification tools. The following tools are physically absent from your environment — calling them will fail immediately:
- edit, multiedit, write (file editing/creation)
- bash (shell execution)

Your available tools are:{{ " " }}{{ range $i, $t := (index .Config.Agents "plan").AllowedTools }}{{ if $i }}, {{ end }}{{ $t }}{{ end }}.

If the user asks you to implement, apply, execute, or otherwise make changes, do NOT attempt to call missing tools. Instead, respond in one sentence: explain that you are in plan mode and cannot modify files, and tell the user to approve the plan to proceed with implementation.
</capabilities>

<critical_rules>
These rules override everything else. Follow them strictly:

1. you cannot modify files, create files, delete files, or run write operations — these tools are not available in plan mode. If asked to implement, tell the user you are in plan mode and direct them to approve the plan.
2. do not execute commands that can change system state.
3. delegation to sub-agents is allowed for deeper codebase exploration only.
```

**File:** internal/agent/templates/plan.md.tpl (L27-42)
```text
<workflow>
1. decompose the request into independent exploration threads (e.g., architecture, analogous features, tests, config, documentation, user-facing touchpoints)
2. explore using direct search tools (`glob`, `grep`, `ls`, `view`); delegate independent searches to sub-agents when that is useful
3. synthesize findings: existing patterns, analogous functionality, structural designs, and dependencies relevant to the request
4. critically review the synthesis — identify gaps, contradictions, unverified assumptions, and areas not yet explored; use additional targeted reads or searches to close gaps; repeat until confident nothing material is missing
5. assess potential risks, edge cases, failure modes, and pre-existing issues in touched areas; do not expand scope beyond what informs the plan
6. produce a concrete, actionable implementation plan
7. if needed, ask only clarifying questions required to unblock the plan; use the `question` tool — never plain text
8. when the plan is ready and complete, your final response MUST:
 - begin with the exact start marker on its own first line: <!-- CRUSH_PLAN_START -->
 - include a "Critical Files" section listing the 3-5 files most critical for implementing the plan
 - end with the exact end marker on its own line: <!-- CRUSH_PLAN_READY -->
 - emit both markers as plain text — never inside a code fence or inline code backticks
 - do NOT ask for confirmation via the question tool or plain text — the UI will prompt the user
 - keep all intermediate/exploratory responses marker-free
</workflow>
```

**File:** internal/agent/agentic_fetch_tool.go (L136-139)
```go
			} else {
				// Search mode: let the sub-agent search and fetch as needed.
				fullPrompt = fmt.Sprintf("%s\n\nUse the web_search tool to find relevant information. Break down the question into smaller, focused searches if needed. After searching, use web_fetch to get detailed content from the most relevant results.", params.Prompt)
			}
```

## Q2

怎么判断需求是否复杂呢，换句话说怎么判断什么样的需求需要拆分呢。以及拆分的具体依据是什么

## 答案

Crush 的 system prompt 中并没有给出一个量化的"复杂度判断公式"，而是用**质性信号**来提示何时需要拆分，主要体现在以下几处：

---

### 1. `todos` 工具的判断标准

最直接的判断依据来自 `todos` 工具的描述：只要是"多步骤工作"（multi-step work）就需要用结构化任务列表管理，而"简单或单步任务"可以跳过： crush:1-1

也就是说，**判断依据是任务是否可以一步完成**——如果需要多个步骤才能完成，就应该拆分并用 todos 追踪状态（pending/in_progress/completed，同一时刻只能有一个 in_progress）。

### 2. `task_completion` 中"非平凡任务"（non-trivial tasks）的识别信号

`coder.md.tpl` 里的 `<task_completion>` 部分给出了识别"需要拆分/规划"的具体依据——即需求触及了多少个不同的组件维度： crush:217-231

拆分的具体依据是列出的这些维度：
- **components**：models、logic、routes、config、tests、docs 是否都要改动
- **edge cases and error paths**：是否存在需要提前考虑的边界情况
- **多部分请求**：如果用户的 prompt 里有多个 bullet/question，每一条都应作为独立的 checklist item

只要触及多个组件或多个独立子问题，就构成需要拆分的"非平凡任务"。

### 3. `decision_making` 中明确排除的"不该停下"的理由，反向说明何为复杂

`<decision_making>` 一节明确指出，"任务看起来太大""要改多个文件""要走很多步骤"都不是停下来的理由，而是应该拆分并逐步完成的信号： crush:122-126

这从反面给出了识别复杂需求的信号：**涉及多文件改动、预计步骤很多**，都是需要拆分的标志。

### 4. Plan 模式下更结构化的拆分维度

在 Plan 模式（`plan.md.tpl`）里，拆分不是按"步骤"而是按**独立的探索线程/关注面**来划分，明确列出了参考维度： crush:27-42

具体依据是：architecture（架构）、analogous features（类似功能）、tests（测试）、config（配置）、documentation（文档）、user-facing touchpoints（用户可见的改动点）——凡是需求涉及这些维度中的多个，就应该按线程拆分探索，再综合成一个可执行计划（`Critical Files` + 起止标记）。

---

## Notes

- 综合看，Crush 判断"是否复杂/是否需要拆分"的依据不是一个显式算法，而是几个经验性的启发式信号：**触及组件数量**（models/logic/routes/config/tests/docs）、**是否多文件**、**是否多步骤**、**用户 prompt 是否包含多个独立子请求（bullet/question）**——只要满足其一，就应该拆分为子任务并用 `todos` 工具追踪。
- Plan 模式和 coder 模式的拆分维度不同：coder 模式按"实现所需改动的组件"拆分，plan 模式按"独立的探索/分析线程"拆分，二者服务于不同阶段（规划 vs 执行）。
- 由于索引限制，`internal/agent/tools/todo.go`（`todos` 工具的完整实现逻辑，例如任务粒度校验代码）未包含在本次上下文中，如需查看具体实现建议开启 Devin session 获取完整代码。

Wiki pages you might want to explore:
- [Streaming and Summarization (charmbracelet/crush)](/wiki/charmbracelet/crush#4.5)
- [Development (charmbracelet/crush)](/wiki/charmbracelet/crush#8)

### Citations

**File:** internal/agent/templates/coder.md.tpl (L122-126)
```text
**Never stop for**:
- Task seems too large (break it down)
- Multiple files to change (change them)
- Concerns about "session limits" (no such limits exist)
- Work will take many steps (do all the steps)
```

**File:** internal/agent/templates/coder.md.tpl (L217-231)
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
```

**File:** internal/agent/templates/plan.md.tpl (L27-42)
```text
<workflow>
1. decompose the request into independent exploration threads (e.g., architecture, analogous features, tests, config, documentation, user-facing touchpoints)
2. explore using direct search tools (`glob`, `grep`, `ls`, `view`); delegate independent searches to sub-agents when that is useful
3. synthesize findings: existing patterns, analogous functionality, structural designs, and dependencies relevant to the request
4. critically review the synthesis — identify gaps, contradictions, unverified assumptions, and areas not yet explored; use additional targeted reads or searches to close gaps; repeat until confident nothing material is missing
5. assess potential risks, edge cases, failure modes, and pre-existing issues in touched areas; do not expand scope beyond what informs the plan
6. produce a concrete, actionable implementation plan
7. if needed, ask only clarifying questions required to unblock the plan; use the `question` tool — never plain text
8. when the plan is ready and complete, your final response MUST:
 - begin with the exact start marker on its own first line: <!-- CRUSH_PLAN_START -->
 - include a "Critical Files" section listing the 3-5 files most critical for implementing the plan
 - end with the exact end marker on its own line: <!-- CRUSH_PLAN_READY -->
 - emit both markers as plain text — never inside a code fence or inline code backticks
 - do NOT ask for confirmation via the question tool or plain text — the UI will prompt the user
 - keep all intermediate/exploratory responses marker-free
</workflow>
```
