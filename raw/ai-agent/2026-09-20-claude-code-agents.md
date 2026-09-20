# Claude Code 中预先定义的 Agent

> Source: 用户提供的 Claude Code agent 梳理（DeepWiki Q&A）
> Collected: 2026-09-20
> Published: Unknown

## Claude Code 中预先定义的 Agent

梳理 Claude Code 引擎内置的 agent 类型体系，以及各官方插件随附的预定义 subagent（.md 文件）。快速入口：内置类型定义见 [1b][1c]，agent 生成/校验流程见 [2a]-[2c]，feature-dev 三件套见 [3a]-[3c]，pr-review-toolkit 六个审查 agent 见 [4a]-[4f]。

### 1. 引擎如何向模型提供（offer）与派发（spawn）一个内置 Agent 类型

描述引擎类型层：当模型看到 Agent 工具列表、并用 subagent_type 派发子代理时，engine 如何标记 general-purpose/Explore/Plan 等内置类型

### 1a. AgentOfferInput.agent (`claude-code.d.ts:186`)

列出候选 agent 类型名，供 agent.offer 钩子的 matcher 判断

```text
agent: string; // 'Explore', 'Plan', a plugin's agent
```

### 1b. 标记来源为 built-in (`claude-code.d.ts:198`)

区分内置 agent 与插件/用户自定义 agent 的关键字段

```text
source: string; // 'built-in', 'plugin', a settings source
```

### 1c. 内置 agent 的 provider 标识 (`claude-code.d.ts:203`)

engine/core 即为预先定义的内置 agent，如 general-purpose

```text
provider: Origin; // { plugin: 'engine', tier: 'core' } for a built-in
```

### 1d. AgentSpawnInput.subagentType (`claude-code.d.ts:254`)

Agent 工具调用时实际解析出的目标 agent 定义名

```text
subagentType: string; // 'general-purpose', 'Explore', a plugin's agent, 'fork'
```

### 1e. AgentInfo.type (`claude-code.d.ts:131`)

$.agent.list() 中展示当前运行的子代理所属的（内置或插件）agent 类型

```text
type: string; // the agent definition it runs as (general-purpose, Explore, ...)
```

### 1f. Hook 输入携带 agent_type (`claude-code.d.ts:599`)

PreToolUse 等 hook 触发时，若发生在子代理内，附带其所属 agent 类型名

```text
agent_type?: string; // e.g. 'general-purpose', 'code-reviewer'
```

### 2. 开发者创建、生成并校验一个新的插件 Agent 文件

plugin-dev 插件自身携带的元-agent，构成从生成到校验预定义 agent 的完整闭环

### 2a. agent-creator 写出新 agent 文件 (`agent-creator.md:112`)

根据用户描述生成带 frontmatter（name/description/model/color/tools）的 agent 定义文件

```text
Use the Write tool to create `agents/[identifier].md`
```

### 2b. 创建后建议校验 (`agent-creator.md:130`)

agent-creator 完成后主动引导调用 plugin-validator

```text
Suggest running validation: `Use the plugin-validator agent to check the plugin structure`
```

### 2c. plugin-validator 扫描并校验 agent 定义 (`plugin-validator.md:87`)

遍历 agents/ 目录，逐个校验命名规则、frontmatter 完整性、模型/颜色取值合法性

```text
Use Glob to find `agents/**/*.md` ... check frontmatter with name, description, model, color
```

### 2d. 调用外部校验脚本 (`plugin-validator.md:89`)

复用 agent-development skill 提供的 shell 脚本做结构化校验

```text
Use the validate-agent.sh utility from agent-development skill
```

### 2e. skill-reviewer 审查配套 skill (`skill-reviewer.md:49`)

与 agent 校验并列的另一元-agent，审查插件中 skill 的质量

```text
Find SKILL.md file ... Check for supporting directories (references/, examples/, scripts/)
```

### 3. feature-dev 插件三个协作 Agent 的一次功能开发流水线

code-explorer（理解现状）→ code-architect（设计方案）→ code-reviewer（审查产出），构成一次典型的开发工作流

