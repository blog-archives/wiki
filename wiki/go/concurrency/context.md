---
title: "Go 并发模式：上下文处理"
updated: "2026-09-28"
tags:
  - golang
  - go
  - concurrency
  - context
---

> 本文整理自 [Go Concurrency Patterns: Context](https://go.dev/blog/context)。

```go
// Context 会传递截止时间、取消信号以及请求作用域内的值跨 API 边界。
// 其方法可安全地供多个线程同时使用 goroutine。
type Context interface {
    // Done 方法返回一个通道，该通道会在当前 Context 被取消时关闭否则超时。
    Done() <-chan struct{}

    // Err 用于说明该上下文被取消的原因，需在 Done 通道之后调用已关闭。
    Err() error

    // Deadline 返回该上下文将被取消的时间（若存在）。
    Deadline() (deadline time.Time, ok bool)

    // Value 方法返回与键关联的值，若不存在则返回 nil。
    Value(key interface{}) interface{}
}
```

Context 接口没有设计 Cancel 方法，和 Done 通道被限定为只读通道的逻辑一致：取消信号的接收方大多不是信号的发起方。当父流程开启多个 goroutine 执行各类子任务时，必须避免子任务拥有取消父上下文的能力，防止下游随意终止整条上层业务链路造成逻辑混乱。因此触发取消的权限不会封装在 Context 接口内，而是交由 WithCancel 函数额外返回独立的 cancel 函数，只有创建该上下文的代码持有取消权限，既能做到按需终止当前上下文及其衍生的所有子上下文，又能保证取消仅自上而下传递，子流程无法反向影响父流程。

## 派生上下文

context 包提供了一些函数，可以用来从已有的值中推导出新的 Context 值。这些值构成了一棵树结构：当某个 Context 被取消时，所有由它派生出的 Contexts 值也会被取消。

Background 是任何 Context 树的根节点；它永远不会被取消：

```go
// Background 返回一个空的 Context。
// 该 Context 永远不会被取消，没有截止时间，且无任何值。
// Background 通常用于 main、init 以及测试场景中，并作为传入请求的顶级上下文。
func Background() Context
```

WithCancel 和 WithTimeout 返回的是派生出的 Context 值，这些值可以比父级 Context 更早被取消。与传入请求相关的 Context 通常在请求处理程序返回时会被取消。 WithCancel 在同时使用多个副本时，对于取消重复请求也非常有用。 WithTimeout 则适用于为后端服务器的请求设定截止日期。

需要注意的是，派生 Context 只能收紧父级的取消时机，而不能将其推迟。即便子 Context 设置了更晚的超时，或更迟才调用 cancel，只要父级 Context 生命周期结束，其下所有派生 Context 都会一并取消。换言之，子 Context 的有效存活时间不会超过父级；WithTimeout 最终取的是自身截止时间与父级截止时间中较早的那个。

```go
// WithCancel 返回父上下文的副本，其 Done 通道会在以下情况触发关闭
// parent.Done 已关闭，或已调用 cancel。
func WithCancel(parent Context) (ctx Context, cancel CancelFunc)

// A CancelFunc cancels a Context.
type CancelFunc func()

// WithTimeout 返回父上下文的副本，其 Done 通道会在以下情况发生时立即关闭
// parent.Done 通道关闭、调用 cancel 函数，或超时到期时触发。此时新的
// 上下文的截止时间为当前时间加超时时间与父级截止时间两者中的较早者，前提是
// 任意值。若定时器仍在运行，取消函数会释放其资源。
func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)
```

WithValue 提供了一种将请求级值与 Context 关联的方法：

```go
// WithValue 会返回 parent 的副本，该副本的 Value 方法针对指定 key 返回 val。
func WithValue(parent Context, key interface{}, val interface{}) Context
```
