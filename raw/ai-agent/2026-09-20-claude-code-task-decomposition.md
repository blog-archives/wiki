# DeepWiki Q&A with Code Context for Repository: anthropics/claude-code

> Source: DeepWiki Q&A with Code Context for Repository: anthropics/claude-code
> Collected: 2026-09-20
> Published: Unknown

## Q1

拿到复杂需求时，怎么划分子任务

## 拿到复杂需求时如何划分子任务

在 `anthropics/claude-code` 仓库中，`feature-dev` 插件提供了处理复杂需求的标准范式：将需求拆解为 7 个阶段，每个阶段再并行分发给多个专职子代理（subagent）去完成，而不是让主代理独自处理所有内容 claude-code:8-16 。

---

### 7 阶段拆解流程

1. **Phase 1 需求发现**：先用 `TodoWrite` 建立所有阶段的任务列表，若需求不清晰则向用户澄清问题、目标、约束 claude-code:20-32 。

2. **Phase 2 代码库探索**：并行启动 2-3 个 `code-explorer` 子代理，每个聚焦不同侧面（相似功能、架构、用户体验等），并要求它们各自返回 5-10 个关键文件供主代理阅读 claude-code:40-53 。

3. **Phase 3 澄清问题**：基于探索结果，识别所有未明确的边界情况、错误处理、兼容性等问题，一次性列出给用户，并等待回答后才进入架构设计 claude-code:57-69 。

4. **Phase 4 架构设计**：并行启动 2-3 个 `code-architect` 子代理，分别按"最小改动"、"整洁架构"、"务实平衡"三种不同取向设计方案，再由主代理汇总、给出推荐并让用户选择 claude-code:73-82 。

5. **Phase 5 实现**：必须等用户明确批准后才开始写代码，遵循已选定架构和代码库规范 claude-code:85-97 。

6. **Phase 6 质量审查**：并行启动 3 个 `code-reviewer` 子代理，分别关注简洁性/DRY、bug/功能正确性、项目约定这三个不同维度，然后汇总最高优先级问题，交由用户决定是否立即修复 claude-code:101-109 。

7. **Phase 7 总结**：完成所有 todo，总结产出内容 claude-code:113-120 。

### 子任务划分的核心原则

- **多代理并行 + 不同视角**：同一阶段内的子代理都被要求"聚焦不同方面"，避免重复劳动同时提升覆盖面（探索阶段侧重视角差异，架构/审查阶段侧重取向/关注点差异）。
- **代理角色分工**：`code-explorer` 负责理解现状、`code-architect` 负责方案设计、`code-reviewer` 负责质量把关，三者工具集相同（Glob/Grep/LS/Read/NotebookRead）但职责不同 claude-code:331-339 。
- **何时用这种拆解方式**：README 明确指出适用于"触及多文件的新功能"、"需要架构决策"、"复杂集成"、"需求不够清晰"的场景；而单行 bug 修复、简单任务、紧急 hotfix 不建议走此流程 claude-code:349-361 。

### 另一个例子：`code-review` 插件的任务拆分

作为对照，`code-review` 插件展示了另一种子任务划分思路——按"检测 + 验证"两阶段、按模型能力分工（Haiku 做预检查、Sonnet 做规范审查、Opus 做 bug 检测），并对每个发现的问题再单独派发验证子代理以降低误报 claude-code:30-55 。这说明子任务拆分不仅可以按"阶段串行 + 阶段内并行"（feature-dev），也可以按"角色能力 + 逐条验证"（code-review）来设计，取决于任务本质是"构建"还是"审查/验证"。

### Notes

- 以上均基于 `plugins/feature-dev/commands/feature-dev.md` 和 `plugins/code-review/commands/code-review.md` 这两个具体的 slash command 定义文件，它们本身就是 Claude Code 用来指导主代理如何拆分与调度子代理的 prompt 模板，而非底层调度引擎代码。
- 若你想了解子代理调度的底层机制（如 `Task` 工具、worktree 隔离、后台执行等），那是另一套系统，详见 wiki 中 "Agent System & Subagents" 页面提到的 `CHANGELOG.md` 相关条目，但具体源码实现未在当前索引中展示，如需查看完整实现建议开启 Devin session 获取完整代码。