### 3a. code-explorer 定义 (`code-explorer.md:2`)

只读工具集，负责追踪执行路径、映射架构层

```text
name: code-explorer ... tools: Glob, Grep, LS, Read, ...
```

### 3b. code-explorer 执行代码流追踪 (`code-explorer.md:22`)

先探明现有实现，为后续架构设计提供依据

```text
Follow call chains from entry to output; Trace data transformations at each step
```

### 3c. code-architect 定义 (`code-architect.md:2`)

基于 code-explorer 的发现，产出完整实现蓝图

```text
name: code-architect ... model: sonnet
```

### 3d. code-architect 输出实现蓝图 (`code-architect.md:20`)

决策式架构方案，包含具体文件级改动清单

```text
Specify every file to create or modify, component responsibilities, integration points, and data flow
```

### 3e. code-reviewer 审查实现代码 (`code-reviewer.md:33`)

开发完成后对代码变更做高置信度过滤审查，闭环整条流水线

```text
name: code-reviewer ... Only report issues with confidence >= 80
```

### 4. pr-review-toolkit 插件的多维度 PR 审查 Agent 群

PR 提交后，六个专职 agent 并行覆盖代码规范、简化、注释、测试覆盖、错误处理、类型设计等维度

### 4a. code-reviewer：规范与 bug 审查 (`code-reviewer.md:3`)

对照 CLAUDE.md 规则检测风格违规与逻辑错误

```text
This agent should be used proactively after writing or modifying code, especially before committing changes or creating pull requests
```

### 4b. code-simplifier：简化代码 (`code-simplifier.md:40`)

在不改变行为的前提下重构近期改动，提升可读性

```text
You will analyze recently modified code and apply refinements that Preserve Functionality
```

### 4c. comment-analyzer：注释准确性核查 (`comment-analyzer.md:14`)

防止注释腐化，确保文档与实现同步

```text
Verify Factual Accuracy: Cross-reference every claim in the comment against the actual code implementation
```

### 4d. pr-test-analyzer：测试覆盖分析 (`pr-test-analyzer.md:12`)

识别关键路径与边界条件的测试缺口

```text
Analyze Test Coverage Quality: Focus on behavioral coverage rather than line coverage
```

### 4e. silent-failure-hunter：静默失败审计 (`silent-failure-hunter.md:14`)

零容忍地排查 catch 块吞错、隐藏 fallback 等问题

```text
Silent failures are unacceptable - Any error that occurs without proper logging and user feedback is a critical defect
```

### 4f. type-design-analyzer：类型设计评审 (`type-design-analyzer.md:17`)

对新增/重构类型的封装性与不变量表达打分

```text
Identify Invariants: Examine the type to identify all implicit and explicit invariants
```

### 5. 其他插件的专用预定义 Agent：SDK 校验与对话分析

agent-sdk-dev 与 hookify 插件各自附带的单一目的 agent，服务于独立的插件功能

### 5a. agent-sdk-verifier-py：校验 Python SDK 应用 (`agent-sdk-verifier-py.md:15`)

在 Python Agent SDK 应用创建/修改后校验依赖与用法

```text
Verify `claude-agent-sdk` is installed (check requirements.txt, pyproject.toml, or pip list)
```

### 5b. agent-sdk-verifier-ts：校验 TS SDK 应用 (`agent-sdk-verifier-ts.md:39`)

对应的 TypeScript 版本校验 agent，含类型检查步骤

```text
Run `npx tsc --noEmit` to check for type errors
```

### 5c. conversation-analyzer：分析对话找出可预防行为 (`conversation-analyzer.md:22`)

/hookify 命令背后的 agent，从对话记录提炼可转化为 hook 规则的模式

```text
Read through user messages in reverse chronological order (most recent first)
```

### 5d. 生成正则规则供 hook 使用 (`conversation-analyzer.md:60`)

分析结果被 /hookify 命令用于生成实际的 hook 配置

```text
Convert behaviors into matchable patterns: rm\s+-rf for dangerous deletes
```

