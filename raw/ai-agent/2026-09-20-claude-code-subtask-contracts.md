# DeepWiki Q&A with Code Context for Repository: anthropics/claude-code

> Source: DeepWiki Q&A with Code Context for Repository: anthropics/claude-code
> Collected: 2026-09-20
> Published: Unknown

## Q1

拆分子任务时，输入输出内容怎么约定，依赖和完成条件怎么判定

## 答案

从当前提供的代码上下文看，Claude Code 代码库中并没有一个统一的"子任务拆分"框架来正式约定输入/输出格式、依赖关系和完成条件。但有两处相关的实践可以参考：

---

## 相关实践

### 1. `code-review` 插件中的子任务（subagent）编排

`/code-review` 命令按步骤拆分成多个 agent 任务，每一步都明确规定了**输入**（如 PR 标题、描述、issue 描述）和**输出**（issue 列表，包含描述和被标记原因） claude-code:30-30 。

- **输出约定**：每个审查 agent 需返回 issue 列表，每条包含 description 和 flag 原因（如 "CLAUDE.md adherence"、"bug"） claude-code:30-30 。
- **依赖关系**：验证阶段（第 5 步）依赖第 4 步产出的 issue 列表，为每个 issue 单独启动子 agent 进行验证，验证子 agent 的输入是 PR 标题、描述及该 issue 的描述 claude-code:55-55 。
- **完成条件判定**：验证子 agent 的职责是判断该 issue 是否"真实存在、高置信度"，例如核实变量确实未定义，或 CLAUDE.md 规则确实被违反且适用于该文件 claude-code:55-55 ；未通过验证的 issue 会被过滤掉，只留下"高信号"结果 claude-code:57-57 。
- 更详细的置信度打分机制（如需 ≥80 分才被采纳）在插件 README 中有说明，属于对"完成条件"的量化约定（见 wiki 页面 Code Review Plugin 的 Confidence Scoring 部分）。

### 2. `multi-agent-swarm` 交互式命令示例中的任务定义

在 `plugin-dev` 的 command-development 参考文档里，展示了一个多 agent swarm 启动命令的交互流程，其中通过 `AskUserQuestion` 显式收集每个 agent 的任务信息：

- **Task Type**（任务类型/内容） claude-code:740-749
- **Dependencies**（依赖的其他 agent，支持多选） claude-code:751-757
- **Base Branch**（完成后 PR 的目标分支，隐含"完成"即产出可合并的 PR） claude-code:759-766

收集完成后，这些信息会被存储并生成一个任务列表文件（如 `.daisy/swarm/tasks.md`），作为后续 swarm 执行的输入 claude-code:767-777 。这只是一个"示例性"文档，展示如何设计交互式收集任务定义的命令，并非一个正式运行时的任务拆分引擎。

## Notes

- 以上两个例子都不是专门针对"子任务拆分的输入输出契约/依赖/完成条件判定"设计的通用框架；它们分别是 `code-review` 插件的具体审查流程约定，以及 `plugin-dev` 文档中一个交互式命令设计范例。
- 如果你要问的是 Claude Code 内部（Agent SDK 或 Task 工具）用于任务分解、多 agent 协作的核心机制（例如 Task tool 的正式规范），当前索引的上下文中没有找到相关文件内容；由于索引大小限制，部分文件内容可能未被收录，建议启动一个 Devin session 以获取完整代码库内容进行确认。

Wiki pages you might want to explore:
- [Code Review Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.2)

### Citations

**File:** plugins/code-review/commands/code-review.md (L30-30)
```markdown
4. Launch 4 agents in parallel to independently review the changes. Each agent should return the list of issues, where each issue includes a description and the reason it was flagged (e.g. "CLAUDE.md adherence", "bug"). The agents should do the following:
```

