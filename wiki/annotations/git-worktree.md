---
title: git worktree
updated: "2026-09-21"
tags:
  - git
  - worktree
  - 版本控制
  - claude-code
  - subagent
  - isolation
  - 隔离
---

**git worktree 让同一个仓库同时检出多个分支。** 普通 `git clone` 只有一个工作目录，换分支得 `git switch` 或 `git stash`；worktree 则允许在不同目录里各自检出不同分支，它们共享同一份对象库与引用，互不干扰。

## 它是怎么工作的

- **主工作树 + 链接工作树。** 原来的克隆目录是主工作树（main working tree），`git worktree add` 新建的是链接工作树（linked worktree）。
- **共享 `.git`。** 所有工作树共用主仓库的对象库与引用；链接工作树目录里只有一个 `.git` 文件，指向主仓库 `.git/worktrees/<name>/` 下的元数据。
- **各自独立的 HEAD 与索引。** 每个工作树有自己的 HEAD、index 和检出内容，所以能在 A 目录改一个分支、B 目录改另一个分支。
- **分支独占。** 同一个分支不能同时在两个工作树里检出，git 会直接拒绝，避免两处提交互相打架。

常用命令：`git worktree add <path> <branch>` 新建、`git worktree list` 列出、`git worktree remove <path>` 删除、`git worktree prune` 清理失效记录、`git worktree lock` / `unlock` 加锁以防被自动清理。

适用场景：一边在 feature 分支写代码、一边在另一目录跑 main 的构建或热修复；或并行跑多套测试，免去反复 stash / switch。

从 git 内部看，一个 worktree 由三个路径描述：工作树顶层目录 `toplevel`、它自己的 git 目录 `gitDir`（即 `.git/worktrees/<name>`）、以及所有工作树共享的公共 git 目录 `commonDir`。例如名为 `wt` 的链接工作树：

```
/main/wt                    # 工作树目录（toplevel）
/main/.git/worktrees/wt     # 它自己的 git 目录（gitDir）
/main/.git                  # 公共 git 目录（commonDir）
```

对它执行 git 命令时会带上 `--git-dir` 与 `--work-tree`，分别指向上面后两者。Claude Code 正是用这三个路径来表示一个 worktree（见 `mods/diff/hooks/git/types/repository/repository.ts`）。

## Claude Code 怎么用它

**Claude Code 把 worktree 当作隔离单元**：让一个会话或 subagent 在独立目录里改代码，不碰你当前的工作目录，多个并发会话因此不会互相覆盖。

- 启动会话：`--worktree`（`-w`）。
- subagent 隔离：agent 定义里写 `isolation: "worktree"`，在临时 worktree 中工作。
- 运行期切换：`EnterWorktree` / `ExitWorktree` 工具；进入项目 `.claude/worktrees/` 之外的 worktree 前会先询问确认。
- 基线选择：`worktree.baseRef` 取 `fresh`（从 `origin/<default>` 建，默认）或 `head`（从本地 `HEAD` 建）。
- 清理：agent 结束后自动解锁，配合 `git worktree remove` / `prune`；另有周期 sweep 回收孤立锁。

历史上还多次修复过隔离失效——subagent 误在主 checkout 上执行 git 命令或写文件——可见隔离边界正是这套机制的关键。
