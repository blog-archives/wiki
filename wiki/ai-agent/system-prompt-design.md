---
title: 系统提示词设计
updated: "2026-09-20"
---

**导语**：本页整理 Agent 系统提示词的组织方式，目前以 Codex CLI 的提示词为样本。它把提示词分成**身份与能力 → 工作方式 → 工具规范**三层，主体「工作方式」再按自主性、计划、执行、验证、输出逐段约束行为。最值得借鉴的是四类可复制写法：**指令优先级、计划状态机、验证分层、输出格式规范**。

## 一、Codex 系统提示词的结构

**Codex 的提示词是「三层结构」：身份与能力、工作方式、工具规范。** 第一部分只有几行，交代运行环境、能做什么（接收提示、流式沟通、发工具调用），并用一句话消歧义——"Codex refers to the open-source agentic coding interface (not the old Codex language model built by OpenAI)"。第二部分是主体，按行为主题分段（Personality / AGENTS.md / Autonomy / Planning / Task execution / Validating / Ambition / Presenting）。第三部分只讲具体工具怎么用。

### 值得学习的四类写法

1. **指令优先级被显式写死。** AGENTS.md 的 scope 与优先级有完整规则：scope 是所在目录的整棵子树、深层文件覆盖浅层，且 "Direct system/developer/user instructions (as part of a prompt) take precedence over AGENTS.md instructions"。**把「谁覆盖谁」写成规则而不是让模型猜**，是避免项目约定与系统指令打架的关键。

2. **计划（plan）带状态机和正反例。** 规定 exactly one item `in_progress`、"Do not jump an item from pending to completed: always set it to in_progress first"、不许事后批量补勾，并给出 3 组高质量 plan 和 3 组低质量 plan 对照。**用具体正反例定义「什么算好计划」**，比抽象要求「计划要清晰」有效得多。

3. **验证「先窄后宽」且带成本意识。** "start as specific as possible to the code you changed" 再逐步扩到更广的测试；无测试的代码库不加测试、无 formatter 不加 formatter、格式问题最多迭代 3 次后就交付并说明。**「该不该主动验证」还绑定审批模式**：`never` 可主动跑测试，`untrusted`/`on-request` 先等用户确认。

4. **输出格式规范细到可执行。** 最终答复有完整的 header / bullet / monospace / file reference 规则，并按改动规模规定 verbosity（小改动 2–5 句、无标题），还列出 Don't 清单。**把「怎么说话」也当成可验收的规格**，是让 agent 输出稳定的前提。

### 其他可借鉴点

- **自主性默认开启**：除非用户明确要计划、问代码或头脑风暴，否则默认动手改代码——"it's bad to output your proposed solution in a message"。
- **Ambition vs. precision 按上下文切换**：全新项目放开手脚，既有代码库 "with surgical precision"、最小改动。
- **角色边界消歧义**：开头一句话避免与旧 Codex 语言模型混淆。
- **工具规范单列**：`apply_patch` 明确是 FREEFORM、不要包 JSON，并给出 patch 语法与示例；shell 部分规定优先 `rg`、并行工具调用。
- **不越界**：不修无关 bug、不主动 commit/建分支、不加 license header、不加内联注释、不用单字母变量。
- **一个提示缺口**：`## Responsiveness` 是空标题、没有内容，可作为「提示词需要 lint」的实例。

## See Also

- [AI Agent 面试题清单（120 题）](interview-question-checklist.md) — 第 04 模块「Prompt 与结构化输出」对应本页。