**File:** plugins/code-review/commands/code-review.md (L55-55)
```markdown
5. For each issue found in the previous step by agents 3 and 4, launch parallel subagents to validate the issue. These subagents should get the PR title and description along with a description of the issue. The agent's job is to review the issue to validate that the stated issue is truly an issue with high confidence. For example, if an issue such as "variable is not defined" was flagged, the subagent's job would be to validate that is actually true in the code. Another example would be CLAUDE.md issues. The agent should validate that the CLAUDE.md rule that was violated is scoped for this file and is actually violated. Use Opus subagents for bugs and logic issues, and sonnet agents for CLAUDE.md violations.
```

**File:** plugins/code-review/commands/code-review.md (L57-57)
```markdown
6. Filter out any issues that were not validated in step 5. This step will give us our list of high signal issues for our review.
```

**File:** plugins/plugin-dev/skills/command-development/references/interactive-commands.md (L740-749)
```markdown
**Question B: Task Type**
Question: "What task for [agent-name]?"
Header: "Task type"
Options:
  - Authentication (User auth, JWT, OAuth)
  - API Endpoints (REST/GraphQL APIs)
  - UI Components (Frontend components)
  - Database (Schema, migrations, queries)
  - Testing (Test suites and coverage)
  - Documentation (Docs, README, guides)
```

**File:** plugins/plugin-dev/skills/command-development/references/interactive-commands.md (L751-757)
```markdown
**Question C: Dependencies**
Question: "What does [agent-name] depend on?"
Header: "Dependencies"
multiSelect: true
Options:
  - [List of previously defined agents]
  - No dependencies
```

**File:** plugins/plugin-dev/skills/command-development/references/interactive-commands.md (L759-766)
```markdown
**Question D: Base Branch**
Question: "Which base branch for PR?"
Header: "PR base"
Options:
  - main
  - staging
  - develop

```

**File:** plugins/plugin-dev/skills/command-development/references/interactive-commands.md (L767-777)
```markdown
Store all task information for each agent.

### Generate Task List File

After collecting all agent task details:

1. Ask for project name
2. Generate task list in proper format
3. Save to `.daisy/swarm/tasks.md`
4. Show user the file path
5. Proceed with launch using generated task list
```

## Q2

所以对于输入输出的内容，没有严格的结构化约定吗

## 答案

对，确实没有严格的结构化（如 JSON Schema）约定。无论是 `code-review` 插件还是 `multi-agent-swarm` 示例，输入输出都是**自然语言描述**，而非强类型的数据结构。

---

## 细节说明

### code-review：自然语言描述的输入输出

`/code-review` 命令对每个 agent 的输出只是文字性规定，"返回 issue 列表，每条包含 description 和 flag 原因"，并未定义具体字段类型或 schema claude-code:30-30 。验证子 agent 的输入同样是"PR 标题、描述以及该 issue 的描述"这类自然语言约定，而不是结构化参数 claude-code:55-55 。

### interactive-commands 示例：结构化程度略高但仍是文档层面的约定

相比之下，`multi-agent-swarm` 命令示例把任务信息以 YAML frontmatter 形式持久化到 `.claude/multi-agent-swarm.local.md`，字段包括 `agent_name`、`task_number`、`dependencies`、`enabled` 等 claude-code:100-116 。这是目前上下文中**唯一接近"结构化约定"**的例子，但它仍属于文档/配置文件层面的松散 key-value 结构，而非强类型 schema 或接口定义，且 `dependencies` 字段的值也只是简单的字符串列表 claude-code:106-109 。

### 类型层面的严格约定：仅限于引擎内部 API

如果把范围扩大到引擎本身（而非任务拆分文档），Claude Code 的 `claude-code.d.ts` 类型声明确实为 subagent 的生成（`AgentSpawnInput`）和结果（`AgentSpawnResult`）定义了严格的 TypeScript 类型，包括 `prompt`、`description`、`subagentType`、`model` 等字段 claude-code:231-254 ，以及返回的 `{ model, agentId }` 或 `{ deny: reason }` 结构 claude-code:323-345 。但这是 **mod/plugin hook 系统的底层 API 类型**，不是面向"如何拆分子任务"的业务级规范——它约束的是引擎调用 `$.agent.spawn` 时的参数形状，而不是子任务之间输入输出内容、依赖、完成条件这些语义层面的东西。