## 补充：Claude Code 会不会根据需求动态生成 agent？

## 直接回答

是的，但分两个层面，不是"凭空生成全新 agent 类型"：

1. **运行时动态生成子任务(prompt)，但复用固定的 agent 类型**：模型调用 Agent 工具时可以为 `general-purpose`、`Explore` 等已有类型编写完全自定义的 `prompt`，实现"看起来像动态生成"的效果，但其 `subagentType` 仍然是预定义的。

2. **插件可在运行时用 `$.agent.register` 真正注册新的 agent 类型**，之后 Agent 工具就能在该会话里派生该类型的 agent，这确实是"动态生成新 agent 定义"，但由插件代码触发，不是模型根据对话内容自主决定生成。

3. **工作流场景**：CHANGELOG 提到 `/config` 里有"Dynamic workflow size"设置，控制 Claude 生成动态工作流时大致会用多少个 agent(small/medium/large)，是一种建议性上限而非强制——说明 Claude 在工作流模式下确实会按需动态决定"要派生多少个/哪些 agent"，但仍是从已注册的 agent 类型池中选择、并行派生，而非现场编写全新类型定义。

---

## 详细说明

### 层面一：同一 agent 类型，不同 prompt（最常见的"动态"）

`AgentSpawnInput.subagentType` 字段决定派生哪个已有 agent 定义（`general-purpose`、`Explore`、插件 agent 或 `fork`），若名字对不上任何已知定义会直接拒绝派生。真正随场景变化的是调用时传入的 `prompt` 内容，agent *类型* 本身是固定的预定义集合。

### 层面二：插件通过 `$.agent.register` 在运行时新增类型

这是唯一能"新增一种 agent 类型"的机制：插件调用 `agent.register`，传入 `name`、`description`（何时委派）、`prompt`（系统提示词）等字段，注册后的类型立即可被 Agent 工具在后续轮次派生，命名为 `<plugin>:<name>`。这解决了"要不要让模型看到这个类型"（`agent.offer` 钩子可隐藏）与"谁能派生它"（任意插件的 `$.agent.spawn` 均可）之间的分离。但这仍然是**插件代码**主导的静态注册（写在插件的 hooks 里），不是模型在对话里临时"发明"一个 agent。

### 层面三：人工/AI 辅助编写 agent 定义文件（离线生成，非对话内动态）

`plugin-dev` 插件里的 `agent-creator` 元-agent 可以根据用户描述**生成一份新的 agent 定义文件**（`agents/[identifier].md`，含 frontmatter 与系统提示词），并建议随后用 `plugin-validator` 校验。但这属于**开发时**创建插件资产的流程，产出是静态文件，需要重启/重新加载插件才会生效，并非会话运行中按需求场景即时生成可用 agent。

### 层面四：工作流(workflow)按场景决定 agent 规模

CHANGELOG 中 2.1.202 版本提到新增"Dynamic workflow size"配置项，用于控制 Claude 生成动态工作流时大致会用的 agent 数量档位（small/medium/large），且明确是"建议性guideline，非强制上限"。同版本还新增了 `workflow.run_id`/`workflow.name` 的 OpenTelemetry 属性，用于重建工作流运行中各 agent 的活动轨迹，侧面说明工作流模式下确实会按需并行派生数量可变的 agent 实例——但它们仍是已知类型（如 `general-purpose`）的多份实例，而非全新类型。

## 小结

| 机制 | 是否算"动态生成 agent" | 触发者 | 产出 |
|---|---|---|---|
| Agent 工具自定义 `prompt` | 否，只是自定义任务内容 | 模型 | 已有类型的一次运行实例 |
| `$.agent.register` | 是，新增类型 | 插件代码 | 会话内可派生的新类型 |
| `agent-creator` | 否，属离线开发 | 开发者请求 | 静态 `.md` 定义文件 |
| Dynamic workflow size | 部分算，动态决定数量 | 模型（受配置引导） | 已有类型的多份并行实例 |

## Notes