Wiki pages you might want to explore:
- [Agent System & Subagents (anthropics/claude-code)](/wiki/anthropics/claude-code#3.1)
- [Code Review Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.2)

### Citations

**File:** plugins/feature-dev/commands/feature-dev.md (L8-16)
```markdown
You are helping a developer implement a new feature. Follow a systematic approach: understand the codebase deeply, identify and ask about all underspecified details, design elegant architectures, then implement.

## Core Principles

- **Ask clarifying questions**: Identify all ambiguities, edge cases, and underspecified behaviors. Ask specific, concrete questions rather than making assumptions. Wait for user answers before proceeding with implementation. Ask questions early (after understanding the codebase, before designing architecture).
- **Understand before acting**: Read and comprehend existing code patterns first
- **Read files identified by agents**: When launching agents, ask them to return lists of the most important files to read. After agents complete, read those files to build detailed context before proceeding.
- **Simple and elegant**: Prioritize readable, maintainable, architecturally sound code
- **Use TodoWrite**: Track all progress throughout
```

**File:** plugins/feature-dev/commands/feature-dev.md (L20-32)
```markdown
## Phase 1: Discovery

**Goal**: Understand what needs to be built

Initial request: $ARGUMENTS

**Actions**:
1. Create todo list with all phases
2. If feature unclear, ask user for:
   - What problem are they solving?
   - What should the feature do?
   - Any constraints or requirements?
3. Summarize understanding and confirm with user
```

**File:** plugins/feature-dev/commands/feature-dev.md (L40-53)
```markdown
**Actions**:
1. Launch 2-3 code-explorer agents in parallel. Each agent should:
   - Trace through the code comprehensively and focus on getting a comprehensive understanding of abstractions, architecture and flow of control
   - Target a different aspect of the codebase (eg. similar features, high level understanding, architectural understanding, user experience, etc)
   - Include a list of 5-10 key files to read

   **Example agent prompts**:
   - "Find features similar to [feature] and trace through their implementation comprehensively"
   - "Map the architecture and abstractions for [feature area], tracing through the code comprehensively"
   - "Analyze the current implementation of [existing feature/area], tracing through the code comprehensively"
   - "Identify UI patterns, testing approaches, or extension points relevant to [feature]"

2. Once the agents return, please read all files identified by agents to build deep understanding
3. Present comprehensive summary of findings and patterns discovered
```

**File:** plugins/feature-dev/commands/feature-dev.md (L57-69)
```markdown
## Phase 3: Clarifying Questions

**Goal**: Fill in gaps and resolve all ambiguities before designing

**CRITICAL**: This is one of the most important phases. DO NOT SKIP.

**Actions**:
1. Review the codebase findings and original feature request
2. Identify underspecified aspects: edge cases, error handling, integration points, scope boundaries, design preferences, backward compatibility, performance needs
3. **Present all questions to the user in a clear, organized list**
4. **Wait for answers before proceeding to architecture design**

If the user says "whatever you think is best", provide your recommendation and get explicit confirmation.
```

**File:** plugins/feature-dev/commands/feature-dev.md (L73-82)
```markdown
## Phase 4: Architecture Design

**Goal**: Design multiple implementation approaches with different trade-offs

**Actions**:
1. Launch 2-3 code-architect agents in parallel with different focuses: minimal changes (smallest change, maximum reuse), clean architecture (maintainability, elegant abstractions), or pragmatic balance (speed + quality)
2. Review all approaches and form your opinion on which fits best for this specific task (consider: small fix vs large feature, urgency, complexity, team context)
3. Present to user: brief summary of each approach, trade-offs comparison, **your recommendation with reasoning**, concrete implementation differences
4. **Ask user which approach they prefer**

```

**File:** plugins/feature-dev/commands/feature-dev.md (L85-97)
```markdown
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

**File:** plugins/feature-dev/commands/feature-dev.md (L113-120)
```markdown
## Phase 7: Summary

**Goal**: Document what was accomplished

**Actions**:
1. Mark all todos complete
2. Summarize:
   - What was built
```

**File:** plugins/feature-dev/README.md (L331-339)
```markdown
**Design architecture:**
```
"Launch code-architect to design the caching layer"
```

**Review code:**
```
"Launch code-reviewer to check my recent changes"
```
```

**File:** plugins/feature-dev/README.md (L349-361)
```markdown
## When to Use This Plugin

**Use for:**
- New features that touch multiple files
- Features requiring architectural decisions
- Complex integrations with existing code
- Features where requirements are somewhat unclear

**Don't use for:**
- Single-line bug fixes
- Trivial changes
- Well-defined, simple tasks
- Urgent hotfixes
```

**File:** plugins/code-review/commands/code-review.md (L30-55)
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

5. For each issue found in the previous step by agents 3 and 4, launch parallel subagents to validate the issue. These subagents should get the PR title and description along with a description of the issue. The agent's job is to review the issue to validate that the stated issue is truly an issue with high confidence. For example, if an issue such as "variable is not defined" was flagged, the subagent's job would be to validate that is actually true in the code. Another example would be CLAUDE.md issues. The agent should validate that the CLAUDE.md rule that was violated is scoped for this file and is actually violated. Use Opus subagents for bugs and logic issues, and sonnet agents for CLAUDE.md violations.
```

## Q2

那判断用户需求是否复杂的依据是什么

## 判断需求复杂度的依据

`feature-dev` 插件的文档中没有量化算法，但 README 明确列出了判断"该用完整7阶段流程"的场景标准，这些标准本质上就是判断需求是否"复杂"的依据。

---

### 判定为复杂需求（走完整流程）的场景 claude-code:349-355

对应四个信号：
1. **触及多文件**——不是局限于单文件的改动
2. **需要架构决策**——存在多种实现路径需要权衡
3. **涉及复杂集成**——需要理解并对接已有系统
4. **需求本身模糊**——问题、目标或约束尚不明确

### 判定为简单需求（不需要拆分）的场景 claude-code:357-361

对应：
1. **单行 bug 修复**
2. **琐碎改动**
3. **需求已完全明确的简单任务**
4. **紧急 hotfix**（时间优先于流程完整性）

### Phase 1 中的隐性复杂度探测

在实际运行 `/feature-dev` 命令时，第一步就是尝试判断需求是否清晰：如果不清晰，会主动向用户追问"要解决什么问题""功能该做什么""有哪些约束" claude-code:26-32 。这可以看作是一种运行时的"复杂度/清晰度检测"——如果三个问题都能被用户一句话说清，说明需求足够简单；如果需要多轮澄清，说明存在足够的不确定性，值得走完整流程。

### Notes

- 目前索引到的文件中，只有 `plugins/feature-dev/README.md` 里"When to Use This Plugin"这一段是关于复杂度判定标准的直接依据，它更像是给人类/agent 参考的启发式规则列表，而不是代码里实现的判定函数或打分算法 claude-code:349-361 。
- 没有找到任何自动化的"复杂度评分"代码逻辑（例如根据文件数、代码行数等自动决定是否触发多阶段流程）；决策仍依赖 Claude 本身在 Phase 1 阶段的主观判断和向用户提问 claude-code:20-32 。

Wiki pages you might want to explore:
- [Official Plugins (anthropics/claude-code)](/wiki/anthropics/claude-code#5)
- [Feature Development Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.3)

### Citations

**File:** plugins/feature-dev/README.md (L349-361)
```markdown
## When to Use This Plugin

**Use for:**
- New features that touch multiple files
- Features requiring architectural decisions
- Complex integrations with existing code
- Features where requirements are somewhat unclear

**Don't use for:**
- Single-line bug fixes
- Trivial changes
- Well-defined, simple tasks
- Urgent hotfixes
```

**File:** plugins/feature-dev/commands/feature-dev.md (L20-32)
```markdown
## Phase 1: Discovery

**Goal**: Understand what needs to be built

Initial request: $ARGUMENTS

**Actions**:
1. Create todo list with all phases
2. If feature unclear, ask user for:
   - What problem are they solving?
   - What should the feature do?
   - Any constraints or requirements?
3. Summarize understanding and confirm with user
```

## Q3

所有问题都是按照同一套拆分依据，固定拆成七步走吗

## 简短回答

不是。`/feature-dev` 的七阶段划分是 `feature-dev` 这个插件针对"复杂新功能开发"场景固定设计的模板 claude-code:20-125 ，但它并不是通用于所有任务的唯一拆分依据；Claude Code 本身还提供其他结构完全不同的插件，且 README 明确说明简单任务不该套用这套流程。

---

### 为什么不是"万能固定七步"

#### 1. 适用范围有明确边界
`feature-dev/README.md` 的 "When to Use This Plugin" 明确划出了适用与不适用场景：多文件新功能、需要架构决策、复杂集成、需求模糊时才用；单行 bug 修复、琐碎改动、需求已明确的简单任务、紧急 hotfix 则不建议套用 claude-code:349-361 。也就是说，七阶段是"针对某一类任务的固定模板"，而非所有请求的通用拆分算法。

#### 2. 其它插件用完全不同的拆分方式
以 `code-review` 插件为例，它的 `/code-review` 命令拆分逻辑与 feature-dev 完全不同：按角色能力分工（CLAUDE.md 合规 sonnet 代理 ×2、bug 检测 opus 代理 ×2），检测完再对每条发现单独派发验证子代理，是"检测 + 逐条验证"两阶段结构，而不是七阶段 claude-code:30-55 。

#### 3. 插件市场里还有更多不同结构的工作流
`plugins/README.md` 列出的其他插件（如 `commit-commands`、`hookify`、`ralph-wiggum`、`pr-review-toolkit` 等）各自有独立的命令和代理组合，拆分方式服务于各自任务本质（git 操作、规则生成、循环迭代、PR 多维度审查等），并不共享 feature-dev 的七阶段结构 claude-code:13-27 。

### 结论

七阶段拆分只是"`/feature-dev` 命令"这一个具体 slash command 的固定 prompt 模板，用于处理复杂新功能类需求 claude-code:1-16 。不同性质的任务（代码审查、git 操作、规则创建等）在这个仓库里各自有专属的、结构不同的拆分方式，且是否触发某个流程本身也依赖于任务类型的匹配，而非一套通用算法自动决定。

### Notes

- 目前索引中没有找到"元层面的路由逻辑"（即一个统一的调度器根据需求类型自动选择该用哪个插件/流程），这类判断依赖于用户或 Claude 主动选择调用哪个 slash command。
- 若想确认是否存在这样的路由/调度代码，需要进一步查看 Claude Code 核心的命令分发机制，这可能不在当前索引覆盖范围内，建议开启 Devin session 做进一步代码搜索。

Wiki pages you might want to explore:
- [Official Plugins (anthropics/claude-code)](/wiki/anthropics/claude-code#5)
- [Feature Development Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.3)

### Citations

**File:** plugins/feature-dev/commands/feature-dev.md (L1-16)
```markdown
---
description: Guided feature development with codebase understanding and architecture focus
argument-hint: Optional feature description
---

# Feature Development

You are helping a developer implement a new feature. Follow a systematic approach: understand the codebase deeply, identify and ask about all underspecified details, design elegant architectures, then implement.

## Core Principles

- **Ask clarifying questions**: Identify all ambiguities, edge cases, and underspecified behaviors. Ask specific, concrete questions rather than making assumptions. Wait for user answers before proceeding with implementation. Ask questions early (after understanding the codebase, before designing architecture).
- **Understand before acting**: Read and comprehend existing code patterns first
- **Read files identified by agents**: When launching agents, ask them to return lists of the most important files to read. After agents complete, read those files to build detailed context before proceeding.
- **Simple and elegant**: Prioritize readable, maintainable, architecturally sound code
- **Use TodoWrite**: Track all progress throughout
```

**File:** plugins/feature-dev/commands/feature-dev.md (L20-125)
```markdown
## Phase 1: Discovery

**Goal**: Understand what needs to be built

Initial request: $ARGUMENTS

**Actions**:
1. Create todo list with all phases
2. If feature unclear, ask user for:
   - What problem are they solving?
   - What should the feature do?
   - Any constraints or requirements?
3. Summarize understanding and confirm with user

---

## Phase 2: Codebase Exploration

**Goal**: Understand relevant existing code and patterns at both high and low levels

**Actions**:
1. Launch 2-3 code-explorer agents in parallel. Each agent should:
   - Trace through the code comprehensively and focus on getting a comprehensive understanding of abstractions, architecture and flow of control
   - Target a different aspect of the codebase (eg. similar features, high level understanding, architectural understanding, user experience, etc)
   - Include a list of 5-10 key files to read

   **Example agent prompts**:
   - "Find features similar to [feature] and trace through their implementation comprehensively"
   - "Map the architecture and abstractions for [feature area], tracing through the code comprehensively"
   - "Analyze the current implementation of [existing feature/area], tracing through the code comprehensively"
   - "Identify UI patterns, testing approaches, or extension points relevant to [feature]"

2. Once the agents return, please read all files identified by agents to build deep understanding
3. Present comprehensive summary of findings and patterns discovered

---

## Phase 3: Clarifying Questions

**Goal**: Fill in gaps and resolve all ambiguities before designing

**CRITICAL**: This is one of the most important phases. DO NOT SKIP.

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

---

## Phase 6: Quality Review

**Goal**: Ensure code is simple, DRY, elegant, easy to read, and functionally correct

**Actions**:
1. Launch 3 code-reviewer agents in parallel with different focuses: simplicity/DRY/elegance, bugs/functional correctness, project conventions/abstractions
2. Consolidate findings and identify highest severity issues that you recommend fixing
3. **Present findings to user and ask what they want to do** (fix now, fix later, or proceed as-is)
4. Address issues based on user decision

---

## Phase 7: Summary

**Goal**: Document what was accomplished

**Actions**:
1. Mark all todos complete
2. Summarize:
   - What was built
   - Key decisions made
   - Files modified
   - Suggested next steps

---
```

**File:** plugins/feature-dev/README.md (L349-361)
```markdown
## When to Use This Plugin

**Use for:**
- New features that touch multiple files
- Features requiring architectural decisions
- Complex integrations with existing code
- Features where requirements are somewhat unclear

**Don't use for:**
- Single-line bug fixes
- Trivial changes
- Well-defined, simple tasks
- Urgent hotfixes
```

**File:** plugins/README.md (L13-27)
```markdown
| Name | Description | Contents |
|------|-------------|----------|
| [agent-sdk-dev](./agent-sdk-dev/) | Development kit for working with the Claude Agent SDK | **Command:** `/new-sdk-app` - Interactive setup for new Agent SDK projects<br>**Agents:** `agent-sdk-verifier-py`, `agent-sdk-verifier-ts` - Validate SDK applications against best practices |
| [claude-opus-4-5-migration](./claude-opus-4-5-migration/) | Migrate code and prompts from Sonnet 4.x and Opus 4.1 to Opus 4.5 | **Skill:** `claude-opus-4-5-migration` - Automated migration of model strings, beta headers, and prompt adjustments |
| [code-review](./code-review/) | Automated PR code review using multiple specialized agents with confidence-based scoring to filter false positives | **Command:** `/code-review` - Automated PR review workflow<br>**Agents:** 5 parallel Sonnet agents for CLAUDE.md compliance, bug detection, historical context, PR history, and code comments |
| [commit-commands](./commit-commands/) | Git workflow automation for committing, pushing, and creating pull requests | **Commands:** `/commit`, `/commit-push-pr`, `/clean_gone` - Streamlined git operations |
| [explanatory-output-style](./explanatory-output-style/) | Adds educational insights about implementation choices and codebase patterns (mimics the deprecated Explanatory output style) | **Hook:** SessionStart - Instructs educational context at the start of each session |
| [feature-dev](./feature-dev/) | Comprehensive feature development workflow with a structured 7-phase approach | **Command:** `/feature-dev` - Guided feature development workflow<br>**Agents:** `code-explorer`, `code-architect`, `code-reviewer` - For codebase analysis, architecture design, and quality review |
| [frontend-design](./frontend-design/) | Create distinctive, production-grade frontend interfaces that avoid generic AI aesthetics | **Skill:** `frontend-design` - Auto-invoked for frontend work, providing guidance on bold design choices, typography, animations, and visual details |
| [hookify](./hookify/) | Easily create custom hooks to prevent unwanted behaviors by analyzing conversation patterns or explicit instructions | **Commands:** `/hookify`, `/hookify:list`, `/hookify:configure`, `/hookify:help`<br>**Agent:** `conversation-analyzer` - Analyzes conversations for problematic behaviors<br>**Skill:** `writing-rules` - Guidance on hookify rule syntax |
| [learning-output-style](./learning-output-style/) | Interactive learning mode that requests meaningful code contributions at decision points (mimics the unshipped Learning output style) | **Hook:** SessionStart - Encourages users to write meaningful code (5-10 lines) at decision points while receiving educational insights |
| [plugin-dev](./plugin-dev/) | Comprehensive toolkit for developing Claude Code plugins with 7 expert skills and AI-assisted creation | **Command:** `/plugin-dev:create-plugin` - 8-phase guided workflow for building plugins<br>**Agents:** `agent-creator`, `plugin-validator`, `skill-reviewer`<br>**Skills:** Hook development, MCP integration, plugin structure, settings, commands, agents, and skill development |
| [pr-review-toolkit](./pr-review-toolkit/) | Comprehensive PR review agents specializing in comments, tests, error handling, type design, code quality, and code simplification | **Command:** `/pr-review-toolkit:review-pr` - Run with optional review aspects (comments, tests, errors, types, code, simplify, all)<br>**Agents:** `comment-analyzer`, `pr-test-analyzer`, `silent-failure-hunter`, `type-design-analyzer`, `code-reviewer`, `code-simplifier` |
| [ralph-wiggum](./ralph-wiggum/) | Interactive self-referential AI loops for iterative development. Claude works on the same task repeatedly until completion | **Commands:** `/ralph-loop`, `/cancel-ralph` - Start/stop autonomous iteration loops<br>**Hook:** Stop - Intercepts exit attempts to continue iteration |
| [security-guidance](./security-guidance/) | Security reminder hook that warns about potential security issues when editing files | **Hook:** PreToolUse - Monitors 9 security patterns including command injection, XSS, eval usage, dangerous HTML, pickle deserialization, and os.system calls |
```

## Q4

所以子任务的拆分依据是什么

## 拆分依据总结

在这个仓库里，"拆分依据"不是一套统一的算法，而是每个 slash command 的作者根据任务性质手写的固定 prompt 模板；但把 `feature-dev` 和 `code-review` 两个插件放在一起看，可以归纳出几条共通的设计依据：

---

### 1. 按"关注点/角色"划分（Separation of Concerns）

每个子代理被赋予一个**明确且不重叠的关注点**，而不是所有代理做一样的事：

- `feature-dev` 的探索阶段要求每个 `code-explorer` 代理"聚焦不同方面（相似功能、架构、用户体验等）" claude-code:40-53 ；架构设计阶段按"最小改动 / 整洁架构 / 务实平衡"三种取向划分 `code-architect` 代理 claude-code:73-82 ；质量审查阶段按"简洁性/DRY、bug/正确性、项目约定"三个维度划分 `code-reviewer` 代理 claude-code:101-109 。
- `code-review` 插件则按"CLAUDE.md 合规检查" vs "bug/逻辑问题检测"划分职责，agent 1+2 专管规范合规，agent 3+4 专管 bug 扫描 claude-code:30-55 。

### 2. 按"流程阶段"划分（Sequential Gate）

任务被拆成有严格先后依赖的阶段，前一阶段的产出是后一阶段的输入，且某些阶段设置了"不可跳过"的硬性关卡：

- `feature-dev` 里 Discovery → Exploration → Clarifying Questions → Architecture → Implementation → Review → Summary 七个阶段依次执行，且 Phase 3（澄清问题）被标注为 "CRITICAL...DO NOT SKIP"，Phase 5（实现）被标注为 "DO NOT START WITHOUT USER APPROVAL" claude-code:57-97 。
- `code-review` 里则是"检测阶段"完成后，才对每条发现的问题派发"验证子代理"进行二次确认 claude-code:30-55 ，形成"生成 → 验证"两段式依赖。

### 3. 并行化以提升覆盖面/降低误报

同一阶段内的子代理是并行启动的，目的是要么扩大覆盖面（多角度探索/审查），要么通过独立重复检测来交叉验证、降低单个代理的偏差或误报率，例如 `code-review` 中 agent 3、4 是两个独立的 Opus bug 代理并行跑，且发现的每条问题都要再经过独立验证代理确认 claude-code:30-55 。

### 4. 按任务本质匹配不同的插件模板

拆分方式最终取决于任务属于"构建型"还是"审查型"：`feature-dev` 服务于"新功能开发"这一任务类型 claude-code:349-355 ，`code-review` 服务于"PR 代码审查"这一任务类型，二者在插件市场（`plugins/README.md`）中作为独立条目并列存在，各自拥有独立的 command 与 agent 组合 claude-code:17-20 。

### Notes

- 这些拆分依据全部体现在具体的 markdown prompt 文件里（`commands/*.md`），是写给 Claude 主代理看的指令模板，不是可编程调用的算法或调度器代码。
- 目前索引范围内没有发现更底层的、跨插件统一的"任务分解引擎"代码；如果这类机制存在于 Claude Code 核心（而非插件层），建议开启 Devin session 进一步搜索核心代码库。

Wiki pages you might want to explore:
- [Official Plugins (anthropics/claude-code)](/wiki/anthropics/claude-code#5)
- [Feature Development Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.3)

### Citations

**File:** plugins/feature-dev/commands/feature-dev.md (L40-53)
```markdown
**Actions**:
1. Launch 2-3 code-explorer agents in parallel. Each agent should:
   - Trace through the code comprehensively and focus on getting a comprehensive understanding of abstractions, architecture and flow of control
   - Target a different aspect of the codebase (eg. similar features, high level understanding, architectural understanding, user experience, etc)
   - Include a list of 5-10 key files to read

   **Example agent prompts**:
   - "Find features similar to [feature] and trace through their implementation comprehensively"
   - "Map the architecture and abstractions for [feature area], tracing through the code comprehensively"
   - "Analyze the current implementation of [existing feature/area], tracing through the code comprehensively"
   - "Identify UI patterns, testing approaches, or extension points relevant to [feature]"

2. Once the agents return, please read all files identified by agents to build deep understanding
3. Present comprehensive summary of findings and patterns discovered
```

**File:** plugins/feature-dev/commands/feature-dev.md (L57-97)
```markdown
## Phase 3: Clarifying Questions

**Goal**: Fill in gaps and resolve all ambiguities before designing

**CRITICAL**: This is one of the most important phases. DO NOT SKIP.

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

**File:** plugins/feature-dev/README.md (L349-355)
```markdown
## When to Use This Plugin

**Use for:**
- New features that touch multiple files
- Features requiring architectural decisions
- Complex integrations with existing code
- Features where requirements are somewhat unclear
```

**File:** plugins/README.md (L17-20)
```markdown
| [code-review](./code-review/) | Automated PR code review using multiple specialized agents with confidence-based scoring to filter false positives | **Command:** `/code-review` - Automated PR review workflow<br>**Agents:** 5 parallel Sonnet agents for CLAUDE.md compliance, bug detection, historical context, PR history, and code comments |
| [commit-commands](./commit-commands/) | Git workflow automation for committing, pushing, and creating pull requests | **Commands:** `/commit`, `/commit-push-pr`, `/clean_gone` - Streamlined git operations |
| [explanatory-output-style](./explanatory-output-style/) | Adds educational insights about implementation choices and codebase patterns (mimics the deprecated Explanatory output style) | **Hook:** SessionStart - Injects educational context at the start of each session |
| [feature-dev](./feature-dev/) | Comprehensive feature development workflow with a structured 7-phase approach | **Command:** `/feature-dev` - Guided feature development workflow<br>**Agents:** `code-explorer`, `code-architect`, `code-reviewer` - For codebase analysis, architecture design, and quality review |
```
