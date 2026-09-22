---
title: 模型调用错误处理：策略设计与 Eino 实现
updated: "2026-09-22"
order: 6.1
aliases:
  - ai-agent/eino-model-retry-and-failover
---

> 本文整理自 DeepWiki 的 [Codex](../raw/2026-09-22-121838.md)、[Claude Code](../raw/2026-09-22-121839.md) 与 [Eino](../raw/2026-09-22-121840.md) 问答，以前两者的错误处理设计为参考，再用 Eino 展示实现方式。

**模型调用失败后，关键是判断再次尝试能否改变结果。** 瞬时故障可以等待重试，模型不可用可以切换候选，输入有问题需要修正，认证或额度等阻塞则应停止并说明原因。重试次数、等待时间和任务总预算共同约束这条恢复流程。

## Codex：错误分类驱动恢复流程

**Codex 分别在请求层和采样循环层处理失败。** 请求层负责发送与传输恢复；错误向上返回后，采样循环把它归一化为 `CodexErr`，根据 `is_retryable()` 决定是否再次调用模型。两层各自计数，不能将它们简单理解成非流式与流式的区别。[请求层配置](../raw/2026-09-22-113555.md)；[采样循环与恢复处理器](../raw/2026-09-22-121838.md#q6)。

```text
构造 Prompt → 调用模型（请求层可先重试）
  ├─ 成功 → 返回结果，继续 Agent 循环
  └─ 失败 → 映射错误，判断是否可重试
       ├─ 不可重试 → 更新必要状态，结束本轮
       └─ 可重试 → 等待后重新进入采样循环
                    └─ 常规预算耗尽 → 尝试切换传输
                                      ├─ 成功 → 重置计数，继续
                                      └─ 失败 → 返回最终错误
```

**错误的语义比状态码更重要。** 请求超时、断流、可恢复限流等可以进入恢复；上下文超限、额度耗尽、非法请求等不做该层的常规重试。上下文超限先标记窗口已满，额度耗尽先更新限额快照，再返回错误。尤其不能把“短期限流”与“账户额度耗尽”都当成等一会就能解决的问题。[错误映射与分类](../raw/2026-09-22-121838.md#q3)。

| 恢复分支 | 具体动作 |
| --- | --- |
| 常规重试 | 增加计数，优先使用错误携带的建议延迟，否则调用本地 `backoff`；等待后重新构造 Prompt 并发起请求 |
| 传输降级 | 常规预算耗尽且允许切换时，从 WebSocket 改为 HTTPS，重置计数；模型不变 |
| 特定连接失败 | 开启 `UnboundedConnectionRetries`、属于 Sampling、非内部会话且非 Bedrock 时，独立计数，等待从 `5` 秒倍增至 `60` 秒封顶 |
| 最终失败 | 向客户端报告具体错误并结束本轮，后续用户输入仍可发起新一轮 |

**“某错误在采样层不可重试”，不代表请求层之前没有尝试恢复。** 例如 HTTP 过载可以先耗尽请求层预算，最终才返回 `ServerOverloaded`；WebSocket 流中收到同类终态错误，则不会再重连或切换 HTTPS。服务端等待提示也只在相应路径生效，不能把采样层的 `retry_delay()` 规则推广到所有 HTTP 请求。[行为测试](../raw/2026-09-22-121838.md#q2)。

**值得借鉴的是分层恢复与明确的终态，而不是照搬每个例外。** 应用应对 SDK 重试、流恢复和备用模型尝试设置总预算；恢复模型调用也不能变成无条件重放已经执行的工具。材料中的 `compact_model_fallback` 专用于上下文压缩，不能当作普通采样自动换模型的依据。

## Claude Code：改变导致失败的条件

**Claude Code 的材料来自变更日志，主要参考其策略选择。** 它展示了等待之外的几种恢复动作，但不足以确定完整的核心重试次数和退避参数。[原始变更记录](../raw/2026-09-22-121839.md)。

| 失败情形 | 处理策略 |
| --- | --- |
| 主模型过载或不可用 | 按配置顺序尝试备用模型，`fallbackModel` 支持最多三个候选 |
| 非预期、不可重试的 API 错误 | 在备用模型上再尝试一次 turn；认证、限流、请求大小和传输错误排除在这条 fallback 策略之外 |
| 主模型不存在 | 切到 `--fallback-model`，并在剩余会话中持续使用 |
| 模型生成畸形工具调用 | 从重试上下文中移除坏输出，再尝试生成 |
| 凭证失效 | 暴露重新认证需求，避免无效重试后只给通用失败提示 |
| `/goal` 长任务出错 | 可恢复时退避或暂停并说明原因；不可恢复时清理目标状态并提示 |

**这些策略分别改变模型、输入或任务状态。** 在原模型上不值得重试，不等于换模型也无效；但共享同一额度或凭证问题时，换模型通常也不能解除阻塞。长任务的暂停与恢复属于应用职责，不能只靠底层重试循环解决。

## 用 Eino 实现：分类、重试，再决定是否切换

**Eino 提供执行机制，应用填入自己的错误策略。** `ModelRetryConfig` 控制当前模型的重试，`ModelFailoverConfig` 控制备用模型；内部是 *retry 在内、failover 在外*。当前模型成功就返回，不可重试或重试耗尽后才交给外层判断是否切换，新模型也经过相同的重试配置。[Eino 组合用法](../raw/2026-09-22-121840.md#q2)。

下面保留组装核心，省略 imports、模型初始化和 Provider 错误适配。`primary`、`backup` 是已初始化的模型；`retryable` 与 `failoverAllowed` 是应用提供的分类函数，并非 Eino API。示例未针对固定依赖版本编译验证。

```go
agent, err := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
    Name:  "resilient_agent",
    Model: primary,
    ModelRetryConfig: &adk.ModelRetryConfig{
        MaxRetries: 2,
        ShouldRetry: func(ctx context.Context, rc *adk.RetryContext) *adk.RetryDecision {
            if ctx.Err() != nil {
                return &adk.RetryDecision{RewriteError: ctx.Err()}
            }
            return &adk.RetryDecision{
                Retry: rc.Err != nil && retryable(rc.Err),
            }
        },
        // 默认采用指数退避与抖动；可用 BackoffFunc 替换。
    },
    ModelFailoverConfig: &adk.ModelFailoverConfig[*schema.Message]{
        MaxRetries: 1,
        ShouldFailover: func(ctx context.Context, _ *schema.Message, err error) bool {
            if ctx.Err() != nil || err == nil {
                return false
            }
            var exhausted *adk.RetryExhaustedError
            if errors.As(err, &exhausted) {
                err = exhausted.LastErr
            }
            return err != nil && failoverAllowed(err)
        },
        GetFailoverModel: func(
            _ context.Context, _ *adk.FailoverContext[*schema.Message],
        ) (model.BaseChatModel, []*schema.Message, error) {
            return backup, nil, nil // 换模型，沿用输入。
        },
    },
})
```

**分类器落实前面的策略分工。** `retryable` 接纳调用级瞬时超时、可恢复限流等，排除永久配置错误；`failoverAllowed` 判断备用模型是否有机会消除失败原因，遇到 `RetryExhaustedError` 时先取 `LastErr`。如果实际运行 Agent 的 `ctx` 已取消或到期，两条路径都应停止。备用模型还需要支持当前工具协议、消息模态和输出要求。

**输出或输入需要修正时，在 `ShouldRetry` 中返回下一次尝试的变化。** 它既能检查 `rc.Err`，也能检查 `rc.OutputMessage`；`ModifiedInputMessages` 可替换输入，`AdditionalOptions` 可调整模型选项，`Backoff` 可指定此次等待，`RewriteError` 可将不可接受的结果转成最终错误。这样可以实现“清理坏输出、修正上下文再试”，而不只是重发原请求。[配置字段与语义](https://github.com/cloudwego/eino/blob/main/adk/retry_chatmodel.go)。

**最后保留两个应用层约束：总预算与流式结果管理。** 示例中每个模型最多初次调用加 `2` 次重试，最多切换 `1` 次，因此 wrapper 层上限为 `(1 + 2) × (1 + 1) = 6` 次，不含 SDK 内部重试；总时限应放在运行 Agent 的上下文上。流式事件中的 `WillRetryError` 表示仍在恢复，应用应继续消费，并标记或清理失败尝试已展示的片段。[Eino 事件与组合说明](../raw/2026-09-22-121840.md)。

> **Status: Disputed** — 原问答所称“只呈现最终结果”对流式 UI 过强：框架提供重试信号，但不自动撤回应用已展示的内容。

**以上 Eino 配置实现的是模型重试与故障转移。** Codex 的传输降级需要 Provider 客户端支持，Claude Code 式长任务暂停、恢复则需要应用维护任务状态，不由这两个配置项自动提供。

Raw: [Codex](../raw/2026-09-22-121838.md)；[Claude Code](../raw/2026-09-22-121839.md)；[Eino](../raw/2026-09-22-121840.md)；[早期资料](../raw/2026-09-22-113555.md)。实现描述限于所附快照，未提供提交号。