## Notes

- 综上，目前代码库中没有找到针对"子任务拆分"的业务级 JSON Schema 或接口契约；结构化程度最高的是引擎 hook 层的 TypeScript 类型 `AgentSpawnInput`/`AgentSpawnResult`，但它服务的是底层 spawn 机制而非任务分解语义。
- 由于索引大小限制，如果代码库中存在其它更正式的任务分解规范文件未被检索到，建议启动 Devin session 做全文搜索确认。

Wiki pages you might want to explore:
- [System Architecture (anthropics/claude-code)](/wiki/anthropics/claude-code#1.1)
- [Code Review Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.2)

### Citations

**File:** plugins/code-review/commands/code-review.md (L30-30)
```markdown
4. Launch 4 agents in parallel to independently review the changes. Each agent should return the list of issues, where each issue includes a description and the reason it was flagged (e.g. "CLAUDE.md adherence", "bug"). The agents should do the following:
```

**File:** plugins/code-review/commands/code-review.md (L55-55)
```markdown
5. For each issue found in the previous step by agents 3 and 4, launch parallel subagents to validate the issue. These subagents should get the PR title and description along with a description of the issue. The agent's job is to review the issue to validate that the stated issue is truly an issue with high confidence. For example, if an issue such as "variable is not defined" was flagged, the subagent's job would be to validate that is actually true in the code. Another example would be CLAUDE.md issues. The agent should validate that the CLAUDE.md rule that was violated is scoped for this file and is actually violated. Use Opus subagents for bugs and logic issues, and sonnet agents for CLAUDE.md violations.
```

**File:** plugins/plugin-dev/skills/plugin-settings/references/real-world-examples.md (L100-116)
```markdown
```bash
cat > "$WORKTREE_PATH/.claude/multi-agent-swarm.local.md" <<EOF
---
agent_name: $AGENT_NAME
task_number: $TASK_ID
pr_number: TBD
coordinator_session: $COORDINATOR_SESSION
enabled: true
dependencies: [$DEPENDENCIES]
additional_instructions: "$EXTRA_INSTRUCTIONS"
---

# Task: $TASK_DESCRIPTION

$TASK_DETAILS
EOF
```
```

**File:** mods/types/claude-code.d.ts (L231-254)
```typescript
  export type AgentSpawnInput = {
      /**
       * The Agent tool call this spawn belongs to (for `$.ui.notice`). Pinned:
       * the spawn's identity.
       */
      tool_use_id: string;
      /**
       * The task the subagent is given: the Agent tool's `prompt` parameter. A
       * rewrite is the prompt the subagent runs with.
       */
      prompt: string;
      /**
       * The Agent tool's short `description` of the task (a few words). A rewrite
       * is what the task shows as.
       */
      description: string;
      /**
       * The resolved agent type (`general-purpose`, `Explore`, a plugin's agent,
       * `fork`). A rewrite names another agent this call can dispatch, exactly.
       *
       * That definition is the one spawned; a name matching none refuses the
       * spawn, and a fork dispatches no other.
       */
      subagentType: string;
```

**File:** mods/types/claude-code.d.ts (L323-345)
```typescript
  export type AgentSpawnResult = {
      /**
       * What the subagent runs on: from core the resolved id; from a hook an
       * alias (`haiku`) or an id.
       */
      model: string;
      /**
       * The started subagent's id: the same string its loop's `tool.call`
       * events carry as `agentId` and `$.agent.list()` lists it by.
       *
       * Set by core; a hook that answers without `next` started none.
       */
      agentId?: string;
      deny?: undefined;
  } | {
      /**
       * Refuses the spawn, so nothing starts; the model sees the text as the
       * Agent tool's error.
       */
      deny: string;
      model?: undefined;
      agentId?: undefined;
  };
```

## Q3

那依赖和完成条件是怎么判定

## 答案

In both examples seen so far, dependency and completion judgments are **manual/LLM-judged**, not enforced by any runtime scheduler or type system in the codebase.

---

## Details

### `code-review`: completion judged by validation, not explicit dependency tracking

There's no explicit "dependency" declaration here — step ordering is purely sequential/textual: step 5 says "for each issue found in the previous step," implicitly depending on step 4's output, but nothing structurally links them beyond the prompt text claude-code:55-55 . "Completion" of an issue is judged by a second LLM agent that re-checks the claim against the code with high confidence, using Opus for bugs and Sonnet for CLAUDE.md violations claude-code:55-55 . If the validator disagrees, the issue is simply dropped in the filtering step claude-code:57-57 . This "completion condition" is essentially an LLM confidence judgment, further quantified in the plugin README as a 0–100 score with an 80-point threshold (in `code-reviewer.md` sub-agent's confidence scale) claude-code:23-33 .

### `multi-agent-swarm` example: `dependencies` field is declarative metadata only

The frontmatter written to `.claude/multi-agent-swarm.local.md` includes a `dependencies` field claude-code:100-116 , but the retrieved snippet only shows it being *written*, not *read/enforced* — there's no visible scheduler code in the indexed context that blocks a dependent agent from starting until its dependency's `enabled`/status flag changes. The `AskUserQuestion` step that collects this field only asks the user to pick "previously defined agents" or "No dependencies" claude-code:751-757 — this is a documentation-authoring aid, not proof of an actual dependency-resolution engine.

## Notes

- I could not find, in the indexed context, any runtime code that reads the `dependencies` field or the `enabled` flag to gate execution order — so I can't confirm how (or whether) dependencies are mechanically enforced at runtime, only that they're recorded as metadata.
- "Completion condition" in the code-review flow is best understood as an LLM self-critique/validation pass rather than a formal state-machine condition; there is no boolean "done" flag checked by engine code in this context.
- Given index size limits, if a formal task-dependency/completion engine exists elsewhere in the repo (e.g., a workflow or `/workflows` scheduler mentioned in `CHANGELOG.md`), it wasn't retrieved here — starting a Devin session would let you search the full repo (e.g., for "workflow" orchestration code) to confirm.

Wiki pages you might want to explore:
- [System Architecture (anthropics/claude-code)](/wiki/anthropics/claude-code#1.1)
- [Code Review Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.2)

### Citations

**File:** plugins/code-review/commands/code-review.md (L55-55)
```markdown
5. For each issue found in the previous step by agents 3 and 4, launch parallel subagents to validate the issue. These subagents should get the PR title and description along with a description of the issue. The agent's job is to review the issue to validate that the stated issue is truly an issue with high confidence. For example, if an issue such as "variable is not defined" was flagged, the subagent's job would be to validate that is actually true in the code. Another example would be CLAUDE.md issues. The agent should validate that the CLAUDE.md rule that was violated is scoped for this file and is actually violated. Use Opus subagents for bugs and logic issues, and sonnet agents for CLAUDE.md violations.
```

**File:** plugins/code-review/commands/code-review.md (L57-57)
```markdown
6. Filter out any issues that were not validated in step 5. This step will give us our list of high signal issues for our review.
```

**File:** plugins/feature-dev/agents/code-reviewer.md (L23-33)
```markdown
## Confidence Scoring

Rate each potential issue on a scale from 0-100:

- **0**: Not confident at all. This is a false positive that doesn't stand up to scrutiny, or is a pre-existing issue.
- **25**: Somewhat confident. This might be a real issue, but may also be a false positive. If stylistic, it wasn't explicitly called out in project guidelines.
- **50**: Moderately confident. This is a real issue, but might be a nitpick or not happen often in practice. Not very important relative to the rest of the changes.
- **75**: Highly confident. Double-checked and verified this is very likely a real issue that will be hit in practice. The existing approach is insufficient. Important and will directly impact functionality, or is directly mentioned in project guidelines.
- **100**: Absolutely certain. Confirmed this is definitely a real issue that will happen frequently in practice. The evidence directly confirms this.

**Only report issues with confidence ≥ 80.** Focus on issues that truly matter - quality over quantity.
```