- 没有发现"模型在对话中凭空发明全新 agent 类型并立即使用"的机制；能创建新类型的入口只有插件调用的 `agent.register`。
- CHANGELOG.md 是版本发布说明，非源码实现细节，关于 "Dynamic workflow size" 具体如何编码决策的实现代码未在检索到的片段中出现，如需深入了解具体调度逻辑，建议开启 Devin session 查看工作流调度相关源码。

Wiki pages you might want to explore:
- [System Architecture (anthropics/claude-code)](/wiki/anthropics/claude-code#1.1)
- [Code Review Plugin (anthropics/claude-code)](/wiki/anthropics/claude-code#5.2)

### Citations

**File:** mods/types/claude-code.d.ts (L184-204)
```typescript
  export type AgentOfferInput = {
      /**
       * Which type (`Explore`, `Plan`, a plugin's agent); the key a matcher
       * narrows on.
       */
      agent: string;
      /**
       * Its listing line's text as the definition states it (`whenToUse`).
       */
      description: string;
      /**
       * Where the definition came from (`built-in`, `plugin`, a settings
       * source), so a matcher tells a built-in from a user's agent of its name.
       */
      source: string;
      /**
       * Who provides this agent: the plugin and its tier; `{ plugin: "engine",
       * tier: "core" }` for a built-in. Pinned: a rewrite is refused.
       */
      provider: Origin;
  };
```

**File:** mods/types/claude-code.d.ts (L221-231)
```typescript
  export type AgentSpawnArgs = Pick<AgentSpawnInput, 'prompt'> & Partial<Pick<AgentSpawnInput, 'description' | 'subagentType' | 'model' | 'name' | 'cwd'>>;

  /**
   * The input of `agent.spawn`: what the Agent tool decided about the
   * subagent it is about to start, before its model is resolved.
   *
   * A hook rewrites content (prompt, description, subagentType, model,
   * background, cwd), read back as the tool's parameters; tool_use_id, name,
   * fork, parentModel, permissionMode, parentAgentId and provider are pinned.
   */
  export type AgentSpawnInput = {
```

**File:** mods/types/claude-code.d.ts (L254-254)
```typescript
      subagentType: string;
```

**File:** mods/types/claude-code.d.ts (L2673-2698)
```typescript
          /**
           * Defines an agent type the Agent tool dispatches from the next turn on,
           * named `<plugin>:<name>`: the event `agent.register`.
           *
           * Every field takes effect as in an agent file; re-registered, a name is
           * replaced; unloaded, a plugin's types go. `agent.offer` hides it from
           * the model alone; any plugin's `$.agent.spawn` answers to `agent.spawn`.
           *
           * @param spec `name`, `description` (when to delegate), `prompt` (its
           *             system prompt), and any other field of an agent definition
           * @returns `{ agent }`, the full name; rejects until the session binds,
           *          on a spec the schema refuses (its reason), on a hook's deny
           * @example
           * await $.agent.register({ name: "runner", description: "Runs a spec",
           *   prompt: RUNNER_PROMPT, tools: ["Read", "Bash"], omitClaudeMd: true })
           * @example
           * // runner-only: hidden from the model, spawned by this plugin's tool,
           * // answered by the subagent's turn.complete (matched by agentId)
           * on("agent.offer", { agent: "lab:runner" }, () => ({ isOffered: false }))
           * on("tool.call", { tool: "mcp__lab__run" }, async ($, e) => {
           *   const { agentId, deny } = await $.agent.spawn({
           *     subagentType: "lab:runner", prompt: e.spec, description: "run" })
           *   return { result: deny ?? (await answerOf(agentId)) }
           * })
           */
          register: (spec: AgentSpec) => Promise<OpValueOf['agent.register']>;
```

**File:** CHANGELOG.md (L2407-2408)
```markdown
- Added a "Dynamic workflow size" setting in `/config` for controlling how large Claude generally makes dynamic workflows (small/medium/large agent counts) — an advisory guideline, not an enforced cap
- Added `workflow.run_id` and `workflow.name` OpenTelemetry attributes to telemetry emitted by workflow-spawned agents, so a workflow run's activity can be reconstructed from OTel data
```
